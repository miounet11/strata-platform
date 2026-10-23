#!/usr/bin/env bash
# Send the previous day's traffic + publishing report to Feishu.
#
#   /opt/stratat/deploy/daily-report.sh
#
# Cron runs this at 16:20 UTC, which is 00:20 Asia/Shanghai (REPORT_TZ) — right after local
# midnight, before the new day has any traffic worth reporting.
#
# The report day is the *previous local day*, computed inside the script from REPORT_TZ, so the
# schedule and the reporting window cannot drift apart.
#
# Why this hour is safe to read logs: logrotate runs at 00:00 UTC, so at 16:20 UTC the current
# `strata-access.log` covers only today's first 16 hours and `.log.1` holds the whole previous UTC
# day. The report reads every rotated file and filters by timestamp, so a local day that straddles
# the UTC boundary (Asia/Shanghai: 16:00–16:00) is still counted completely.
set -uo pipefail

ROOT="${STRATAT_ROOT:-/opt/stratat}"
LOG=/var/log/stratat-report.log

cd "$ROOT" || exit 1
exec >>"$LOG" 2>&1
echo "=== $(date -Is) report start ==="

# The webhook URL lives in the host env file, never in this script.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

if [ -z "${NOTIFY_WEBHOOK:-}" ] && [ -z "${FEISHU_WEBHOOK_URL:-}" ]; then
  echo "report: no webhook configured — printing only, nothing will be delivered" >&2
fi

node scripts/daily-report.mjs --send
status=$?
echo "report exit=$status"

# A quiet day is not a failure, but an undelivered report is: it would otherwise be a line in a
# log on a host nobody reads, which is exactly what this whole mechanism exists to avoid.
if [ "$status" -ne 0 ]; then
  echo "report: delivery failed — see $LOG" >&2
fi

exit "$status"
