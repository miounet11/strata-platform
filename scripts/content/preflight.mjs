#!/usr/bin/env node
// Preconditions for the daily content run.
//
// Every failure this checks is one that otherwise surfaces *late*: `daily-guides.sh` generates
// per locale (minutes each), then illustrates, then verifies, then publishes. A dead LLM endpoint
// or a revoked key makes every one of those generation calls retry to exhaustion, so the run burns
// an hour before the publish gate reports "nothing was written". The 2026-10-22 run showed the same
// shape from a different cause: 131 due articles all held, job reported success.
//
// So this runs first and stays cheap: a handful of local file checks plus one 1-token completion.
// Exits 1 with a named reason on the first problem, so the alert says what is broken rather than
// just that the run died.
//
//   node scripts/content/preflight.mjs [--no-network]
//
// --no-network skips the LLM probe, for use in dry runs and tests.

import { statSync, existsSync, accessSync, constants, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const noNetwork = process.argv.includes("--no-network");
const localOnly = process.argv.includes("--local-only");

const problems = [];
const note = (msg) => problems.push(msg);

function env(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : "";
}

// --- required configuration -------------------------------------------------
//
// `--local-only` checks disk/plan/out/media without requiring LLM credentials, so daily-guides.sh
// can still run radar, topic mining, procedural covers, and publishing even when LLM keys are
// absent or rotated.
if (!localOnly) {
  for (const name of ["CONTENT_LLM_API_KEY", "CONTENT_LLM_BASE_URL", "CONTENT_LLM_MODEL"]) {
    if (!env(name)) note(`${name} 未设置（应写在 /opt/stratat/.env）`);
  }
}

// --- local inputs the run reads in place ------------------------------------

const plan = join(ROOT, "scripts/content/plan.json");
if (!existsSync(plan)) {
  note(`排期文件缺失：${plan}`);
} else {
  // Parsed, not just stat'd: a truncated plan.json from a half-finished write parses as valid
  // JSON only sometimes, and the failure it causes downstream ("no locales for today") looks
  // like an empty schedule rather than a broken file.
  try {
    const p = JSON.parse(readFileSync(plan, "utf8"));
    if (!Array.isArray(p.items)) note(`排期文件格式错误：${plan} 缺少 items 数组`);
  } catch (err) {
    note(`排期文件不是合法 JSON：${plan}（${err.message}）`);
  }
}

const outDir = join(ROOT, "scripts/content/out");
if (!existsSync(outDir)) note(`内容目录缺失：${outDir}`);
else if (!statSync(outDir).isDirectory()) note(`内容路径不是目录：${outDir}`);

// The publish step writes here. Checking writability up front catches a full disk or a bad
// mount at minute zero instead of after generation.
try {
  accessSync(outDir, constants.W_OK);
} catch {
  note(`内容目录不可写：${outDir}（磁盘满或挂载只读）`);
}

// Hero images are served from here unless a CDN base is configured; publish.mjs holds every
// article that has no image, so a missing tree means a starved day rather than a loud failure.
const mediaDir = join(ROOT, "apps/www/public/media");
if (!env("NEXT_PUBLIC_MEDIA_BASE") && !existsSync(mediaDir)) {
  note(`图片目录缺失且未配置 NEXT_PUBLIC_MEDIA_BASE：${mediaDir}`);
}

// --- disk headroom ----------------------------------------------------------
//
// A build plus a snapshot needs room; cleanyourtv uses 2 GB and the same number is sane here.
// `statfs` is not exposed by node, so this uses the same `df -Pm` the shell version used.
try {
  const freeMb = Number(
    execFileSync("df", ["-Pm", ROOT], { encoding: "utf8" }).split("\n")[1].split(/\s+/)[3],
  );
  if (!Number.isFinite(freeMb) || freeMb < 2048) {
    note(`磁盘余量不足：${freeMb}MB（需要 2048MB）`);
  }
} catch (err) {
  note(`无法读取磁盘余量：${err.message}`);
}

// --- LLM reachability -------------------------------------------------------
//
// The expensive failure. A 1-token completion exercises exactly what generation needs: DNS, TLS,
// the Authorization header, and that the configured model name is one this endpoint serves.
// Retries are off by design — preflight must answer "is it up now", not wait for it to recover.

if (!localOnly && !noNetwork && env("CONTENT_LLM_API_KEY") && env("CONTENT_LLM_BASE_URL") && env("CONTENT_LLM_MODEL")) {
  const base = env("CONTENT_LLM_BASE_URL").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("CONTENT_LLM_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env("CONTENT_LLM_MODEL"),
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      // The body names the reason on 401/404 (bad key, unknown model) and is empty on 5xx, so it
      // is truncated rather than dropped.
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      note(`LLM 端点返回 HTTP ${res.status}（${base}/chat/completions）${body ? `: ${body}` : ""}`);
    }
  } catch (err) {
    note(`LLM 端点不可达（${base}/chat/completions）：${err.message}`);
  }
}

// --- report -----------------------------------------------------------------

if (problems.length) {
  for (const p of problems) console.error(`preflight: ${p}`);
  process.exit(1);
}
console.log("preflight: ok");
