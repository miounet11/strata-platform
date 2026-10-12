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
 *  3. On change: rebuild www (standalone), pm2 restart, submit IndexNow.
 *  4. Always exit 0 — a failed rebuild must not break the loop.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE = join(ROOT, ".freshness-state.json");
const LOCK = join(ROOT, ".freshness.lock");
const RELEASES = join(ROOT, "apps/www/src/data/releases.json");

const log = (...a) => console.log("[freshness]", ...a);

// single-instance lock: cron and intake loop may both call this
let lockFd = null;
try {
  lockFd = openSync(LOCK, "wx");
  writeSync(lockFd, JSON.stringify({ pid: process.pid, at: Date.now() }));
} catch {
  // stale lock recovery: kill -9 / reboot leaves the file behind
  try {
    const stale = JSON.parse(readFileSync(LOCK, "utf8"));
    const ageMs = Date.now() - (stale.at ?? 0);
    let alive = false;
    try {
      alive = Boolean(stale.pid && process.kill(stale.pid, 0));
    } catch {
      alive = false; // ESRCH: process is gone
    }
    if (!alive || ageMs > 45 * 60 * 1000) {
      log(`reclaiming stale lock (pid=${stale.pid ?? "?"} age=${Math.round(ageMs / 60000)}min)`);
      unlinkSync(LOCK);
      lockFd = openSync(LOCK, "wx");
      writeSync(lockFd, JSON.stringify({ pid: process.pid, at: Date.now() }));
    } else {
      log(`another run holds the lock (pid=${stale.pid}) — exiting`);
      process.exit(0);
    }
  } catch {
    log("another run holds the lock — exiting");
    process.exit(0);
  }
}
process.on("exit", () => {
  try {
    closeSync(lockFd);
    unlinkSync(LOCK);
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
  log("skip sync (caller already refreshed data)");
} else {
  log("syncing releases + changelog…");
  run("node", ["scripts/sync-releases.mjs"]) || log("WARN: sync-releases failed");
  run("node", ["scripts/sync-changelog-rss.mjs"]) || log("WARN: sync-changelog failed");
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

if (!changed) {
  log(`no change (top=${next.topTag}). done.`);
  writeFileSync(STATE, JSON.stringify(next, null, 2));
  process.exit(0);
}

log(
  firstRun
    ? `first run — building baseline ${next.topTag}…`
    : `NEW CONTENT detected: ${prev.topTag || "(none)"} -> ${next.topTag}. rebuilding…`,
);

// ---- 3. rebuild + restart (state advances only after success) -------------
const rebuilt = run("pnpm", ["--filter", "@stratat/www", "build"]);
if (!rebuilt) {
  log("ERROR: www build failed — state NOT advanced, will retry next tick");
  process.exit(0);
}
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
  log("IndexNow pinged.");
}

log(`done ${new Date().toISOString()}`);
