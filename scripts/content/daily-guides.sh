#!/usr/bin/env bash
# Daily guides job on the production host.
#
#   /opt/stratat/scripts/content/daily-guides.sh [--no-build]
#
# Pipeline:
#   1. Local preflight (disk, plan, outDir, mediaDir) — never blocked by missing LLM creds
#   2. Discover new topics: radar.mjs --merge (HF/GH/sitemaps) + mine-topics.mjs --merge (releases/issues/traffic)
#   3. If LLM creds pass preflight: generate due articles (publishAt <= today), demand-prioritized
#   4. Ensure every written article has a hero cover (AI WebP if available, deterministic SVG fallback otherwise)
#   5. Verify quality gate (verify.mjs)
#   6. Snapshot corpus, then publish due items (paced via PUBLISH_DAILY_CAP)
#   7. Refresh live site instantaneously via POST /api/revalidate (falling back to deploy-www.sh only if needed)
#   8. Submit newly published URLs to IndexNow
set -uo pipefail

ROOT="${STRATAT_ROOT:-/opt/stratat}"
cd "$ROOT" || exit 1
LOG="${STRATAT_GUIDES_LOG:-/var/log/stratat-guides.log}"
exec >>"$LOG" 2>&1
echo "=== $(date -Is) daily-guides start ==="

# Prevent overlapping scheduled runs (e.g. if an LLM wave runs long).
if command -v flock >/dev/null 2>&1; then
  GUIDES_LOCK="${STRATAT_GUIDES_LOCK:-/run/lock/stratat-daily-guides.lock}"
  [ -d /run/lock ] && [ -w /run/lock ] || GUIDES_LOCK="${TMPDIR:-/tmp}/stratat-daily-guides.lock"
  exec 8>"$GUIDES_LOCK" 2>/dev/null || true
  if ! flock -n 8 2>/dev/null; then
    echo "another daily-guides.sh run holds $GUIDES_LOCK — skipping overlap cleanly"
    exit 0
  fi
fi

if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi

FEISHU_WEBHOOK_URL="${FEISHU_WEBHOOK_URL:-https://open.feishu.cn/open-apis/bot/v2/hook/b5626c22-0a4e-467d-885f-585c3852ae77}"

FAIL_REASON=""
GENERATE_FAILURES=0

fail() {
  FAIL_REASON="$1"
  exit "${2:-1}"
}

SNAPSHOT_ROOT=/var/lib/stratat-content-snapshots
SNAPSHOT_KEEP=20

