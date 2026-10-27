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
 # Yesterday's traffic and publishing, to Feishu, twice a day:
 #   02:00 UTC = 10:00 Asia/Shanghai (REPORT_TZ)
 #   06:00 UTC = 14:00 Asia/Shanghai
 # Both runs report the *previous* local day, so the second message repeats the first with the
 # same window rather than covering a second half-day.
 echo "0 2,6 * * * '$ROOT/deploy/daily-report.sh' $MARK-report"
) | crontab -
echo "Installed crontab entries ($MARK)."
