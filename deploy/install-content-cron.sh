#!/usr/bin/env bash
# Install crontab lines for stratat content growth + freshness watcher + IndexNow.
# Note: this script also replaces any existing PATH= line in crontab with the
# standard PATH below (cron's default PATH lacks /usr/local/bin where pnpm lives).
# Non-marked crontab entries other than PATH= lines are preserved.
set -euo pipefail
ROOT="${STRATAT_ROOT:-/opt/stratat}"
MARK="# stratat-content-grow"
(crontab -l 2>/dev/null | grep -v "$MARK" | grep -v "^PATH=" || true
 echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
 echo "15 0,4,8,12,16,20 * * * cd '$ROOT' && /usr/bin/node scripts/content-grow.mjs $MARK"
 echo "5 6 * * * cd '$ROOT' && CONTENT_GROW_REBUILD=1 /usr/bin/node scripts/content-grow.mjs $MARK-rebuild"
 echo "*/30 * * * * cd '$ROOT' && /usr/bin/node scripts/freshness-watch.mjs $MARK-freshness"
 # Quality patrol: measures the live tree and alerts on a regression the deploy gate never saw.
 echo "20 3 * * * '$ROOT/deploy/patrol-daily.sh' $MARK-patrol"
 # Yesterday's traffic and publishing, to Feishu. 16:20 UTC = 00:20 Asia/Shanghai (REPORT_TZ), so
 # the previous local day closed 20 minutes ago. The log files for it are complete at this hour:
 # logrotate runs at 00:00 UTC, so `strata-access.log` holds today-so-far and `.log.1` holds the
 # previous UTC day — together they span the local day being reported.
 echo "20 16 * * * '$ROOT/deploy/daily-report.sh' $MARK-report"
) | crontab -
echo "Installed crontab entries ($MARK)."
