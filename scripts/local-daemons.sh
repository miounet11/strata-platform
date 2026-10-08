#!/usr/bin/env bash
# Start local content daemons (Mac/Linux). Load secrets from repo-root .env.local
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env.local ]]; then set -a; source .env.local; set +a; fi
mkdir -p "$ROOT/.logs"
pkill -f "scripts/run-intake-loop.mjs" 2>/dev/null || true
pkill -f "scripts/enrichment/run-enrich-loop.mjs" 2>/dev/null || true
nohup node scripts/run-intake-loop.mjs >> "$ROOT/.logs/intake.log" 2>&1 &
nohup node scripts/enrichment/run-enrich-loop.mjs >> "$ROOT/.logs/enrich.log" 2>&1 &
echo "Started intake + enrich loops. Logs: .logs/intake.log .logs/enrich.log"
