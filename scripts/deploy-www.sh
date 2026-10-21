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
cd apps/www || exit 1

NO_RESTART=0
[ "${1:-}" = "--no-restart" ] && NO_RESTART=1

echo "=== build $(date -Is) ==="
rm -rf .next-build
NODE_OPTIONS=--max-old-space-size=6144 NEXT_DIST_DIR=.next-build pnpm build
build_status=$?

if [ "$build_status" -ne 0 ] || [ ! -d .next-build/standalone/apps/www ]; then
  echo "build failed (exit=$build_status) — live site untouched, .next still serves" >&2
  rm -rf .next-build
  exit 1
fi

if [ "$NO_RESTART" -eq 1 ]; then
  echo "build ok; swap skipped (--no-restart)"
  exit 0
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
