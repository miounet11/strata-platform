#!/usr/bin/env bash
# Install crontab lines for stratat content publishing + growth + freshness watcher + patrol + report.
# Note: this script replaces any existing PATH= line in crontab with the standard PATH below
# (cron's default PATH lacks /usr/local/bin where pnpm lives).
# Non-stratat crontab entries (and unrelated jobs like stratat-vps-deals-daily) are preserved.
set -euo pipefail
ROOT="${STRATAT_ROOT:-/opt/stratat}"
MARK="# stratat-content-grow"
GUIDES_MARK="# stratat-guides-daily"
(crontab -l 2>/dev/null | grep -v "$MARK" | grep -v "$GUIDES_MARK" | grep -v "^PATH=" || true
 echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
 # Guides discovery + generation + cover + paced publish + <1s ISR revalidation + IndexNow.
 # Twice daily (06:45 & 18:45 UTC = 14:45 & 02:45 Asia/Shanghai), 25 articles/run (= 50/day):
 #   - 06:45 UTC runs cleanly after the 06:05 UTC safety rebuild finishes (~6m), catching Asia/EU crawlers
 #   - 18:45 UTC catches US daytime releases (HF/GitHub/vendor news) & North American/AI bot waves
 echo "45 6,18 * * * '$ROOT/scripts/content/daily-guides.sh' $GUIDES_MARK"
 # Every 4 hours: sync GitHub community, releases, downloads, changelog, pulses + <1s ISR refresh.
 echo "15 0,4,8,12,16,20 * * * cd '$ROOT' && /usr/bin/node scripts/content-grow.mjs $MARK"
 # Once daily safety full atomic rebuild + patrol floor ratchet (~6 min at 06:05 UTC).
 echo "5 6 * * * cd '$ROOT' && CONTENT_GROW_REBUILD=1 /usr/bin/node scripts/content-grow.mjs $MARK-rebuild"
 # Every 1 hour: detect new GitHub releases/downloads and publish live in ~1s via POST /api/revalidate
 # (falls back to deploy-www.sh with flock only if instant revalidation is unavailable).
 echo "20 * * * * cd '$ROOT' && /usr/bin/node scripts/freshness-watch.mjs $MARK-freshness"
 # Quality patrol: measures the live tree and alerts on a regression the deploy gate never saw.
 echo "20 3 * * * '$ROOT/deploy/patrol-daily.sh' $MARK-patrol"
 # Yesterday's traffic and publishing, to Feishu, twice a day:
 #   02:00 UTC = 10:00 Asia/Shanghai (REPORT_TZ)
 #   06:00 UTC = 14:00 Asia/Shanghai
 # Both runs report the *previous* local day, so the second message repeats the first with the
 # same window rather than covering a second half-day.
 echo "0 2,6 * * * '$ROOT/deploy/daily-report.sh' $MARK-report"
) | crontab -
echo "Installed crontab entries ($GUIDES_MARK, $MARK)."
