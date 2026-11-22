#!/usr/bin/env bash
# Safe, repeatable sync & deploy from a dev machine to production (/opt/stratat).
#
# Why this script exists:
#   Production owns live runtime state that MUST NEVER be deleted or overwritten by a
#   dev machine: published articles (`scripts/content/out/`), `plan.json`, `radar-state.json`,
#   `traffic-board.json`, hero covers (`apps/www/public/media/`), server-synced corpora in
#   `apps/www/src/data/` (`releases.json`, `community.json`, `downloads.json`, `changelog.json`,
#   `vps-deals.json`, `media-manifest.json`, `*-pulse.json`), `patrol-baseline.json`, `.env`,
#   `/opt/stratat/var/`, and `.next*`.
#
# Usage:
#   DEPLOY_HOST=23.95.243.52 ./deploy/sync-and-deploy.sh --dry-run
#   DEPLOY_HOST=23.95.243.52 ./deploy/sync-and-deploy.sh                # safe sync + atomic deploy
#   DEPLOY_HOST=23.95.243.52 ./deploy/sync-and-deploy.sh --revalidate   # safe sync + <1s ISR refresh
#   DEPLOY_HOST=23.95.243.52 ./deploy/sync-and-deploy.sh --sync-only    # safe sync only (no build)
#   DEPLOY_HOST=23.95.243.52 ./deploy/sync-and-deploy.sh --sync-only --with-cron
#
# Optional local config file (gitignored): `.deploy.env` containing `DEPLOY_HOST=...` / `DEPLOY_USER=...`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.deploy.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.deploy.env"
  set +a
fi

HOST="${DEPLOY_HOST:-}"
USER="${DEPLOY_USER:-root}"
REMOTE_ROOT="${DEPLOY_REMOTE_ROOT:-/opt/stratat}"
SITE_URL="${DEPLOY_SITE_URL:-https://www.stratat.com}"
MODE="deploy"          # deploy | revalidate | sync-only
REVALIDATE_SCOPE="all"
DRY_RUN=0
WITH_CRON=0
SKIP_LOCAL_CHECK=0

usage() {
  cat <<'EOF'
Usage: deploy/sync-and-deploy.sh [options]

Modes (pick one; default is --deploy):
  --deploy              Sync code/catalog safely, run remote deploy-www.sh + live smoke check
  --revalidate [scope]  Sync code/catalog safely, run instant <1s revalidate.mjs (default scope: all)
  --sync-only           Sync code/catalog safely without rebuilding or restarting

Modifiers:
  --host <addr>         Target host (overrides DEPLOY_HOST / .deploy.env)
  --user <name>         SSH user (default: root or DEPLOY_USER)
  --dry-run             Preview rsync itemize changes; make zero remote changes
  --with-cron           Also run deploy/install-content-cron.sh on the server after syncing
  --skip-local-check    Skip local `npm test` and `apps/www` `tsc --noEmit` preflight
  -h, --help            Show this help

Protected on server (NEVER overwritten or deleted):
  .env*, .dashboard-secret, .freshness-*, var/, backups/, logs/, node_modules/
  apps/api/data/, apps/api/.env, apps/www/.next*, apps/www/patrol-baseline.json
  apps/www/public/media/
  apps/www/src/data/{releases,community,downloads,changelog,vps-deals,media-manifest,*-pulse}.json
  scripts/content/{out,.quarantine,plan.json,.plan.*.json,.state.jsonl,radar*.json,traffic-board.json}
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy)
      MODE="deploy"
      shift
      ;;
    --revalidate)
      MODE="revalidate"
      if [[ $# -ge 2 && "$2" != --* ]]; then
        REVALIDATE_SCOPE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --sync-only)
      MODE="sync-only"
      shift
      ;;
    --host)
      HOST="${2:?--host requires a value}"
      shift 2
      ;;
    --user)
      USER="${2:?--user requires a value}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --with-cron)
      WITH_CRON=1
      shift
      ;;
    --skip-local-check)
      SKIP_LOCAL_CHECK=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ -z "$HOST" ]]; then
  echo "ERROR: DEPLOY_HOST is not set. Pass --host <addr>, set DEPLOY_HOST, or create gitignored .deploy.env." >&2
  exit 64
fi

# Auth: default to standard SSH keys / ~/.ssh/config; support SSH_KEY and SSHPASS if explicitly set.
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
SSH_CMD=(ssh "${SSH_OPTS[@]}")
RSYNC_RSH="ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes"

if [[ -n "${SSH_KEY:-}" ]]; then
  SSH_CMD=(ssh -i "$SSH_KEY" "${SSH_OPTS[@]}")
  RSYNC_RSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
elif [[ -n "${SSHPASS:-}" ]]; then
  export SSHPASS
  SSH_CMD=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
  RSYNC_RSH="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
fi

