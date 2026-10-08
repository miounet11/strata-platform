#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const intervalMs = Math.max(30, Number(process.env.ENRICH_INTERVAL_MINUTES || 360)) * 60 * 1000;

for (;;) {
  console.log(`[enrich-loop] ${new Date().toISOString()}`);
  spawnSync(process.execPath, [join(ROOT, "scripts/enrichment/generate-assets.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  await new Promise((r) => setTimeout(r, intervalMs));
}
