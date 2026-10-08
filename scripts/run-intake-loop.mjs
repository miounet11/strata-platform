#!/usr/bin/env node
/**
 * Long-running intake loop for VPS or dev machine.
 *
 *   INTAKE_INTERVAL_MINUTES=30 node scripts/run-intake-loop.mjs
 *   INTAKE_RUN_CREATOR=1  — also refresh creator-pulse after each tick
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

async function tick(n) {
  console.log(`\n[intake loop] tick #${n} ${new Date().toISOString()}`);
  await runIntelligenceSync();
  if (process.env.INTAKE_RUN_CREATOR !== "0") {
    await runNodeScript("scripts/sync-creator-social.mjs");
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
