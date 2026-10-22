#!/usr/bin/env bash
# Daily guides job on the production host.
#
#   /opt/stratat/scripts/content/daily-guides.sh [--no-build]
#
# 1. write the articles that are scheduled for today (LLM, per locale)
# 2. validate them — nothing ships if the gate fails
# 3. flip due scheduled → live
# 4. rebuild the site so the new pages are served
#
# Images are NOT generated here: the image worker lives on a private-network cluster that this
# host cannot reach. They are produced on the workstation and committed to the repo.
set -uo pipefail

ROOT=/opt/stratat
cd "$ROOT" || exit 1
LOG=/var/log/stratat-guides.log
exec >>"$LOG" 2>&1
echo "=== $(date -Is) daily-guides start ==="

# Credentials come from the host env file, never from this script. The previous version carried
# a literal `sk-...` in the `${VAR:-default}` slot, which shipped a live API key to every clone
# and kept it in git history. `/opt/stratat/.env` is gitignored and root-owned.
if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi
if [ -z "${CONTENT_LLM_API_KEY:-}" ]; then
  echo "FATAL: CONTENT_LLM_API_KEY is not set (expected in $ROOT/.env) — refusing to run"
  exit 1
fi
export CONTENT_CONCURRENCY="${CONTENT_CONCURRENCY:-3}"

today=$(date -u +%F)

# Today's locales come from the plan, so the schedule lives in one place.
locales=$(/usr/bin/node --input-type=module -e '
  import plan from "/opt/stratat/scripts/content/plan.json" with { type: "json" };
  const t = new Date().toISOString().slice(0, 10);
  const set = new Set(plan.items.filter((a) => a.publishAt === t).map((a) => a.locale));
  console.log([...set].join(" "));
')

if [ -z "$locales" ]; then
  echo "no locales scheduled for $today — nothing to write"
else
  echo "writing for: $locales"
  for locale in $locales; do
    /usr/bin/node scripts/content/generate.mjs --locale "$locale"
    echo "generate $locale exit=$?"
  done
fi

/usr/bin/node scripts/content/verify.mjs
verify_status=$?
echo "verify exit=$verify_status"
if [ "$verify_status" -ne 0 ]; then
  echo "quality gate failed — refusing to publish"
  exit 1
fi

/usr/bin/node scripts/content/publish.mjs
echo "publish exit=$?"

if [ "${1:-}" != "--no-build" ]; then
  # One deploy entry point: staging build, atomic swap, restart only on success.
  "$ROOT/scripts/deploy-www.sh"
  echo "deploy exit=$?"
fi

echo "=== $(date -Is) daily-guides done ==="
