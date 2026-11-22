#!/usr/bin/env node
/**
 * One-shot content growth: sync all corpora, changelog, optional IndexNow, log stats.
 * VPS cron example: 15 0,4,8,12,16,20 * * * cd /opt/stratat && node scripts/content-grow.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// Push synced JSON corpora straight into Next ISR caches without a full site rebuild.
const revalStatus = spawnSync("node", ["scripts/revalidate.mjs", "--scope", "all"], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
}).status;
if (revalStatus !== 0) {
  console.warn(`[content-grow] instant revalidation skipped/failed (exit=${revalStatus})`);
}

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
  //
  // Exit 75 means another deploy held the lock, so nothing was attempted. That is not a failure of
  // this run — the content was already written, and the other deploy is building the same commit.
  // Counted as a failure it would alert every time a manual deploy overlapped the four-hour timer.
  const deployStatus = spawnSync("bash", ["scripts/deploy-www.sh"], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  }).status;
  if (deployStatus === 75) {
    console.warn("[content-grow] deploy skipped: another deploy holds the lock");
  } else if (deployStatus !== 0) {
    const line = `[content-grow] bash scripts/deploy-www.sh exit ${deployStatus}`;
    console.warn(line);
    failures.push(line);
  }
}

if (failures.length) {
  console.error(`[content-grow] ${failures.length} step(s) failed`);
  await alertOnce(failures);
  process.exit(1);
}

/**
 * This job runs every four hours, so a broken step would page six times a day until someone
 * reacts — and six identical pages is how an alert channel stops being read. The marker holds the
 * signature of the last *delivered* failure set: a repeat stays quiet, a new failure speaks up.
 *
 * The marker is only written when the alert actually went out. Recording an undelivered alert would
 * silence the next run too, turning a transient webhook failure into permanent silence.
 */
async function alertOnce(list) {
  const { notifyFeishu } = await import("./notify.mjs");
  const marker = join(ROOT, ".alert-content-grow.json");
  const signature = list.map((line) => line.trim()).sort().join("\n");

  try {
    const previous = JSON.parse(readFileSync(marker, "utf8"));
    if (previous.signature === signature) {
      console.error("[content-grow] same failure set as last alert — suppressed to avoid a repeat page");
      return;
    }
  } catch {
    // No marker yet, or unreadable: treat as new and report.
  }

  const result = await notifyFeishu({
    stage: "content-grow",
    reason: `${list.length} 个步骤失败`,
    raw: signature,
  });
  if (!result.ok) {
    console.error("[content-grow] alert not delivered — marker left untouched so the next run retries");
    return;
  }
  try {
    writeFileSync(marker, JSON.stringify({ signature, at: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.error(`[content-grow] could not write alert marker: ${error.message}`);
  }
}
