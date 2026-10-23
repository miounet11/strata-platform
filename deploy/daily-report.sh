#!/usr/bin/env bash
# Send the previous day's traffic + publishing report to Feishu.
#
#   /opt/stratat/deploy/daily-report.sh
#
# Cron runs this twice a day: 02:00 UTC (10:00 Asia/Shanghai) and 06:00 UTC (14:00 Asia/Shanghai).
# Both runs report the same *previous* local day — the second is a repeat, not a different window.
#
# The report day is computed inside the script from REPORT_TZ, so the schedule and the reporting
# window cannot drift apart.
#
# Why any hour is safe to read logs: the script reads every rotated file and filters by timestamp,
# so a local day that straddles the UTC boundary (Asia/Shanghai: 16:00–16:00) is counted completely
# regardless of when logrotate ran.
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

# REPORT_WEBHOOK wins, then the shared alert hook. Reporting the wrong channel here would be a
# guess; naming all three is what makes an unset config obvious in the log.
if [ -z "${REPORT_WEBHOOK:-}" ] && [ -z "${NOTIFY_WEBHOOK:-}" ] && [ -z "${FEISHU_WEBHOOK_URL:-}" ]; then
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
