#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const intervalMs = Math.max(30, Number(process.env.ENRICH_INTERVAL_MINUTES || 360)) * 60 * 1000;

for (;;) {
  console.log(`[enrich-loop] ${new Date().toISOString()}`);
  const gen = spawnSync(process.execPath, [join(ROOT, "scripts/enrichment/generate-assets.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (gen.status !== 0) console.error(`[enrich-loop] generate exited ${gen.status}`);

  // Validate straight after producing: a broken batch should be visible on the next tick,
  // not discovered when a page renders with a missing image.
  const check = spawnSync(process.execPath, [join(ROOT, "scripts/enrichment/validate-images.mjs")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (check.status !== 0) console.error(`[enrich-loop] validation failed (${check.status})`);

  await new Promise((r) => setTimeout(r, intervalMs));
}
