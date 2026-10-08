#!/usr/bin/env bash
# Run from dev machine: ./deploy/sync-and-deploy.sh
set -euo pipefail
HOST="${DEPLOY_HOST:?Set DEPLOY_HOST, e.g. DEPLOY_HOST=203.0.113.10 ./deploy/sync-and-deploy.sh}"
USER="${DEPLOY_USER:-root}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "${SSHPASS:-}" ]] && [[ -z "${SSH_KEY:-}" ]]; then
  echo "Set SSHPASS or use SSH key auth. Example: SSHPASS=... ./deploy/sync-and-deploy.sh"
  exit 1
fi

RSYNC_SSH="ssh -o StrictHostKeyChecking=accept-new"
if [[ -n "${SSH_KEY:-}" ]]; then
  RSYNC_SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"
fi
if [[ -n "${SSHPASS:-}" ]]; then
  RSYNC_SSH="sshpass -e ssh -o StrictHostKeyChecking=accept-new"
  export SSHPASS
fi

rsync -avz --delete \
  --exclude node_modules \
  --exclude '.next' \
  --exclude 'apps/www/.next' \
  --exclude apps/desktop/src-tauri/target \
  --exclude .git \
  --exclude apps/api/data \
  -e "$RSYNC_SSH" \
  "$ROOT/" "$USER@$HOST:/opt/stratat/"

# Ensure large JSON corpora are present (not always in git)
rsync -avz -e "$RSYNC_SSH" "$ROOT/apps/www/src/data/" "$USER@$HOST:/opt/stratat/apps/www/src/data/"

$RSYNC_SSH "$USER@$HOST" "chmod +x /opt/stratat/deploy/remote-bootstrap.sh && /opt/stratat/deploy/remote-bootstrap.sh"
