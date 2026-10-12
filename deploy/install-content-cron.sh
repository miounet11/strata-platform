# Note: this script also replaces any existing PATH= line in crontab with the
# standard PATH below (cron's default PATH lacks /usr/local/bin where pnpm lives).
# Non-marked crontab entries other than PATH= lines are preserved.
#!/usr/bin/env bash
# Install crontab lines for stratat content growth + weekly IndexNow.
set -euo pipefail
ROOT="${STRATAT_ROOT:-/opt/stratat}"
MARK="# stratat-content-grow"
(crontab -l 2>/dev/null | grep -v "$MARK" | grep -v "^PATH=" || true
 echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
 echo "15 0,4,8,12,16,20 * * * cd '$ROOT' && /usr/bin/node scripts/content-grow.mjs $MARK"
 echo "5 6 * * * cd '$ROOT' && CONTENT_GROW_REBUILD=1 /usr/bin/node scripts/content-grow.mjs $MARK-rebuild"
 echo "*/30 * * * * cd '$ROOT' && /usr/bin/node scripts/freshness-watch.mjs $MARK-freshness"
) | crontab -
echo "Installed crontab entries ($MARK)."
