#!/usr/bin/env node
/**
 * One-shot content growth: sync all corpora, changelog, optional IndexNow, log stats.
 * VPS cron example: 15 0,4,8,12,16,20 * * * cd /opt/stratat && node scripts/content-grow.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Step results are collected instead of only warned: a rebuild that fails must make the cron job
 * exit non-zero, otherwise the schedule reports success while the site serves stale pages.
 */
const failures = [];
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    const line = `[content-grow] ${cmd} ${args.join(" ")} exit ${r.status}`;
    console.warn(line);
    failures.push(line);
  }
  return r.status;
}

const steps = [
  ["pnpm", ["sync:releases"]],
  ["pnpm", ["sync:community"]],
  ["pnpm", ["sync:creator"]],
  ["pnpm", ["sync:intelligence"]],
  ["pnpm", ["sync:downloads"]],
  ["node", ["scripts/sync-changelog-rss.mjs"]],
];

// The image worker lives on a private-network cluster (192.168.2.100); the production VPS is
// public and cannot reach it. Enrichment therefore runs where the cluster is reachable, and
// the VPS only consumes the committed assets. `CLUSTER_HOST` — not the old password var — is
// what actually gates the call.
const canEnrich = Boolean(process.env.CLUSTER_HOST) && process.env.ENRICH_SKIP !== "1";
if (canEnrich || process.env.ENRICH_FORCE === "1") {
  steps.push(["node", ["scripts/enrichment/sync-briefs-from-content.mjs"]]);
  steps.push(["node", ["scripts/enrichment/generate-assets.mjs"]]);
  steps.push(["node", ["scripts/enrichment/validate-images.mjs"]]);
}

console.log(`[content-grow] start ${new Date().toISOString()}`);
for (const [cmd, args] of steps) run(cmd, args);

run("node", ["scripts/indexnow-submit.mjs"]);

const stats = {};
for (const file of [
  "apps/www/src/data/community.json",
  "apps/www/src/data/intelligence-pulse.json",
  "apps/www/src/data/changelog.json",
  "apps/www/src/data/releases.json",
]) {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
    stats[file] = {
      syncedAt: j.syncedAt,
      count:
        j.items?.length ??
        j.signals?.length ??
        j.releases?.length ??
        j.issues?.length ??
        "?",
    };
  } catch {
    stats[file] = "missing";
  }
}

console.log("[content-grow] stats", JSON.stringify(stats, null, 2));
console.log(`[content-grow] done ${new Date().toISOString()}`);
if (process.env.CONTENT_GROW_REBUILD === "1") {
  // Go through the single deploy entry point. Building here directly rewrote the tree the live
  // process was serving from, so a failed build could leave the site on mismatched chunks.
  // deploy-www.sh builds into a staging directory and only swaps after a successful build.
  run("bash", ["scripts/deploy-www.sh"]);
}

if (failures.length) {
  console.error(`[content-grow] ${failures.length} step(s) failed`);
  process.exit(1);
}
