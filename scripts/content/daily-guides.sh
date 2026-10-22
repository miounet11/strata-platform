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
#
# This has to load *before* the webhook default below, or an operator who edits .env to point
# alerts elsewhere would have no effect: the value would already be captured.
if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi

# Nobody is watching this job: it runs from cron at 06:45 and a failure only lands in a log
# file on a host no one has open. Two things therefore have to hold. (1) A step that fails must
# make the script fail — the original version ran `node ...; echo "exit=$?"`, which recorded the
# status and then carried on, so a publish failure still ended with exit 0 and an empty log line
# looked like success. (2) The failure must reach a person, which is what the webhook is for.
#
# The webhook URL is the default here on purpose: if `.env` is missing or truncated, a silent
# "no notification" is the one outcome we cannot detect later. A hook is a write endpoint, not a
# credential — it can post messages, not read anything.
FEISHU_WEBHOOK_URL="${FEISHU_WEBHOOK_URL:-https://open.feishu.cn/open-apis/bot/v2/hook/b5626c22-0a4e-467d-885f-585c3852ae77}"

# Set by the failure path; the EXIT trap reads it to explain *why*, not just that something broke.
FAIL_REASON=""
# Counted, not acted on immediately: a failed item should not throw away the articles that were
# written successfully. The count turns into a non-zero exit (and therefore an alert) at the end.
GENERATE_FAILURES=0

fail() {
  FAIL_REASON="$1"
  exit "${2:-1}"
}

# Sending must never be able to mask the original failure. If curl or DNS is down, the alert is
# lost but the exit code and the log tail are still on disk, so the job reports the same failure
# with or without the webhook.
send_alert() {
  local reason="$1" code="$2" when host tail20 text
  when=$(date -Is)
  host=$(hostname)
  # 20 lines is enough to see the error without turning the card into a wall of text.
  tail20=$(tail -n 20 "$LOG" 2>/dev/null | cut -c1-400)
  text=$(printf '【Strata 发布失败】\n原因: %s\n主机: %s\n时间: %s\n退出码: %s\n\n最近日志:\n%s' \
    "$reason" "$host" "$when" "$code" "$tail20")

  # Logged as well as sent: when an alert is delivered but says the wrong thing, the log is the
  # only place to see what was actually pushed.
  echo "[alert] 发送失败通知: $reason (exit=$code)"

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
        // A 200 with code!=0 is a rejected message, not a delivered one.
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

if [ -z "${CONTENT_LLM_API_KEY:-}" ]; then
  fail "CONTENT_LLM_API_KEY 未设置（应写在 $ROOT/.env），已拒绝运行" 1
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
  # An empty day is the one failure that looks exactly like success: the script exits 0, nothing
  # is written, and the site quietly stops growing. `plan.json` currently ends on 2026-10-28, so
  # from 2026-10-29 every run would land here. Distinguish "nothing due because everything is
  # already published" from "the plan ran out" by asking the plan itself.
  remaining=$(/usr/bin/node --input-type=module -e '
    import plan from "/opt/stratat/scripts/content/plan.json" with { type: "json" };
    console.log(plan.items.filter((a) => a.publishAt >= new Date().toISOString().slice(0, 10)).length);
  ')
  if [ "${remaining:-0}" -eq 0 ]; then
    fail "内容排程已用尽：plan.json 中没有 $today 及之后的条目，站点不会再有新文章。需要补充 plan" 1
  fi
  echo "no locales scheduled for $today — nothing to write ($remaining item(s) still queued for later dates)"
else
  echo "writing for: $locales"
  for locale in $locales; do
    /usr/bin/node scripts/content/generate.mjs --locale "$locale"
    status=$?
    echo "generate $locale exit=$status"
    # generate.mjs exits non-zero when *any* item failed, even if others were written. Failing
    # the whole run right here would throw away the articles that did succeed, so the count is
    # carried to the end instead: verify still gates what ships, and the non-zero exit still
    # reaches the webhook. It is not downgraded to a warning — that was the bug.
    if [ "$status" -ne 0 ]; then
      GENERATE_FAILURES=$((GENERATE_FAILURES + 1))
      echo "ERROR: generate $locale reported failures (exit=$status)"
    fi
  done
fi

# Illustrate before gating. `publish.mjs` refuses to publish an article with no hero image, so
# without this step every newly written article waits forever and the run ends having published
# nothing — the images were only ever produced by hand from the workstation. The gateway path is
# used automatically because CLUSTER_HOST is unset on this host.
/usr/bin/node scripts/content/images.mjs
images_status=$?
echo "images exit=$images_status"
if [ "$images_status" -ne 0 ]; then
  # Not fatal: a gateway hiccup on one prompt must not block the articles that do have images.
  # Any article still missing one is held by publish.mjs, which reports the count below.
  echo "WARNING: images reported failures (exit=$images_status); unillustrated articles will wait"
fi

# Must match the base deploy-www.sh builds with, or the gate checks the wrong place: verify probes
# the URL the page will request, so a mismatch here either fails healthy articles (CDN base, files
# only on disk) or passes broken ones. Both scripts now default to serving media from this host's
# public/media; export a base to move them behind a CDN.
export NEXT_PUBLIC_MEDIA_BASE="${NEXT_PUBLIC_MEDIA_BASE-}"

/usr/bin/node scripts/content/verify.mjs
verify_status=$?
echo "verify exit=$verify_status (media base: ${NEXT_PUBLIC_MEDIA_BASE:-<local public/>})"
if [ "$verify_status" -ne 0 ]; then
  fail "内容质量门禁未通过（verify.mjs exit=$verify_status），本次不发布" 1
fi

publish_out=$(/usr/bin/node scripts/content/publish.mjs 2>&1)
publish_status=$?
echo "$publish_out"
echo "publish exit=$publish_status"
if [ "$publish_status" -ne 0 ]; then
  fail "发布步骤失败（publish.mjs exit=$publish_status）" 1
fi

# Exit 0 with nothing published is the failure mode that hides: on 2026-10-22 all 131 due
# articles were held for a missing hero image and the run still reported success. Alert, but do
# not abort — a starved day should not stop the deploy of whatever did make it through.
starved=$(printf '%s\n' "$publish_out" | grep -m1 '^STARVED ' || true)
if [ -n "$starved" ]; then
  echo "WARN: 今天有到期内容但没有一篇能发布——${starved#STARVED }"
  /usr/bin/node "$ROOT/scripts/notify.mjs" \
    --stage "daily-guides/starved" \
    --reason "有到期文章，但全部因缺图被拦下，今天没有新内容上线" \
    --raw "$publish_out" || true
fi

if [ "${1:-}" != "--no-build" ]; then
  # One deploy entry point: staging build, atomic swap, restart only on success.
  "$ROOT/scripts/deploy-www.sh"
  deploy_status=$?
  echo "deploy exit=$deploy_status"
  if [ "$deploy_status" -ne 0 ]; then
    fail "站点构建或部署失败（deploy-www.sh exit=$deploy_status），线上仍是上一版" 1
  fi
fi

# Content that failed to generate is a real failure even when verify passes on what exists:
# the schedule expects those articles today and they are not there. Checked last so the alert
# names the cause rather than a downstream symptom, but before the success line is printed.
if [ "$GENERATE_FAILURES" -ne 0 ]; then
  fail "有 $GENERATE_FAILURES 个语言的条目生成失败（详见上方 ERROR 与 .state.jsonl）" 1
fi

echo "=== $(date -Is) daily-guides done ==="
