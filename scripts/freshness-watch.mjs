#!/usr/bin/env node
/**
 * Freshness watcher: detect new Strata releases / community activity and
 * rebuild the site immediately instead of waiting for the daily rebuild.
 *
 *   node scripts/freshness-watch.mjs            (one shot — used by loop & cron)
 *
 * Logic:
 *  1. Sync releases + changelog data.
 *  2. Compare the top release tag / newest publishedAt against .freshness-state.json.
 *  3. On change — or when .freshness-build-failed exists and data is unchanged —
 *     rebuild www (standalone), pm2 restart, submit IndexNow.
 *     The build is tried 3 times (2 retries, 60s apart). Final failure alerts on
 *     stderr and writes .freshness-build-failed (ISO timestamp). State is written
 *     only after a successful build; the marker is removed then.
 *  4. Always exit 0 — a failed rebuild must not break the loop.
 *  5. Append one NDJSON line per key node to .logs/freshness.log.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareState } from "./freshness-state.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, ".freshness-state.json");
const LOCK = join(ROOT, ".freshness.lock");
const FAILED_MARK = join(ROOT, ".freshness-build-failed");
const RELEASES = join(ROOT, "apps/www/src/data/releases.json");
const FRESHNESS_LOG = join(ROOT, ".logs", "freshness.log");
// One attempt per run. A full build exceeds 40 minutes on the production box, so retrying 60s
// after an OOM just starts the same doomed build again and the retry itself competes for the memory
// that killed the first one. `.freshness-build-failed` already forces the next scheduled run to
// rebuild, which is a natural back-off at the cron interval instead of a tight loop.
const BUILD_ATTEMPTS = 1;
const BUILD_RETRY_MS = 60_000;

const log = (...a) => console.log("[freshness]", ...a);

// NDJSON: {"ts","event","detail"}. A log failure must not affect the main flow.
function appendLog(event, detail) {
  try {
    mkdirSync(dirname(FRESHNESS_LOG), { recursive: true });
    appendFileSync(
      FRESHNESS_LOG,
      `${JSON.stringify({ ts: new Date().toISOString(), event, detail: String(detail ?? "") })}\n`,
    );
  } catch {
    // ignore
  }
}

// single-instance lock: cron and intake loop may both call this
let lockFd = null;
try {
  lockFd = openSync(LOCK, "wx");
  writeSync(lockFd, JSON.stringify({ pid: process.pid, at: Date.now() }));
} catch (err) {
  if (err.code !== "EEXIST") {
    log(`cannot create lock (${err.message}) — exiting`);
    process.exit(0);
  }
  // EEXIST: either another live run holds it, or a stale/corrupt file remains
  let stale = null;
  try {
    stale = JSON.parse(readFileSync(LOCK, "utf8"));
  } catch {
    stale = null; // corrupt/truncated/empty lock file
  }
  const alivePid =
    stale?.pid &&
    (() => {
      try {
        process.kill(stale.pid, 0);
        return true;
      } catch (e) {
        return e.code === "EPERM"; // running but not ours
      }
    })();
  const fresh = stale && Date.now() - (stale.at ?? 0) < 45 * 60 * 1000;
  if (alivePid && fresh) {
    const detail = `another run holds the lock (pid=${stale.pid}) — exiting`;
    log(detail);
    appendLog("lock-skip", detail);
    process.exit(0);
  }
  // reclaim: dead process, missing pid, stale age, or corrupt file
  log(
    stale
      ? `reclaiming lock (pid=${stale.pid ?? "?"} age=${Math.round((Date.now() - (stale.at ?? 0)) / 60000)}min)`
      : "reclaiming corrupt lock file",
  );
  try {
    unlinkSync(LOCK);
  } catch {}
  lockFd = openSync(LOCK, "wx");
  writeSync(lockFd, JSON.stringify({ pid: process.pid, at: Date.now() }));
}
process.on("exit", () => {
  try {
    closeSync(lockFd);
    // only remove the lock if we still own it (pid matches)
    const owner = JSON.parse(readFileSync(LOCK, "utf8"));
    if (owner.pid === process.pid) unlinkSync(LOCK);
  } catch {}
});

/** Last non-zero status, so a failure alert can name the exit code instead of just "it failed". */
let lastStatus = 0;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env, ...opts });
  lastStatus = r.status;
  return r.status === 0;
}

