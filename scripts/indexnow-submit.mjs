#!/usr/bin/env node
/**
 * Tell IndexNow (Bing, Yandex, and partners) which URLs changed.
 * The key is public: apps/www/public/<key>.txt must match INDEXNOW_KEY.
 *
 * Default (no --since): hubs + every release + benchmarks + newest
 * issues/pulls/posts + every live guide, capped at 500. Same list as before this flag existed,
 * plus guides — see below.
 *
 * --since <ISO> or FRESHNESS_SINCE: only release / issue / pull / post / guide pages
 * whose publishedAt or updatedAt is strictly later than that instant, expanded
 * per locale. Hub URLs are left out. Zero matches falls back to the full list.
 *
 * Guides were missing from both lists until 2026-10-23: the sitemap committed them, but IndexNow
 * was never told, so the article the radar wrote today waited for a crawler to notice it. For a
 * page whose whole value is being found while the name is still rising, that wait is the
 * difference between traffic and no traffic.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com").replace(/\/$/, "");
const locales = ["en", "zh", "ja", "de", "fr", "es", "pt"];
const hubs = [
  "",
  "/pulse",
  "/releases",
  "/changelog",
  "/download",
  "/benchmarks",
  "/creator",
  "/community",
  "/issues",
  "/pulls",
  "/models",
  "/install",
  "/links",
  "/topics",
];

function loadJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  } catch {
    return null;
  }
}

function publicKey() {
  const fromEnv = process.env.INDEXNOW_KEY?.trim();
  if (fromEnv) return fromEnv;
  const dir = join(ROOT, "apps/www/public");
  for (const name of readdirSync(dir)) {
    if (!/^[a-f0-9]{16,128}\.txt$/.test(name)) continue;
    const body = readFileSync(join(dir, name), "utf8").trim();
    const key = name.replace(/\.txt$/, "");
    if (body === key) return key;
  }
  return "";
}

function addLocales(urls, path) {
  for (const locale of locales) urls.add(`${SITE}/${locale}${path}`);
}

/**
 * Articles the content pipeline has flipped to `live`.
 *
 * Read from the article files rather than the sitemap because only these carry `publishedAt`,
 * which is what `--since` needs: the sitemap is regenerated at build time and has no dates.
 * A guide is written per locale, so it is added under its own locale only — expanding it across
 * all seven would submit six 404s and burn the crawl budget that made the page worth publishing.
 */
function liveGuides() {
  const out = [];
  const outDir = join(ROOT, "scripts/content/out");
  let entries;
  try {
    entries = readdirSync(outDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const name of readdirSync(join(outDir, entry.name))) {
      if (!name.endsWith(".json")) continue;
      const item = loadJson(`scripts/content/out/${entry.name}/${name}`);
      if (item?.status !== "live" || !item.slug || !item.locale) continue;
      out.push({ locale: item.locale, slug: item.slug, t: timeOf(item.publishedAt) });
    }
  }
  return out;
}

