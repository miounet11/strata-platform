#!/usr/bin/env node
/**
 * Tell IndexNow (Bing, Yandex, and partners) which URLs changed.
 * The key is public: apps/www/public/<key>.txt must match INDEXNOW_KEY.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const KEY = publicKey();
const urls = new Set();
for (const path of hubs) addLocales(urls, path);

const releases = loadJson("apps/www/src/data/releases.json");
for (const release of releases?.releases ?? []) {
  if (release?.tag) addLocales(urls, `/releases/${release.tag}`);
}

const benchmarks = loadJson("apps/www/src/data/benchmarks.json");
for (const rig of benchmarks?.rigs ?? []) addLocales(urls, `/benchmarks/${rig.id}`);

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

const urlList = [...urls].slice(0, 500);
if (!KEY) {
  console.log(`indexnow skipped — no public key (${urlList.length} URLs ready)`);
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
console.log(`indexnow ${res.status} — ${urlList.length} urls — ${text.slice(0, 180)}`);
if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