TARGET="$USER@$HOST"
RSYNC_BASE=(-az --itemize-changes -e "$RSYNC_RSH")
if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC_BASE+=(--dry-run)
  echo "=== DRY RUN (no remote files will be changed) ==="
fi

# Warn (do not block) when deploying from a dirty working tree.
if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [[ -n "$(git -C "$ROOT" status --porcelain -- apps/www/src apps/www/messages scripts deploy)" ]]; then
    echo "NOTE: local code directories have uncommitted changes (syncing current working tree)."
  fi
fi

# 1. Local quality gate before transferring anything.
if [[ "$SKIP_LOCAL_CHECK" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  echo "=== 1. Local preflight (tests + typecheck) ==="
  (cd "$ROOT" && npm test)
  (cd "$ROOT/apps/www" && npx tsc --noEmit)
fi

echo "=== 2. Safe code & catalog sync → ${TARGET}:${REMOTE_ROOT} (mode=${MODE}) ==="

# Capture remote lockfile hash before sync so we know whether `pnpm install` is needed.
LOCK_BEFORE=""
if [[ "$DRY_RUN" -eq 0 && "$MODE" == "deploy" ]]; then
  LOCK_BEFORE="$("${SSH_CMD[@]}" "$TARGET" "sha256sum '$REMOTE_ROOT/pnpm-lock.yaml' '$REMOTE_ROOT/apps/www/package.json' '$REMOTE_ROOT/package.json' 2>/dev/null || true")"
fi

# Layer A: Bounded Next.js source directories (safe `--delete` ONLY inside pure code dirs).
# CRITICAL: `apps/www/src/data/` is excluded AND protected so live corpora are never touched.
rsync "${RSYNC_BASE[@]}" --delete \
  --exclude '/data/' \
  --filter 'protect /data/**' \
  --exclude '.DS_Store' \
  "$ROOT/apps/www/src/" "$TARGET:$REMOTE_ROOT/apps/www/src/"

rsync "${RSYNC_BASE[@]}" --delete --exclude '.DS_Store' \
  "$ROOT/apps/www/messages/" "$TARGET:$REMOTE_ROOT/apps/www/messages/"

rsync "${RSYNC_BASE[@]}" --delete \
  --exclude 'tmp-*.mjs' \
  --exclude '.DS_Store' \
  "$ROOT/apps/www/scripts/" "$TARGET:$REMOTE_ROOT/apps/www/scripts/"

rsync "${RSYNC_BASE[@]}" --delete --exclude '.DS_Store' \
  "$ROOT/apps/www/tests/" "$TARGET:$REMOTE_ROOT/apps/www/tests/"

if [[ -d "$ROOT/apps/www/public/fonts" ]]; then
  rsync "${RSYNC_BASE[@]}" --delete --exclude '.DS_Store' \
    "$ROOT/apps/www/public/fonts/" "$TARGET:$REMOTE_ROOT/apps/www/public/fonts/"
fi

# Top-level static public assets only (favicons, IndexNow key, brand icons).
# CRITICAL: `apps/www/public/media/` is runtime-owned and NEVER deleted or overwritten.
rsync "${RSYNC_BASE[@]}" \
  --exclude '/media/' \
  --exclude '/fonts/' \
  --filter 'protect /media/**' \
  --exclude '.DS_Store' \
  "$ROOT/apps/www/public/" "$TARGET:$REMOTE_ROOT/apps/www/public/"

# Layer B: Code-authored catalog JSON in `apps/www/src/data/` (STRICT ALLOWLIST, NO `--delete`).
# Server-owned live corpora (releases, community, downloads, changelog, vps-deals,
# media-manifest, intelligence-pulse, creator-pulse) are intentionally NOT in this list.
CATALOG_DATA_FILES=(
  benchmarks.json
  columns.json
  friendly-links.json
  gpus.json
  models.json
  topics.json
)
CATALOG_SRC=()
for f in "${CATALOG_DATA_FILES[@]}"; do
  [[ -f "$ROOT/apps/www/src/data/$f" ]] && CATALOG_SRC+=("$ROOT/apps/www/src/data/$f")
done
if [[ "${#CATALOG_SRC[@]}" -gt 0 ]]; then
  rsync "${RSYNC_BASE[@]}" "${CATALOG_SRC[@]}" "$TARGET:$REMOTE_ROOT/apps/www/src/data/"
fi

# Layer C: App & root manifests (no `--delete`).
APP_MANIFESTS=()
for f in package.json next.config.ts tsconfig.json postcss.config.mjs postcss.config.js tailwind.config.ts tailwind.config.mjs; do
  [[ -f "$ROOT/apps/www/$f" ]] && APP_MANIFESTS+=("$ROOT/apps/www/$f")
done
if [[ "${#APP_MANIFESTS[@]}" -gt 0 ]]; then
  rsync "${RSYNC_BASE[@]}" "${APP_MANIFESTS[@]}" "$TARGET:$REMOTE_ROOT/apps/www/"
fi

ROOT_MANIFESTS=()
for f in package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .gitignore; do
  [[ -f "$ROOT/$f" ]] && ROOT_MANIFESTS+=("$ROOT/$f")
done
if [[ "${#ROOT_MANIFESTS[@]}" -gt 0 ]]; then
  rsync "${RSYNC_BASE[@]}" "${ROOT_MANIFESTS[@]}" "$TARGET:$REMOTE_ROOT/"
fi

# Layer D: Automation scripts, deploy configs, docs, root contract tests (NO `--delete` on runtime dirs).
rsync "${RSYNC_BASE[@]}" \
  --exclude 'content/out/' \
  --exclude 'content/out/**' \
  --exclude 'content/.quarantine/' \
  --exclude 'content/.quarantine/**' \
  --exclude 'content/plan.json' \
  --exclude 'content/.plan.*.json' \
  --exclude 'content/.state.jsonl' \
  --exclude 'content/radar.json' \
  --exclude 'content/radar-state.json' \
  --exclude 'content/traffic-board.json' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  "$ROOT/scripts/" "$TARGET:$REMOTE_ROOT/scripts/"

rsync "${RSYNC_BASE[@]}" \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  "$ROOT/deploy/" "$TARGET:$REMOTE_ROOT/deploy/"

rsync "${RSYNC_BASE[@]}" --exclude '.DS_Store' \
  "$ROOT/docs/" "$TARGET:$REMOTE_ROOT/docs/"

if [[ -d "$ROOT/tests" ]]; then
  rsync "${RSYNC_BASE[@]}" --exclude '.DS_Store' \
    "$ROOT/tests/" "$TARGET:$REMOTE_ROOT/tests/"
fi

CORE_SRC=()
for f in index.ts goal.ts phase.ts plan.ts; do
  [[ -f "$ROOT/src/$f" ]] && CORE_SRC+=("$ROOT/src/$f")
done
if [[ "${#CORE_SRC[@]}" -gt 0 ]]; then
  rsync "${RSYNC_BASE[@]}" "${CORE_SRC[@]}" "$TARGET:$REMOTE_ROOT/src/"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "=== DRY RUN complete (mode=${MODE}, with_cron=${WITH_CRON}) ==="
  exit 0
fi

# Optional crontab sync.
if [[ "$WITH_CRON" -eq 1 ]]; then
  echo "=== 3. Syncing production crontab ==="
  "${SSH_CMD[@]}" "$TARGET" "chmod +x '$REMOTE_ROOT/deploy/install-content-cron.sh' '$REMOTE_ROOT/scripts/content/daily-guides.sh' && STRATAT_ROOT='$REMOTE_ROOT' bash '$REMOTE_ROOT/deploy/install-content-cron.sh'"
fi

case "$MODE" in
  sync-only)
    echo "=== Sync complete (--sync-only) ==="
    ;;
  revalidate)
    echo "=== 4. Instant zero-rebuild ISR revalidation (scope=${REVALIDATE_SCOPE}) ==="
    "${SSH_CMD[@]}" "$TARGET" "cd '$REMOTE_ROOT' && node scripts/revalidate.mjs --scope '$REVALIDATE_SCOPE'"
    echo "=== Revalidate complete ==="
    ;;
  deploy)
    LOCK_AFTER="$("${SSH_CMD[@]}" "$TARGET" "sha256sum '$REMOTE_ROOT/pnpm-lock.yaml' '$REMOTE_ROOT/apps/www/package.json' '$REMOTE_ROOT/package.json' 2>/dev/null || true")"
    if [[ "$LOCK_BEFORE" != "$LOCK_AFTER" ]]; then
      echo "=== 4a. Dependencies changed — running pnpm install --frozen-lockfile ==="
      "${SSH_CMD[@]}" "$TARGET" "cd '$REMOTE_ROOT' && pnpm install --frozen-lockfile"
    fi

    echo "=== 4. Atomic build, patrol gate & PM2 swap (scripts/deploy-www.sh) ==="
    "${SSH_CMD[@]}" "$TARGET" "cd '$REMOTE_ROOT' && chmod +x scripts/deploy-www.sh scripts/content/daily-guides.sh && bash scripts/deploy-www.sh"

    echo "=== 5. Live HTTPS smoke verification ==="
    "${SSH_CMD[@]}" "$TARGET" "set -e
for p in /en /en/can-i-run /en/vps /en/search /en/best /llms.txt; do
  code=\$(curl -s -o /dev/null -w '%{http_code}' '${SITE_URL}'\"\${p}\")
  echo \"  \${code}  \${p}\"
  test \"\${code}\" = '200'
done
reval_code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST '${SITE_URL}/api/revalidate')
echo \"  \${reval_code}  POST /api/revalidate (expected 404)\"
test \"\${reval_code}\" = '404'
"
    echo "=== Deploy & smoke check complete ==="
    ;;
esac
