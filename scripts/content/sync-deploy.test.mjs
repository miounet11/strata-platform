import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const SYNC_SCRIPT = new URL("../../deploy/sync-and-deploy.sh", import.meta.url).pathname;
const CRON_SCRIPT = new URL("../../deploy/install-content-cron.sh", import.meta.url).pathname;
const GUIDES_SCRIPT = new URL("../../scripts/content/daily-guides.sh", import.meta.url).pathname;

test("deploy and cron shell scripts pass bash -n syntax check", () => {
  for (const script of [SYNC_SCRIPT, CRON_SCRIPT, GUIDES_SCRIPT]) {
    execFileSync("bash", ["-n", script], { stdio: "pipe" });
  }
});

test("sync-and-deploy.sh prints help cleanly and never deletes server runtime trees", () => {
  const help = execFileSync("bash", [SYNC_SCRIPT, "--help"], { encoding: "utf8" });
  assert.match(help, /--dry-run/);
  assert.match(help, /--revalidate/);
  assert.match(help, /--sync-only/);
  assert.match(help, /--with-cron/);

  const src = readFileSync(SYNC_SCRIPT, "utf8");
  // Must NEVER run destructive root-level rsync --delete onto /opt/stratat/ or call remote-bootstrap.sh.
  assert.doesNotMatch(src, /remote-bootstrap\.sh/);
  assert.doesNotMatch(src, /"\$ROOT\/"\s+"\$USER@\$HOST:\/opt\/stratat\/"/);
  // Must protect apps/www/src/data/ and apps/www/public/media/.
  assert.match(src, /--filter 'protect \/data\/\*\*'/);
  assert.match(src, /--filter 'protect \/media\/\*\*'/);
  // Must exclude server-owned content runtime files.
  for (const guarded of [
    "content/out/",
    "content/plan.json",
    "content/radar-state.json",
    "content/traffic-board.json",
  ]) {
    assert.ok(src.includes(guarded), `expected ${guarded} to be excluded in sync-and-deploy.sh`);
  }
  // Catalog allowlist must NOT include live server corpora.
  const allowBlock = src.match(/CATALOG_DATA_FILES=\(([\s\S]*?)\)/)?.[1] ?? "";
  assert.ok(allowBlock.includes("gpus.json"), "gpus.json should be in catalog allowlist");
  assert.ok(allowBlock.includes("topics.json"), "topics.json should be in catalog allowlist");
  for (const liveCorpus of [
    "releases.json",
    "community.json",
    "downloads.json",
    "changelog.json",
    "vps-deals.json",
    "media-manifest.json",
    "intelligence-pulse.json",
    "creator-pulse.json",
  ]) {
    assert.ok(
      !allowBlock.includes(liveCorpus),
      `server-owned corpus ${liveCorpus} must NOT be in CATALOG_DATA_FILES`,
    );
  }
});

test("install-content-cron.sh configures twice-daily guides and hourly freshness watch", () => {
  const cron = readFileSync(CRON_SCRIPT, "utf8");
  assert.match(cron, /45 6,18 \* \* \* .*daily-guides\.sh/);
  assert.match(cron, /20 \* \* \* \* .*freshness-watch\.mjs/);
  assert.match(cron, /15 0,4,8,12,16,20 \* \* \* .*content-grow\.mjs/);
  assert.match(cron, /5 6 \* \* \* .*CONTENT_GROW_REBUILD=1/);
  // Must not filter out or overwrite unrelated jobs like stratat-vps-deals-daily.
  const nonComments = cron.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(nonComments, /stratat-vps-deals-daily/);
});

test("daily-guides.sh uses twice-daily cadence defaults (25 publish cap, 10 per locale)", () => {
  const guides = readFileSync(GUIDES_SCRIPT, "utf8");
  assert.match(guides, /PUBLISH_DAILY_CAP:-25/);
  assert.match(guides, /CONTENT_PER_LOCALE_LIMIT:-10/);
  assert.match(guides, /flock -n 8/);
});
