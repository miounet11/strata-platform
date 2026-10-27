#!/usr/bin/env bash
# Atomic deploy for the site.
#
#   ./scripts/deploy-www.sh              # build, then swap and restart
#   ./scripts/deploy-www.sh --no-restart # build only
#
# Two hazards this script removes:
#
# 1. pm2 runs `.next/standalone/apps/www/server.js` *inside* the build output. Building in place
#    rewrote the directory the live process was serving from, so a failed build could leave the
#    running site with mismatched chunks. The build now happens in `.next-build`, and the swap is
#    a directory rename — the live tree is never modified while serving.
#
# 2. Stopping pm2 before building turned a failed build into an outage. The restart only runs
#    after a successful build.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

# One deploy at a time. Both `daily-guides.sh` and `content-grow.mjs` call this script, and the
# content job's own timer can fire while a manual deploy is running.
#
# This is not theoretical: on 2026-10-27 two builds were running against the same `.next-build`
# at once (06:58 and 07:08). The first died with exit=137 after the box ran out of memory, it left
# an orphaned `next build` tree holding ~2.5GB, and `.next-build` was being written by two writers
# — so the patrol numbers measured from it could not be trusted and had to be re-run.
#
# Exit 75 (EX_TEMPFAIL) rather than 0: the caller must not conclude that a deploy happened. A
# second run has to be retried, not silently skipped. `flock -n` fails immediately instead of
# queueing, because the later run would build the same commit and arrive at the same result.
#
# The lock is a production guard, not a portability requirement. The concurrency it prevents is
# two *scheduled* runs colliding, and those only exist on the host. macOS — where this repo is also
# checked out and where a dev build is run by hand — has no `flock` binary and no /run/lock, so
# assuming either would turn every local deploy into an immediate `exit 1`. When the tool is
# absent the deploy continues unlocked and says so, the same way SKIP_TESTS=1 announces itself.
if command -v flock >/dev/null 2>&1; then
  if [ -n "${STRATAT_DEPLOY_LOCK:-}" ]; then
    LOCK_FILE="$STRATAT_DEPLOY_LOCK"
  elif [ -d /run/lock ] && [ -w /run/lock ]; then
    LOCK_FILE=/run/lock/stratat-deploy.lock
  else
    LOCK_FILE="${TMPDIR:-/tmp}/stratat-deploy.lock"
  fi
  exec 9>"$LOCK_FILE" || {
    echo "cannot open lock file $LOCK_FILE" >&2
    exit 1
  }
  if ! flock -n 9; then
    echo "another deploy holds $LOCK_FILE — not starting a second build; retry when it finishes" >&2
    exit 75
  fi
else
  echo "WARNING: flock not available on this host — deploy lock disabled. Do not run two deploys at once here." >&2
fi

# The radar tests gate every deploy, because the radar is what puts new pages on the site each
# morning and a broken scorer fails invisibly: it does not throw, it just selects nothing — which
# looks exactly like a quiet week, and the only symptom is traffic that never arrives. The build
# already costs minutes; this costs seconds and stops a regression from reaching the live tree.
#
# SKIP_TESTS=1 exists for the case where the box is down for an unrelated reason and someone needs
# the previous build back. It prints, so the log records that the gate was skipped.
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  if node --test scripts/content/radar.test.mjs; then
    echo "radar tests passed"
  else
    echo "radar tests failed — live site untouched" >&2
    exit 1
  fi
else
  echo "WARNING: SKIP_TESTS=1 — radar tests not run for this deploy"
fi

cd apps/www || exit 1

NO_RESTART=0
[ "${1:-}" = "--no-restart" ] && NO_RESTART=1

echo "=== build $(date -Is) ==="
rm -rf .next-build
# Drop TypeScript's incremental cache along with the output it describes. The cache records the
# generated `.next-build/types/*.ts` files, so after this rm the next typecheck tried to read a
# file it had just deleted and failed with "File ... not found" instead of typechecking anything.
rm -f tsconfig.tsbuildinfo .next-build/tsconfig.tsbuildinfo
# Media is served by this host from public/media. The bucket behind file.stratat.com is still
# reachable, but nothing in the pipeline uploads to it: images are written by the content job on
# this box, so pointing the build at the CDN made every new hero image a 404 (708 of them on
# 2026-10-23) while the files sat on disk. NEXT_PUBLIC_* is inlined at build time, so the choice
# is made here. Set it explicitly to move media back behind a CDN.
NEXT_PUBLIC_MEDIA_BASE="${NEXT_PUBLIC_MEDIA_BASE-}"
export NEXT_PUBLIC_MEDIA_BASE
echo "media base: ${NEXT_PUBLIC_MEDIA_BASE:-<local public/>}"
NODE_OPTIONS=--max-old-space-size=6144 NEXT_DIST_DIR=.next-build pnpm build
build_status=$?

if [ "$build_status" -ne 0 ] || [ ! -d .next-build/standalone/apps/www ]; then
  echo "build failed (exit=$build_status) — live site untouched, .next still serves" >&2
  rm -rf .next-build
  exit 1
fi

# Gate the swap on the sitemap matching the build output in both directions. A successful build
# says nothing about whether every listed URL has a page, or whether every page is reachable;
# the reverse check is what caught `/gpus/vendor` shipping in seven locales with no sitemap entry.
# Set SKIP_SITEMAP_CHECK=1 only to unblock an emergency deploy — it is not a normal flag.
if [ "${SKIP_SITEMAP_CHECK:-0}" = "1" ]; then
  echo "sitemap check SKIPPED (SKIP_SITEMAP_CHECK=1)"
