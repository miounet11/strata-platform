#!/usr/bin/env bash
# Daily quality patrol on the production host.
#
#   /opt/stratat/deploy/patrol-daily.sh
#
# Cron runs this once a day against the tree the live process is actually serving. The deploy gate
# in scripts/deploy-www.sh already measures every build, but a site can degrade without a deploy:
# ISR revalidation, a pruned cache directory, a sync job that rewrote a data file in place. Nothing
# else on this host looks at the pages once they are live, and the failure mode is silent — a
# status page still returns 200 while the pages behind it got worse.
#
# The comparison is the same ratchet the deploy gate uses. `scripts/patrol.mjs` reads
# `apps/www/patrol-baseline.json`, and this script only *reports*: a regression is alerted and left
# in place for a human, because a scheduled job that silently rewrites the floor it failed against
# turns the next day's run green without anyone fixing anything.
#
# `--update` is deliberately absent. The floor is lowered by a deploy that improved things, where a
# person is present and the build was gated.
set -uo pipefail

ROOT="${STRATAT_ROOT:-/opt/stratat}"
APP="$ROOT/apps/www"
LOG=/var/log/stratat-patrol.log

cd "$APP" || exit 1
exec >>"$LOG" 2>&1
echo "=== $(date -Is) patrol start ==="

# Credentials for the alert webhook come from the host env file, never from this script.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

# The live tree is the copy server.js loads. `next build` writes it at `.next`, a deploy renames
# its staging build to `.next-build` inside the standalone directory, so both are accepted.
LIVE_DIST=""
for candidate in .next/standalone/apps/www/.next-build .next/standalone/apps/www/.next; do
  if [ -d "$candidate/server/app" ]; then
    LIVE_DIST="$candidate"
    break
  fi
done
if [ -z "$LIVE_DIST" ]; then
  echo "patrol: no live build tree under $APP — cannot measure" >&2
  node "$ROOT/scripts/notify.mjs" --stage patrol \
    --reason "no live build tree under $APP — quality patrol could not measure" || true
  exit 1
fi

NEXT_DIST_DIR="$LIVE_DIST" node scripts/patrol.mjs
status=$?
echo "patrol exit=$status"

if [ "$status" -eq 0 ]; then
  exit 0
fi

# The run above already printed the measurement; reuse that output rather than paying for a second
# two-minute sweep over 43k pages.
raw=$(tail -20 "$LOG")
if [ "$status" -eq 1 ]; then
  reason="site quality regressed against the floor (live tree $LIVE_DIST)"
else
  reason="quality patrol could not run (exit=$status); live tree $LIVE_DIST"
fi
node "$ROOT/scripts/notify.mjs" --stage patrol --reason "$reason" --raw "$raw" || true

exit "$status"
