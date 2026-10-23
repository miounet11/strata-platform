#!/usr/bin/env node
/**
 * Failure alerts to a Feishu incoming webhook.
 *
 *   node scripts/notify.mjs --stage "daily-guides" --reason "verify exit=1" --raw "$(tail -20 log)"
 *   NOTIFY_WEBHOOK=... node scripts/notify.mjs --stage x --reason y
 *
 * Why this exists: every scheduled job on the host wrote its failure to a local log file and
 * exited. `daily-guides` failed twice on 2026-10-21/22 — first with a missing directory, then with
 * HTTP 401 from the LLM endpoint — and both times the only record was `/var/log/stratat-guides.log`
 * on the box. Nothing reached a human, so the site simply stopped gaining articles.
 *
 * Design rules:
 *  - The webhook URL is a credential. It comes from `NOTIFY_WEBHOOK` (set in /opt/stratat/.env,
 *    gitignored, root-owned), never from a literal in this file. `FEISHU_WEBHOOK_URL` is accepted
 *    as a fallback because that is the name `daily-guides.sh` already exports and loads from the
 *    same .env: reading only one of the two meant a radar merge alert was dropped on 2026-10-23
 *    while the failure path in the shell was delivering normally.
 *  - A failed notification must not change the caller's exit code. The caller is already failing;
 *    throwing here would replace a useful error with "webhook unreachable". Log and return.
 *  - It is fire-and-forget with a hard timeout: an unresponsive webhook must not hold a cron job
 *    open, because cron does not kill overlapping runs.
 */
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 10_000;
/** Truncated so a 200 KB stack trace does not exceed Feishu's 30 KB message cap and get dropped. */
const RAW_LIMIT = 2_400;

/** Strip credentials before they leave the host. Logs contain Authorization headers and the API
 *  key in curl error output. Deliberately narrow: a blanket "long word is a secret" rule mangles
 *  slugs and URLs, which are the parts that make an alert useful. */
function redact(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1***")
    .replace(/([?&](?:key|token|api_key|apikey)=)[^&\s"']+/gi, "$1***");
}

export async function notifyFeishu({ stage, reason, raw = "", host = "", title = "" }) {
  const webhook = process.env.NOTIFY_WEBHOOK || process.env.FEISHU_WEBHOOK_URL;
  if (!webhook) {
    console.error(
      "[notify] neither NOTIFY_WEBHOOK nor FEISHU_WEBHOOK_URL is set — alert dropped:",
      stage,
      "|",
      reason,
    );
    return { ok: false, error: "no webhook configured (NOTIFY_WEBHOOK / FEISHU_WEBHOOK_URL)" };
  }

  const where = host || process.env.HOSTNAME || "unknown-host";
  // A report is not a failure. The prefix used to be hardcoded, so anything routed through this
  // function arrived titled 「Strata 发布失败」 — a daily traffic summary would have read as an
  // outage. Callers that are failures keep the original wording.
  const body = title
    ? [`【${title}】`, `主机：${where}`, `时间：${new Date().toISOString()}`, "", reason].join("\n")
    : [
        `【Strata 发布失败】${stage}`,
        `主机：${where}`,
        `时间：${new Date().toISOString()}`,
        `原因：${reason}`,
        "",
        raw ? `原文（已脱敏，最多 ${RAW_LIMIT} 字）：\n${redact(raw).slice(-RAW_LIMIT)}` : "",
      ]
        .filter(Boolean)
        .join("\n");

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: body } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => ({}));
    // Feishu answers HTTP 200 even for a bad payload; the real verdict is in the body.
    const code = payload.code ?? payload.StatusCode;
    if (!response.ok || (code !== undefined && code !== 0)) {
      const detail = JSON.stringify(payload).slice(0, 300);
      console.error(`[notify] webhook rejected the alert (http=${response.status} code=${code}): ${detail}`);
      return { ok: false, error: detail };
    }
    console.log(`[notify] alerted: ${stage} | ${reason}`);
    return { ok: true };
  } catch (error) {
    console.error(`[notify] could not reach the webhook: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

/**
 * Wrap a scheduled job so its failure reaches a human. Writes a marker file as well: the marker is
 * what lets the next run tell "this has been broken since Tuesday" apart from "it just broke", and
 * it survives the notification itself failing.
 */
export async function guard(stage, fn, { markerDir = ROOT } = {}) {
  const marker = join(markerDir, `.alert-${stage}.json`);
  try {
    const result = await fn();
    return result;
  } catch (error) {
    const reason = error?.message || String(error);
    const raw = error?.stack || "";
    try {
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(marker, JSON.stringify({ stage, at: new Date().toISOString(), reason }, null, 2));
    } catch (writeError) {
      console.error(`[notify] could not write marker ${marker}: ${writeError.message}`);
    }
    await notifyFeishu({ stage, reason, raw });
    throw error;
  }
}

export function notifyLogPath() {
  return join(ROOT, ".logs", "alerts.ndjson");
}

export function appendAlertLog(entry) {
  try {
    mkdirSync(dirname(notifyLogPath()), { recursive: true });
    appendFileSync(notifyLogPath(), `${JSON.stringify(entry)}\n`);
  } catch {
    // Logging the log failure is not worth a second failure path.
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────
/** Accepts both `--stage=x` and `--stage x`. The first version only handled `=`, so the shell
 *  callers in daily-guides.sh sent literally "true" as every value. */
export function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const body = argv[i].slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      out.set(body.slice(0, eq), body.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out.set(body, argv[++i]);
    } else {
      out.set(body, "true");
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const stage = args.get("stage") || "unknown";
  const reason = args.get("reason") || "(no reason given)";
  const raw = args.get("raw") || "";
  await notifyFeishu({ stage, reason, raw });
  // Always exit 0: the caller is already handling a real failure, and `set -e` would otherwise
  // abort before it prints its own diagnostics.
  process.exit(0);
}