else
  NEXT_DIST_DIR=.next-build node scripts/verify-sitemap.mjs
  sitemap_status=$?
  if [ "$sitemap_status" -ne 0 ]; then
    echo "sitemap check failed (exit=$sitemap_status) — live site untouched, .next still serves" >&2
    exit 1
  fi
fi

# Quality ratchet: score, sitemap parity and near-duplicate pairs against `patrol-baseline.json`.
#
# This replaces the two advisory gates (audit, similarity) that used to print "deploy continues" on
# every failure. Advisory meant the numbers were written to a log on a host nobody is logged into,
# so 105 pages over the byte budget and 1,936 duplicate pairs accumulated with a green deploy each
# time. Strict would have blocked every deploy including the ones that fix things. A ratchet blocks
# only the direction that hurts: today's numbers are the floor, a deploy may hold them or improve
# them, and `--update` below lowers the floor whenever it does.
#
# Exit 2 means the measurement itself failed (no build output, a gate that could not run) — always
# fatal, and kept separate from exit 1 so a broken gate cannot read as "a finding, continue".
if [ "${SKIP_PATROL:-0}" = "1" ]; then
  echo "patrol SKIPPED (SKIP_PATROL=1)"
elif [ ! -f scripts/patrol.mjs ]; then
  echo "patrol gate missing: scripts/patrol.mjs not found in apps/www — refusing to deploy" >&2
  exit 1
else
  NEXT_DIST_DIR=.next-build node scripts/patrol.mjs
  patrol_status=$?
  if [ "$patrol_status" -ne 0 ]; then
    if [ "$patrol_status" -eq 1 ]; then
      echo "patrol found a regression against the floor (exit=1) — live site untouched" >&2
    else
      echo "patrol could not run (exit=$patrol_status) — gate is broken, live site untouched" >&2
    fi
    exit 1
  fi
fi

if [ "$NO_RESTART" -eq 1 ]; then
  echo "build ok; swap skipped (--no-restart)"
  exit 0
fi

# Next writes the server output twice: once as the build's own `.next/server`, and again inside
# `standalone/apps/www/.next-build`, which is what server.js actually loads (pm2 cwd is the
# standalone dir). The outer copy is 4 GB of dead weight on every build. Dropping it here — and
# from the rollback tree — is safe: a rollback renames `.next-prev` back to `.next` and pm2
# restarts into that tree's own `standalone/apps/www`, whose `.next-build` copy is untouched.
# Verified by moving the live copy away with the site still serving 200s.
echo "pruning duplicate server output"
# Only prune when the copy server.js actually loads is present. If the standalone build is
# incomplete, keeping the duplicate is the safe failure: it costs disk, not uptime.
if [ -d .next-build/standalone/apps/www/.next-build/server ]; then
  rm -rf .next-build/server
else
  echo "standalone server output missing — keeping .next-build/server" >&2
fi
if [ -d .next-prev/standalone/apps/www/.next-build/server ]; then
  rm -rf .next-prev/server
fi

# `route-cache` is runtime state, not build output: every ISR revalidation writes a file there,
# and it grows for as long as the tree serves. Measured on 2026-10-22, the rollback copy held
# 103,663 cache files (3.3 GB) against a fresh build's 1,854 (126 MB). The prerendered sitemaps
# live in `server/app/sitemaps/*.body`; the cache copies are duplicates of them.
#
# Dropping it from the rollback tree costs a rollback nothing but a cold cache, which is what a
# rollback produces anyway. Dropping it from the new tree would delete cache entries the live
# process has not written yet — that is why only `.next-prev` is touched here.
if [ -d .next-prev/standalone/apps/www/.next-build/server/route-cache ]; then
  rm -rf .next-prev/standalone/apps/www/.next-build/server/route-cache
  echo "pruned rollback route-cache"
fi

# Swap by rename: `.next` keeps serving until the new tree is complete, then replaces it in one
# step. The old tree is kept for one deploy so a bad release can be rolled back by renaming back.
echo "swapping build"
rm -rf .next-prev
[ -d .next ] && mv .next .next-prev
mv .next-build .next

pm2 restart strata-www >/dev/null 2>&1
restart_status=$?
echo "restart exit=$restart_status"

# Lock in whatever this build improved, now that it is the live tree. Only improvements are
# written, so a clean deploy leaves the file alone; a regression was already blocked above and
# can never reach this line. Without this step the floor would drift behind reality and the next
# genuine regression would be invisible against a stale number.
#
# The tree to measure is the copy server.js actually loads: `.next/server` was pruned a few lines
# above, so pointing at it here would read nothing. A plain `next build` keeps its copy at
# `standalone/apps/www/.next`, a deploy at `standalone/apps/www/.next-build`; both are accepted.
if [ "$restart_status" -eq 0 ] && [ "${SKIP_PATROL:-0}" != "1" ]; then
  LIVE_DIST=""
  for candidate in .next/standalone/apps/www/.next-build .next/standalone/apps/www/.next; do
    if [ -d "$candidate/server/app" ]; then
      LIVE_DIST="$candidate"
      break
    fi
  done
  if [ -n "$LIVE_DIST" ]; then
    NEXT_DIST_DIR="$LIVE_DIST" node scripts/patrol.mjs --update || echo "patrol: baseline not updated" >&2
  else
    echo "patrol: no live build tree to measure — baseline not updated" >&2
  fi
fi

exit "$restart_status"
