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

# Score the build against the SEO/accessibility/performance budget. `audit.mjs` exits 1 when any
# check fails, so this is a hard gate, not a report. Several of its checks (`jsonld-coverage`,
# `performance-budget`) are currently failing on the live site — see
# `yyds-2/docs/11-inspiration-yyds-bot.md`. Blocking the deploy on them today would block every
# deploy, so the gate is advisory until those are fixed: set AUDIT_STRICT=1 to make it blocking.
if [ "${SKIP_AUDIT:-0}" = "1" ]; then
  echo "audit SKIPPED (SKIP_AUDIT=1)"
else
  NEXT_DIST_DIR=.next-build node scripts/audit.mjs
  audit_status=$?
  if [ "$audit_status" -ne 0 ]; then
    if [ "${AUDIT_STRICT:-0}" = "1" ]; then
      echo "audit failed (exit=$audit_status) — live site untouched" >&2
      exit 1
    fi
    echo "audit reported failures (exit=$audit_status) — deploy continues, set AUDIT_STRICT=1 to block" >&2
  fi
fi

# Near-duplicate page text. `audit.mjs` scores structure — h1 present, JSON-LD present — and says
# nothing about whether the prose was actually rewritten per entity. On 2026-10-22 this found 1,936
# pairs above 0.72, 546 of them byte-identical pages reachable at two URLs, from catalog rows that
# differ only in a chip codename the page never renders.
#
# Exit 1 is a finding about the content, so it is advisory for the same reason as audit: those 546
# are a data problem the pipeline has to fix, and blocking today would block every deploy.
# SIMILARITY_STRICT=1 makes it blocking.
#
# Exit 2 means the check could not run — no build output, or no page above --min-tokens. That is
# always fatal: after a successful build it can only mean this gate is broken, and continuing would
# print a deploy as "duplicates reported, continuing" when nothing was measured at all.
if [ "${SKIP_SIMILARITY:-0}" = "1" ]; then
  echo "similarity SKIPPED (SKIP_SIMILARITY=1)"
else
  SITE_DIR=. NEXT_DIST_DIR=.next-build node scripts/similarity.mjs
  similarity_status=$?
  case "$similarity_status" in
    0) ;;
    2)
      echo "similarity could not run (exit=2) — gate is broken, refusing to deploy" >&2
      exit 1
      ;;
    *)
      if [ "${SIMILARITY_STRICT:-0}" = "1" ]; then
        echo "similarity failed (exit=$similarity_status) — live site untouched" >&2
        exit 1
      fi
      echo "similarity reported duplicate pages (exit=$similarity_status) — deploy continues, set SIMILARITY_STRICT=1 to block" >&2
      ;;
  esac
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
exit "$restart_status"
