#!/usr/bin/env bash
# Run a Grok Build work package inside an isolated git worktree, with auto-resume on network drops.
#
#   grok/run-wp.sh WP-1-pc-builds /Volumes/MobileDrive/devpc/.stratat-wt/wp-1
set -uo pipefail
WP="${1:?Usage: $0 <WP-name-without-.md> <worktree-dir>}"
WT="${2:?Usage: $0 <WP-name-without-.md> <worktree-dir>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$ROOT/grok/logs"
mkdir -p "$LOG"
MAX_RESTARTS="${MAX_RESTARTS:-6}"
MODEL="${GROK_MODEL:-grok-4.7}"
EFFORT="${GROK_EFFORT:-high}"

attempt=0
resume="${RESUME:-0}"
while [ "$attempt" -le "$MAX_RESTARTS" ]; do
  attempt=$((attempt + 1))
  ts=$(date +%Y%m%d-%H%M%S)
  if [ "$resume" = "1" ]; then
    echo "[$ts] [$WP] attempt $attempt: --continue" | tee -a "$LOG/$WP.supervisor.log"
    args=(--continue "Network drop or incomplete run. Inspect existing files in this worktree, continue from where you stopped, run all required tests, write the completion report, and commit cleanly.")
  else
    echo "[$ts] [$WP] attempt $attempt: initial run ($MODEL / $EFFORT)" | tee -a "$LOG/$WP.supervisor.log"
    args=(--prompt-file "$ROOT/grok/$WP.md")
  fi
  "$HOME/.grok/bin/grok" "${args[@]}" --model "$MODEL" --effort "$EFFORT" --always-approve --max-turns 200 \
    --cwd "$WT" --output-format streaming-json >> "$LOG/$WP.ndjson" 2>> "$LOG/$WP.stderr"
  rc=$?
  echo "[$(date +%Y%m%d-%H%M%S)] [$WP] exit rc=$rc" | tee -a "$LOG/$WP.supervisor.log"
  short_id="$(printf '%s' "$WP" | awk -F- '{print $1 "-" $2}')"
  if [ -f "$WT/grok/${WP}-report.md" ] || [ -f "$WT/grok/${short_id}-report.md" ]; then
    echo "[$(date +%Y%m%d-%H%M%S)] [$WP] report detected — work package complete" | tee -a "$LOG/$WP.supervisor.log"
    exit 0
  fi
  resume=1
  sleep 10
done
echo "[$WP] exceeded MAX_RESTARTS=$MAX_RESTARTS" | tee -a "$LOG/$WP.supervisor.log"
exit 1