snapshot_content() {
  local dir count
  [ -d "$ROOT/scripts/content/out" ] || { echo "WARNING: content/out missing — no snapshot taken"; return 0; }
  dir="$SNAPSHOT_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$dir" || { echo "WARNING: cannot create $dir — no snapshot taken"; return 0; }
  rsync -a "$ROOT/scripts/content/out/" "$dir/" || {
    echo "WARNING: content snapshot incomplete at $dir"
    return 0
  }
  count=$(find "$dir" -name '*.json' | wc -l)
  echo "content snapshot: $dir ($count articles)"
  ls -1d "$SNAPSHOT_ROOT"/*/ 2>/dev/null | sort | head -n "-$SNAPSHOT_KEEP" | xargs -r rm -rf
}

send_alert() {
  local reason="$1" code="$2" when host tail20 text
  when=$(date -Is)
  host=$(hostname)
  tail20=$(tail -n 20 "$LOG" 2>/dev/null | cut -c1-400)
  text=$(printf '【Strata 内容管线告警】\n原因: %s\n主机: %s\n时间: %s\n退出码: %s\n\n最近日志:\n%s' \
    "$reason" "$host" "$when" "$code" "$tail20")

  echo "[alert] 发送通知: $reason (exit=$code)"

  if ALERT_TEXT="$text" ALERT_URL="$FEISHU_WEBHOOK_URL" /usr/bin/node -e '
    const text = process.env.ALERT_TEXT;
    const url = process.env.ALERT_URL;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
      signal: AbortSignal.timeout(15000),
    })
      .then(async (r) => {
        const body = await r.text();
        console.log(`[alert] feishu HTTP ${r.status} ${body.slice(0, 200)}`);
        try {
          if (JSON.parse(body).code !== 0) process.exit(3);
        } catch { process.exit(3); }
      })
      .catch((err) => {
        console.error(`[alert] feishu send failed: ${err.message}`);
        process.exit(4);
      });
  '; then
    :
  else
    echo "[alert] 飞书通知未送达（网络或 webhook 异常）；失败原因与日志尾部已在上方记录" >&2
  fi
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    send_alert "${FAIL_REASON:-脚本异常退出（未归类的失败）}" "$code"
  fi
}
trap on_exit EXIT

# 1. Local preconditions (disk, plan.json, out/, media/) — always enforced.
/usr/bin/node scripts/content/preflight.mjs --local-only
local_preflight=$?
if [ "$local_preflight" -ne 0 ]; then
  fail "本地前置检查未通过（preflight --local-only exit=$local_preflight）" 1
fi

export CONTENT_CONCURRENCY="${CONTENT_CONCURRENCY:-3}"
# Cadence tuned for 2x/day execution (06:45 & 18:45 UTC):
#   - up to 10 due articles/locale/run (max 20/locale/day once LLM creds are enabled)
#   - up to 25 published articles/run (= 50/day steady ramp, avoids crawl-budget bursts)
PER_LOCALE_LIMIT="${CONTENT_PER_LOCALE_LIMIT:-10}"
PUBLISH_CAP="${PUBLISH_DAILY_CAP:-25}"
today=$(date -u +%F)
run_started_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Roll the base schedule forward whenever all non-radar slots have expired.
remaining=$(/usr/bin/node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const plan = JSON.parse(readFileSync("scripts/content/plan.json", "utf8"));
  const t = new Date().toISOString().slice(0, 10);
  console.log(plan.items.filter((a) => a.publishAt >= t).length);
')
if [ "${remaining:-0}" -eq 0 ]; then
  echo "schedule exhausted — rolling the plan forward from $today"
  cp scripts/content/plan.json "scripts/content/.plan.${today}.json" 2>/dev/null || true
  /usr/bin/node scripts/content/plan.mjs
  plan_status=$?
  echo "replan exit=$plan_status"
  if [ "$plan_status" -ne 0 ]; then
    fail "排程已用尽且自动续期失败（plan.mjs exit=$plan_status）" 1
  fi
fi

# 2. Topic discovery (zero LLM credentials required — always runs).
/usr/bin/node scripts/content/radar.mjs --merge
radar_status=$?
echo "radar exit=$radar_status"
if [ "$radar_status" -ne 0 ]; then
  echo "WARNING: radar reported a problem (exit=$radar_status); continuing"
fi

/usr/bin/node scripts/content/mine-topics.mjs --merge
mine_status=$?
echo "mine-topics exit=$mine_status"
if [ "$mine_status" -ne 0 ]; then
  echo "WARNING: mine-topics reported a problem (exit=$mine_status); continuing"
fi

# 3. LLM generation (runs only if LLM preflight passes; missing creds do NOT block publishing backlog).
LLM_READY=0
if /usr/bin/node scripts/content/preflight.mjs; then
  LLM_READY=1
else
  echo "WARNING: LLM preflight failed — skipping new generation, continuing cover/publish/revalidate for queued articles"
fi

if [ "$LLM_READY" -eq 1 ]; then
  # Demand-ordered locales with any due unwritten item (publishAt <= today, catching up missed days).
  locales=$(/usr/bin/node --input-type=module -e '
    import { existsSync, readFileSync } from "node:fs";
    const plan = JSON.parse(readFileSync("scripts/content/plan.json", "utf8"));
    const t = new Date().toISOString().slice(0, 10);
    const priority = ["en", "zh", "ja", "de", "fr", "es", "pt"];
    const pending = new Set(
      plan.items
        .filter((a) => (!a.publishAt || a.publishAt <= t) && !existsSync(`scripts/content/out/${a.locale}/${a.slug}.json`))
        .map((a) => a.locale),
    );
    const ordered = priority.filter((l) => pending.has(l));
    for (const l of pending) if (!ordered.includes(l)) ordered.push(l);
    console.log(ordered.join(" "));
  ')
  if [ -n "$locales" ]; then
    echo "writing due articles (limit=${PER_LOCALE_LIMIT}/locale) for: $locales"
    for locale in $locales; do
      /usr/bin/node scripts/content/generate.mjs --locale "$locale" --due-only --limit "$PER_LOCALE_LIMIT"
      status=$?
      echo "generate $locale exit=$status"
      if [ "$status" -ne 0 ]; then
        GENERATE_FAILURES=$((GENERATE_FAILURES + 1))
        echo "ERROR: generate $locale reported failures (exit=$status)"
      fi
    done
  else
    echo "all due plan items already have generated JSON on disk"
  fi
fi

# 4. Hero covers (AI WebP when backend available, deterministic editorial SVG fallback otherwise — zero starvation).
/usr/bin/node scripts/content/images.mjs --fallback-svg
images_status=$?
echo "images exit=$images_status"
if [ "$images_status" -ne 0 ]; then
  echo "WARNING: images reported failures (exit=$images_status); continuing"
fi

export NEXT_PUBLIC_MEDIA_BASE="${NEXT_PUBLIC_MEDIA_BASE-}"

# 5. Quality gate.
/usr/bin/node scripts/content/verify.mjs
verify_status=$?
echo "verify exit=$verify_status (media base: ${NEXT_PUBLIC_MEDIA_BASE:-<local public/>})"
if [ "$verify_status" -ne 0 ]; then
  fail "内容质量门禁未通过（verify.mjs exit=$verify_status），本次不发布" 1
fi

# 6. Snapshot & paced publish.
snapshot_content

publish_out=$(/usr/bin/node scripts/content/publish.mjs --limit "$PUBLISH_CAP" 2>&1)
publish_status=$?
echo "$publish_out"
echo "publish exit=$publish_status"
if [ "$publish_status" -ne 0 ]; then
  fail "发布步骤失败（publish.mjs exit=$publish_status）" 1
fi

starved=$(printf '%s\n' "$publish_out" | grep -m1 '^STARVED ' || true)
if [ -n "$starved" ]; then
  echo "WARN: 有到期内容被缺图拦下——${starved#STARVED }"
  /usr/bin/node "$ROOT/scripts/notify.mjs" \
    --stage "daily-guides/starved" \
    --reason "有到期文章因缺图被拦下" \
    --raw "$publish_out" || true
fi

published_paths=$(printf '%s\n' "$publish_out" | grep -m1 '^PUBLISHED_PATHS ' | sed 's/^PUBLISHED_PATHS //' || true)

# 7. Make new guides live: prefer <1s zero-rebuild ISR revalidation; fall back to full deploy only if needed.
if [ "${1:-}" != "--no-build" ]; then
  REVALIDATED=0
  if [ "${DAILY_GUIDES_FULL_BUILD:-0}" != "1" ]; then
    if [ -n "$published_paths" ]; then
      /usr/bin/node "$ROOT/scripts/revalidate.mjs" --scope guides --paths "$published_paths"
    else
      /usr/bin/node "$ROOT/scripts/revalidate.mjs" --scope guides
    fi
    reval_status=$?
    echo "revalidate exit=$reval_status"
    if [ "$reval_status" -eq 0 ]; then
      REVALIDATED=1
    else
      echo "WARN: instant revalidation unavailable (exit=$reval_status) — falling back to deploy-www.sh"
    fi
  fi

  if [ "$REVALIDATED" -eq 0 ] && [ -n "$published_paths" ]; then
    "$ROOT/scripts/deploy-www.sh"
    deploy_status=$?
    echo "deploy exit=$deploy_status"
    if [ "$deploy_status" -eq 75 ]; then
      echo "WARN: 另一个部署正在进行，本次跳过构建；内容已发布，等待下一次部署上线"
    elif [ "$deploy_status" -ne 0 ]; then
      fail "站点构建或部署失败（deploy-www.sh exit=$deploy_status），线上仍是上一版" 1
    fi
  fi
fi

# 8. Notify IndexNow of newly shipped guides.
/usr/bin/node "$ROOT/scripts/indexnow-submit.mjs" --since "$run_started_iso"
indexnow_status=$?
echo "indexnow exit=$indexnow_status"
if [ "$indexnow_status" -ne 0 ]; then
  echo "WARNING: IndexNow 提交失败（exit=$indexnow_status）；文章已上线，只是收录变慢"
fi

if [ "$GENERATE_FAILURES" -ne 0 ]; then
  fail "有 $GENERATE_FAILURES 个语言的条目生成失败（详见上方 ERROR 与 .state.jsonl）" 1
fi

echo "=== $(date -Is) daily-guides done ==="