function timeOf(iso) {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

/** CLI wins over FRESHNESS_SINCE. Empty means the historical full submit. */
function readSince() {
  let values;
  try {
    ({ values } = parseArgs({
      options: { since: { type: "string" }, print: { type: "boolean" } },
      strict: true,
    }));
  } catch (err) {
    console.error(`indexnow: ${err.message}`);
    process.exit(1);
  }
  const raw = (values.since !== undefined ? values.since : (process.env.FRESHNESS_SINCE ?? "")).trim();
  if (!raw) return "";
  if (!Number.isFinite(timeOf(raw))) {
    console.error(`indexnow: invalid since ${JSON.stringify(raw)} (ISO-8601 time expected)`);
    process.exit(1);
  }
  return raw;
}

function collectFull() {
  const urls = new Set();
  // Guides go in first because the 500-URL cap trims from the end: appended last, a freshly
  // published article was the first thing dropped, which is the opposite of what is wanted.
  const guides = liveGuides().sort((a, b) => (b.t || 0) - (a.t || 0));
  for (const guide of guides) urls.add(`${SITE}/${guide.locale}/guides/${guide.slug}`);

  for (const path of hubs) addLocales(urls, path);

  const releases = loadJson("apps/www/src/data/releases.json");
  for (const release of releases?.releases ?? []) {
    if (release?.tag) addLocales(urls, `/releases/${release.tag}`);
  }

  const benchmarks = loadJson("apps/www/src/data/benchmarks.json");
  for (const rig of benchmarks?.rigs ?? []) addLocales(urls, `/benchmarks/${rig.id}`);

  const topics = loadJson("apps/www/src/data/topics.json");
  for (const topic of topics?.topics ?? []) {
    if (topic?.status === "live" && topic.slug) addLocales(urls, `/topics/${topic.slug}`);
  }

  const community = loadJson("apps/www/src/data/community.json");
  const issues = [...(community?.issues ?? [])].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
  const pulls = [...(community?.pulls ?? [])].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
  for (const issue of issues.slice(0, 12)) addLocales(urls, `/issues/${issue.number}`);
  for (const pull of pulls.slice(0, 8)) addLocales(urls, `/pulls/${pull.number}`);

  const creator = loadJson("apps/www/src/data/creator-pulse.json");
  const posts = [...(creator?.posts ?? [])].sort((a, b) =>
    String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
  );
  for (const post of posts.slice(0, 8)) addLocales(urls, `/creator/updates/${post.id}`);

  return urls;
}

function collectIncremental(sinceMs) {
  const ranked = [];
  const releases = loadJson("apps/www/src/data/releases.json");
  for (const release of releases?.releases ?? []) {
    const t = timeOf(release?.publishedAt);
    if (release?.tag && t > sinceMs) ranked.push({ t, path: `/releases/${release.tag}` });
  }

  const community = loadJson("apps/www/src/data/community.json");
  for (const issue of community?.issues ?? []) {
    const t = timeOf(issue?.updatedAt);
    if (issue?.number != null && t > sinceMs) ranked.push({ t, path: `/issues/${issue.number}` });
  }
  for (const pull of community?.pulls ?? []) {
    const t = timeOf(pull?.updatedAt);
    if (pull?.number != null && t > sinceMs) ranked.push({ t, path: `/pulls/${pull.number}` });
  }

  const creator = loadJson("apps/www/src/data/creator-pulse.json");
  for (const post of creator?.posts ?? []) {
    const t = timeOf(post?.publishedAt);
    if (post?.id && t > sinceMs) ranked.push({ t, path: `/creator/updates/${post.id}` });
  }

  // Guides carry their own locale, so they are ranked as full URLs rather than as a path that
  // addLocales would expand across every locale.
  const guideUrls = [];
  for (const guide of liveGuides()) {
    if (guide.t > sinceMs) {
      guideUrls.push({ t: guide.t, url: `${SITE}/${guide.locale}/guides/${guide.slug}` });
    }
  }

  ranked.sort((a, b) => b.t - a.t || a.path.localeCompare(b.path));
  const urls = new Set();
  for (const item of ranked) addLocales(urls, item.path);
  for (const guide of guideUrls) urls.add(guide.url);
  return urls;
}

const sinceRaw = readSince();
let urls;
let modeNote = "";
if (sinceRaw) {
  const incremental = collectIncremental(timeOf(sinceRaw));
  if (incremental.size > 0) {
    urls = incremental;
    modeNote = ` (incremental since ${sinceRaw})`;
  } else {
    urls = collectFull();
    modeNote = ` (full fallback since ${sinceRaw})`;
  }
} else {
  urls = collectFull();
}

const KEY = publicKey();
const urlList = [...urls].slice(0, 500);

// `--print` shows exactly what would be submitted without posting: the 500-URL cap silently
// drops the tail, so "did my new article make the list" is not answerable from the count alone.
if (process.argv.includes("--print")) {
  for (const url of urlList) console.log(url);
  console.log(`(${urlList.length} of ${urls.size} URLs${modeNote})`);
  process.exit(0);
}

if (!KEY) {
  console.log(`indexnow skipped — no public key (${urlList.length} URLs ready)${modeNote}`);
  process.exit(0);
}

const host = new URL(SITE).host;
const body = {
  host,
  key: KEY,
  keyLocation: `${SITE}/${KEY}.txt`,
  urlList,
};

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`indexnow ${res.status} — ${urlList.length} urls${modeNote} — ${text.slice(0, 180)}`);
if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
