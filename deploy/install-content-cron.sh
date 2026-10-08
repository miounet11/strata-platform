#!/usr/bin/env bash
# Install crontab lines for stratat content growth + weekly IndexNow.
set -euo pipefail
ROOT="${STRATAT_ROOT:-/opt/stratat}"
MARK="# stratat-content-grow"
(crontab -l 2>/dev/null | grep -v "$MARK" || true
 echo "15 0,4,8,12,16,20 * * * cd $ROOT && /usr/bin/node scripts/content-grow.mjs $MARK"
 echo "5 6 * * * cd $ROOT && CONTENT_GROW_REBUILD=1 /usr/bin/node scripts/content-grow.mjs $MARK-rebuild"
) | crontab -
echo "Installed crontab entries ($MARK)."