// Capture instead of inherit, so the caller can log what a helper reported. Used where the exit
// code alone is not enough to tell a success from a silent no-op (IndexNow submissions).
function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    ...opts,
  });
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

// sync sleep; no PATH lookup so cron still waits the full interval
function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Deploy through `deploy-www.sh`, never `pnpm build` directly.
//
// `pnpm --filter @stratat/www build` writes into `apps/www/.next`, which is the exact tree the
// live pm2 process is serving from. A build that dies part-way (OOM, killed, timed out) therefore
// leaves the running site without `server.js` and every request 502s — that is what took the site
// down on 2026-10-30. deploy-www.sh builds into `.next-build` and only renames it into place after
// the build, sitemap check and patrol gate all pass, so a failed build leaves the live tree alone.
function buildWww() {
  for (let attempt = 1; attempt <= BUILD_ATTEMPTS; attempt++) {
    if (run("bash", ["scripts/deploy-www.sh"])) return true;
    const detail = `ERROR: www build failed (attempt ${attempt}/${BUILD_ATTEMPTS})`;
    log(detail);
    if (attempt === BUILD_ATTEMPTS) appendLog("rebuild-fail", detail);
    if (attempt < BUILD_ATTEMPTS) {
      log(`retrying www build (${attempt}/${BUILD_ATTEMPTS})…`);
      sleepMs(BUILD_RETRY_MS);
    }
  }
  return false;
}

function alertBuildFailed(detail = "") {
  const at = new Date().toISOString();
  writeFileSync(FAILED_MARK, `${at}\n`);
  const bar = "!".repeat(72);
  console.error("");
  console.error(bar);
  console.error(`[freshness] ALERT: www build failed after ${BUILD_ATTEMPTS} attempt(s)`);
  console.error("[freshness] state NOT advanced — previous site build stays live");
  console.error(`[freshness] wrote .freshness-build-failed (${at})`);
  console.error("[freshness] next run forces one rebuild if the data is unchanged");
  console.error(bar);
  console.error("");

  // The marker above is local to this host and only this script reads it, so it is not a
  // notification. Fire the webhook without awaiting: the caller (`main`) runs from cron, and a
  // stalled webhook must not hold the process open past its own work.
  import("./notify.mjs")
    .then(({ notifyFeishu }) =>
      notifyFeishu({
        stage: "freshness-watch/build",
        reason: "站点重建连续 3 次失败，线上仍是上一版",
        raw: `${detail}\n\nmarker: ${FAILED_MARK} @ ${at}`,
      }),
    )
    .catch((error) => console.error(`[freshness] alert failed: ${error.message}`));
}

function clearBuildFailedMark() {
  if (!existsSync(FAILED_MARK)) return;
  try {
    unlinkSync(FAILED_MARK);
  } catch (err) {
    log(`WARN: could not remove .freshness-build-failed (${err.message})`);
  }
}

/**
 * The identity of the data, not just its size.
 *
 * Comparing counts alone was wrong: the changelog feed is a sliding window over an RSS source,
 * so publishing new entries legitimately drops old ones and can leave the count lower than
 * before. The watcher read that as "the sync broke, skip the rebuild" and the site stayed on
 * v0.2.7 for eleven days while v0.2.8–v0.2.12 sat in the data files.
 *
 * The rules live in `freshness-state.mjs` so they can be tested without running a build.
 */
function fingerprint() {
  const rel = readJson(RELEASES);
  const releases = rel?.releases ?? [];
  const top = releases
    .slice()
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))[0];
  const changelog = readJson(join(ROOT, "apps/www/src/data/changelog.json"));
  const items = changelog?.items ?? [];
  const releaseTags = releases.map((r) => r.tag).filter(Boolean).sort();
  const changelogIds = items.map((i) => i.id).filter(Boolean).sort();
  return {
    topTag: top?.tag ?? "",
    releaseCount: releases.length,
    changelogTop: items[0]?.id ?? "",
    changelogCount: items.length,
    releaseTags,
    changelogIds,
  };
}

