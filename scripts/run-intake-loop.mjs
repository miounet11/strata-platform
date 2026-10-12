#!/usr/bin/env node
/**
 * Long-running intake loop for VPS or dev machine.
 *
 *   INTAKE_INTERVAL_MINUTES=30 node scripts/run-intake-loop.mjs
 *   INTAKE_RUN_CREATOR=0  — skip creator-pulse refresh (on by default)
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runIntelligenceSync } from "./sync-intelligence.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const intervalMs = Math.max(5, Number(process.env.INTAKE_INTERVAL_MINUTES || 60)) * 60 * 1000;

function runNodeScript(rel) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, rel)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${rel} exit ${code}`))));
  });
}

async function safe(rel, fn) {
  try {
    await fn();
  } catch (e) {
    console.error(`[intake loop] ${rel} failed: ${e.message} — continuing tick`);
  }
}

async function tick(n) {
  console.log(`\n[intake loop] tick #${n} ${new Date().toISOString()}`);
  await safe("sync-intelligence", runIntelligenceSync);
  // releases + changelog first: newest data is what search engines see
  if (process.env.INTAKE_RUN_RELEASES !== "0") {
    await safe("sync-releases", () => runNodeScript("scripts/sync-releases.mjs"));
  }
  if (process.env.INTAKE_RUN_CHANGELOG !== "0") {
    await safe("sync-changelog", () => runNodeScript("scripts/sync-changelog-rss.mjs"));
  }
  if (process.env.INTAKE_RUN_CREATOR !== "0") {
    await safe("sync-creator", () => runNodeScript("scripts/sync-creator-social.mjs"));
  }
  // freshness watcher: rebuilds + IndexNow when new releases appear.
  // loop already synced data this tick, so skip the watcher's own sync.
  if (process.env.INTAKE_FRESHNESS !== "0") {
    await safe(
      "freshness-watch",
      () =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [join(ROOT, "scripts/freshness-watch.mjs")], {
            stdio: "inherit",
            env: { ...process.env, FRESHNESS_SKIP_SYNC: "1" },
          });
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`freshness-watch exit ${code}`))));
        }),
    );
  }
  if (process.env.INTAKE_REBUILD_WWW === "1") {
    console.log("[intake loop] rebuild: run `pnpm --filter @stratat/www build` (or pm2 restart) on server");
  }
}

let n = 0;
async function loop() {
  for (;;) {
    n += 1;
    try {
      await tick(n);
    } catch (e) {
      console.error("[intake loop] error:", e.message);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

loop();
