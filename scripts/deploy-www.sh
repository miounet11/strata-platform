#!/usr/bin/env bash
# Build the site, then swap the running process over to it.
#
#   ./scripts/deploy-www.sh              # build in place, restart only on success
#   ./scripts/deploy-www.sh --no-restart # build only (used to verify before swapping)
#
# The old flow stopped pm2 *before* building. A failed build then left the site down with no
# running process, which is exactly the outage this script exists to prevent: the build runs
# against a live server and the restart only happens after `next build` exits 0.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

NO_RESTART=0
[ "${1:-}" = "--no-restart" ] && NO_RESTART=1

echo "=== build $(date -Is) ==="
NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @stratat/www build
build_status=$?
echo "build exit=$build_status"

if [ "$build_status" -ne 0 ]; then
  echo "build failed — leaving the running site untouched" >&2
  exit "$build_status"
fi

if [ "$NO_RESTART" -eq 1 ]; then
  echo "build ok; restart skipped (--no-restart)"
  exit 0
fi

# `.next` is already replaced by the successful build, so a plain restart picks it up.
pm2 restart strata-www >/dev/null 2>&1
restart_status=$?
echo "restart exit=$restart_status"
exit "$restart_status"
