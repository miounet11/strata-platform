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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) console.warn(`[content-grow] ${cmd} ${args.join(" ")} exit ${r.status}`);
}

const steps = [
  ["pnpm", ["sync:releases"]],
  ["pnpm", ["sync:community"]],
  ["pnpm", ["sync:creator"]],
  ["pnpm", ["sync:intelligence"]],
  ["pnpm", ["sync:downloads"]],
  ["node", ["scripts/sync-changelog-rss.mjs"]],
];

if (process.env.CLUSTER_SSH_PASS || process.env.ENRICH_FORCE === "1") {
  steps.push(["node", ["scripts/enrichment/sync-briefs-from-content.mjs"]]);
  steps.push(["node", ["scripts/enrichment/generate-assets.mjs"]]);
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
  run("pnpm", ["--filter", "@stratat/www", "build"]);
  // next build deletes .next and unlinks the running standalone cwd. postbuild
  // copies static back; restart so strata-www is not left on that deleted directory.
  const pm2 =
    ["/usr/local/bin/pm2", "/usr/bin/pm2"].find((bin) => existsSync(bin)) ?? "pm2";
  run(pm2, ["restart", "strata-www"]);
}
