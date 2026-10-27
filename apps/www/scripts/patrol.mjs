#!/usr/bin/env node
/**
 * Ratchet the build's quality: today's numbers are the floor, tomorrow's may not be worse.
 *
 *   node scripts/patrol.mjs                     # measure, compare to patrol-baseline.json
 *   node scripts/patrol.mjs --update            # measure, then lower the floor where improved
 *   node scripts/patrol.mjs --notify            # also send a Feishu alert on regression
 *   NEXT_DIST_DIR=.next-build node scripts/patrol.mjs
 *
 * Same three checks the deploy already runs — `audit.mjs`, `similarity.mjs`, `verify-sitemap.mjs`
 * — but compared against a recorded floor instead of a fixed threshold. That is what makes it
 * possible to block a deploy while the site is still imperfect: 1,936 duplicate page pairs are
 * today's baseline, so they do not fail the build, and 1,937 does.
 *
 * `--update` only ever lowers a number (or raises the audit score). A regression never rewrites
 * the baseline, so a bad build cannot bless itself.
 *
 * Exit: 0 at or above the floor, 1 below it, 2 the measurement itself failed (no build output,
 * a gate that could not run). 1 and 2 are separate facts: one says the site got worse, the other
 * says nothing was measured.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comparePatrol, parseAudit, parseSimilarity, parseSitemap } from "./patrol-lib.mjs";

const wwwDir = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const dist = process.env.NEXT_DIST_DIR || ".next";
const baselinePath = process.env.PATROL_BASELINE || join(wwwDir, "patrol-baseline.json");
const args = new Set(process.argv.slice(2));

function run(script, extraEnv = {}) {
  const result = spawnSync("node", [join(wwwDir, "scripts", script)], {
    cwd: wwwDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NEXT_DIST_DIR: dist, ...extraEnv },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

if (!existsSync(join(wwwDir, dist, "server", "app"))) {
  console.error(`patrol: no build output at ${dist}/server/app — run a build first`);
  process.exit(2);
}

const auditRun = run("audit.mjs");
const similarityRun = run("similarity.mjs", { SITE_DIR: "." });
const sitemapRun = run("verify-sitemap.mjs");

const current = {
  audit: parseAudit(auditRun.stdout),
  similarity: parseSimilarity(similarityRun.stdout),
  sitemap: parseSitemap(sitemapRun.stdout, sitemapRun.status),
};

// audit exit 2+ or a missing summary means the check did not run; similarity exit 2 is the same
// fact. Both are measurement failures, not findings.
if (auditRun.status > 1 || !current.audit) {
  console.error(`patrol: audit.mjs could not run (exit=${auditRun.status})`);
  console.error(auditRun.stderr.trim().slice(-2000));
  process.exit(2);
}
if (similarityRun.status > 1 || !current.similarity) {
  console.error(`patrol: similarity.mjs could not run (exit=${similarityRun.status})`);
  console.error(similarityRun.stderr.trim().slice(-2000));
  process.exit(2);
}

let baseline = null;
if (existsSync(baselinePath)) {
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch (error) {
    console.error(`patrol: baseline ${baselinePath} is unreadable (${error.message})`);
    process.exit(2);
  }
}

const { regressions, improvements } = comparePatrol(current, baseline);

const floor = baseline ?? current;
console.log(
  `patrol score=${current.audit.score} pairs=${current.similarity.pairs} ` +
    `pages=${current.audit.pages} sitemap=${current.sitemap.urls}`,
);
console.log(
  `floor  score=${floor.audit.score} pairs=${floor.similarity.pairs} ` +
    `(${baseline ? `baseline ${baselinePath}` : "no baseline file yet — run with --update to record one"})`,
);
for (const item of improvements) console.log(`improved: ${item}`);
for (const item of regressions) console.log(`failed=patrol detail=${item}`);

if (regressions.length) {
  console.log(`patrol: ${regressions.length} regression(s) against the floor`);
  if (args.has("--notify")) {
    const { notifyFeishu } = await import("../../../scripts/notify.mjs");
    await notifyFeishu({
      stage: "patrol",
      reason: regressions.join(" | "),
      raw: current.audit.failed
        ? Object.entries(current.audit.failed)
            .map(([id, n]) => `${id}=${n}`)
            .join(" ")
        : "",
    });
  }
  process.exit(1);
}

if (args.has("--update")) {
  // Only improvements are written. `--update` on a clean run is still a no-op, so a caller can
  // run it unconditionally after a deploy without needing to know whether anything changed.
  if (!baseline || improvements.length) {
    writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`patrol: baseline written to ${baselinePath}`);
  } else {
    console.log("patrol: baseline unchanged");
  }
}

console.log("OK");
process.exit(0);
