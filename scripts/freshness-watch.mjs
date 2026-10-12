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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, ".freshness-state.json");
const LOCK = join(ROOT, ".freshness.lock");
const FAILED_MARK = join(ROOT, ".freshness-build-failed");
const RELEASES = join(ROOT, "apps/www/src/data/releases.json");
const FRESHNESS_LOG = join(ROOT, ".logs", "freshness.log");
const BUILD_ATTEMPTS = 3;
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

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env, ...opts });
  return r.status === 0;
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

function buildWww() {
  for (let attempt = 1; attempt <= BUILD_ATTEMPTS; attempt++) {
    if (run("pnpm", ["--filter", "@stratat/www", "build"])) return true;
    const detail = `ERROR: www build failed (attempt ${attempt}/${BUILD_ATTEMPTS})`;
    log(detail);
    if (attempt === BUILD_ATTEMPTS) appendLog("rebuild-fail", detail);
    if (attempt < BUILD_ATTEMPTS) {
      log("retrying www build in 60s…");
      sleepMs(BUILD_RETRY_MS);
    }
  }
  return false;
}

function alertBuildFailed() {
  const at = new Date().toISOString();
  writeFileSync(FAILED_MARK, `${at}\n`);
  const bar = "!".repeat(72);
  console.error("");
  console.error(bar);
  console.error("[freshness] ALERT: www build failed after 3 attempts");
  console.error("[freshness] state NOT advanced — previous site build stays live");
  console.error(`[freshness] wrote .freshness-build-failed (${at})`);
  console.error("[freshness] next run forces one rebuild if the data is unchanged");
  console.error(bar);
  console.error("");
}

function clearBuildFailedMark() {
  if (!existsSync(FAILED_MARK)) return;
  try {
    unlinkSync(FAILED_MARK);
  } catch (err) {
    log(`WARN: could not remove .freshness-build-failed (${err.message})`);
  }
}

function fingerprint() {
  const rel = readJson(RELEASES);
  const releases = rel?.releases ?? [];
  const top = releases
    .slice()
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))[0];
  const changelog = readJson(join(ROOT, "apps/www/src/data/changelog.json"));
  const items = changelog?.items ?? [];
  return {
    topTag: top?.tag ?? "",
    releaseCount: releases.length,
    changelogTop: items[0]?.id ?? "",
    changelogCount: items.length,
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
const changed =
  firstRun ||
  prev.topTag !== next.topTag ||
  prev.releaseCount !== next.releaseCount ||
  prev.changelogTop !== next.changelogTop ||
  prev.changelogCount !== next.changelogCount;
// data regression (sync failed → empty/shorter) is NOT new content
const degraded =
  !firstRun &&
  (next.releaseCount < prev.releaseCount ||
    (next.releaseCount === 0 && prev.topTag !== "") ||
    next.changelogCount < prev.changelogCount);
if (degraded) {
  const detail = `data looks degraded (releases ${prev.releaseCount}->${next.releaseCount}, changelog ${prev.changelogCount}->${next.changelogCount}) — skipping rebuild`;
  log(detail);
  appendLog("degraded", detail);
  process.exit(0);
}

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
  alertBuildFailed();
  process.exit(0);
}
appendLog("rebuild-ok", `www build ok (top=${next.topTag})`);
clearBuildFailedMark();
writeFileSync(STATE, JSON.stringify(next, null, 2));

// standalone static copy (same as remote-bootstrap)
const STANDALONE = join(ROOT, "apps/www/.next/standalone/apps/www");
for (const [src, dst] of [
  ["apps/www/.next/static", ".next/static"],
  ["apps/www/public", "public"],
]) {
  if (existsSync(join(ROOT, src))) {
    run("mkdir", ["-p", join(STANDALONE, dst)]);
    run("rsync", ["-a", "--delete", join(ROOT, src) + "/", join(STANDALONE, dst) + "/"]);
  }
}

const pm2Bin = ["/usr/local/bin/pm2", "/usr/bin/pm2"].find((p) => existsSync(p)) ?? "pm2";
run(pm2Bin, ["restart", "strata-www"]) || log("WARN: pm2 restart failed (dev machine?)");

// ---- 4. notify IndexNow ---------------------------------------------------
if (run("node", ["scripts/indexnow-submit.mjs"])) {
  const detail = "IndexNow pinged.";
  log(detail);
  appendLog("indexnow", detail);
}

log(`done ${new Date().toISOString()}`);