// first run = no state file yet; empty releases.json must NOT loop rebuilds
const firstRun = !existsSync(STATE);

// ---- 1. sync data ---------------------------------------------------------
if (process.env.FRESHNESS_SKIP_SYNC === "1") {
  const detail = "skip sync (caller already refreshed data)";
  log(detail);
  appendLog("sync", detail);
} else {
  const detail = "syncing releases + changelog…";
  log(detail);
  appendLog("sync", detail);
  if (process.env.FRESHNESS_SKIP_RELEASES !== "1") {
    if (!run("node", ["scripts/sync-releases.mjs"])) {
      const warn = "WARN: sync-releases failed";
      log(warn);
      appendLog("sync", warn);
    }
  }
  if (process.env.FRESHNESS_SKIP_CHANGELOG !== "1") {
    if (!run("node", ["scripts/sync-changelog-rss.mjs"])) {
      const warn = "WARN: sync-changelog failed";
      log(warn);
      appendLog("sync", warn);
    }
  }
}

// ---- 2. compare -----------------------------------------------------------
const prev = readJson(STATE) ?? {};
const next = fingerprint();

const verdict = compareState(prev, next, { firstRun });
if (verdict.degraded) {
  const detail = `data looks degraded (releases ${prev.releaseCount}->${next.releaseCount}, changelog ${prev.changelogCount}->${next.changelogCount}) — skipping rebuild`;
  log(detail);
  appendLog("degraded", detail);
  process.exit(0);
}
const changed = verdict.changed;

const priorBuildFailed = existsSync(FAILED_MARK);
if (!changed && !priorBuildFailed) {
  const detail = `no change (top=${next.topTag}). done.`;
  log(detail);
  appendLog("no-change", detail);
  writeFileSync(STATE, JSON.stringify(next, null, 2));
  process.exit(0);
}

if (!changed) {
  const detail = `no change (top=${next.topTag}) but .freshness-build-failed exists — forcing rebuild`;
  log(detail);
  appendLog("rebuild-start", detail);
} else {
  const detail = firstRun
    ? `first run — building baseline ${next.topTag}…`
    : `NEW CONTENT detected: ${prev.topTag || "(none)"} -> ${next.topTag}. rebuilding…`;
  log(detail);
  appendLog(firstRun ? "first-run" : "rebuild-start", detail);
}

// ---- 3. rebuild + restart (state advances only after success) -------------
if (!buildWww()) {
  alertBuildFailed(`bash scripts/deploy-www.sh exit=${lastStatus}（${BUILD_ATTEMPTS} 次尝试均失败）`);
  process.exit(0);
}
appendLog("rebuild-ok", `www build ok (top=${next.topTag})`);
clearBuildFailedMark();
writeFileSync(STATE, JSON.stringify(next, null, 2));

// deploy-www.sh already copied `public/` and `.next/static` into the standalone tree and
// restarted pm2 after the swap. Nothing to restart from here.

// ---- 4. notify IndexNow ---------------------------------------------------
// Record what the submission actually returned, not just that it ran. `"IndexNow pinged."` could
// not distinguish "200, 412 URLs accepted" from "403, key rejected" — both left the same line in
// the log, so a failing submission looked identical to a working one. The submitter prints
// `indexnow <status> — <n> urls` and exits non-zero on a rejected status; capture and log that.
const indexnow = runCapture("node", ["scripts/indexnow-submit.mjs"]);
const indexnowLine = indexnow.stdout.split("\n").find((line) => line.startsWith("indexnow")) ?? "";
if (indexnow.code === 0) {
  const detail = indexnowLine || "IndexNow submitted (no status line)";
  log(detail);
  appendLog("indexnow", detail);
} else {
  // A rejected submission is a real failure, not a warning: the new URLs stay undiscovered until
  // the next run. Log it with the exit code so the log shows which side broke.
  const detail = `IndexNow failed (exit=${indexnow.code}): ${indexnowLine || indexnow.stderr.trim().slice(0, 200)}`;
  log(detail);
  appendLog("indexnow-fail", detail);
}

log(`done ${new Date().toISOString()}`);
