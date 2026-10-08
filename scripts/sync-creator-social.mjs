#!/usr/bin/env node
/**
 * Ingest @coldniko (Niko Veit) public posts for strata.com creator pages.
 * Sources (in order): X API v2 (X_BEARER_TOKEN), RSSHub, merge into existing JSON.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps/www/src/data/creator-pulse.json");
const PROFILE = {
  handle: "coldniko",
  name: "Niko Veit",
  xUrl: "https://x.com/coldniko",
  github: "https://github.com/Niko1221",
  strataRepo: "https://github.com/Niko1221/Strata",
  telegram: "https://t.me/veit06",
  region: "Europe",
};

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function loadExisting() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { profile: PROFILE, posts: [], interactions: [] };
  }
}

async function fetchRssHub() {
  try {
    const { fetchRssHubUser } = await import("./intake/lib.mjs");
    const sources = JSON.parse(
      readFileSync(join(ROOT, "scripts/intake/sources.json"), "utf8"),
    );
    const bases = sources.rsshubBaseUrls ?? ["https://rsshub.app"];
    const rows = await fetchRssHubUser("coldniko", bases);
    return rows.map((r) => ({
      id: r.id,
      type: "post",
      title: r.title,
      body: r.body,
      url: r.url,
      publishedAt: r.publishedAt,
      author: PROFILE.handle,
      locales: ["en"],
      tags: inferTags(`${r.title} ${r.body}`),
    }));
  } catch {
    return [];
  }
}

function parseRssItems(xml) {
  const items = [];
  const chunks = xml.split("<item>").slice(1);
  for (const chunk of chunks) {
    const title = extractTag(chunk, "title");
    const link = extractTag(chunk, "link");
    const pubDate = extractTag(chunk, "pubDate");
    const description = extractTag(chunk, "description")?.replace(/<[^>]+>/g, " ").trim();
    if (!link) continue;
    const id = link.match(/status\/(\d+)/)?.[1] ?? slug(title ?? link);
    items.push({
      id: `x-${id}`,
      type: "post",
      title: (title ?? description ?? "").slice(0, 200),
      body: (description ?? title ?? "").slice(0, 4000),
      url: link,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      author: PROFILE.handle,
      locales: ["en"],
      tags: inferTags(title + " " + description),
    });
  }
  return items;
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.trim();
}

function inferTags(text) {
  const t = text.toLowerCase();
  const tags = [];
  if (/strix|halo|gfx1151|780m|igpu/.test(t)) tags.push("hardware");
  if (/bench|tok\/s|performance|faster/.test(t)) tags.push("benchmark");
  if (/qwen|flash|27b|llama/.test(t)) tags.push("models");
  if (/release|v0\.1|github/.test(t)) tags.push("release");
  if (/amd|nvidia|rtx|hip/.test(t)) tags.push("gpu");
  return tags.length ? tags : ["update"];
}

/** Editorial seed when RSS/API unavailable — replace/merge on successful sync */
const SEED_POSTS = [
  {
    id: "x-seed-strix-win",
    type: "post",
    title: "Strata wins by a tight margin against other Strix Halo inference engines on first try release",
    body: "Community benchmark attention on Ryzen AI Max / Strix Halo builds with Strata v0.1.40.",
    url: "https://x.com/coldniko",
    publishedAt: "2026-10-06T18:00:00.000Z",
    author: "coldniko",
    locales: ["en", "zh", "ja"],
    tags: ["benchmark", "hardware", "release"],
  },
  {
    id: "x-seed-780m",
    type: "post",
    title: "Running Strata on Mini PC with iGPU 780M — about 13 tokens/s on first try",
    body: "APU / mini PC path for localized inference; pairs with install docs and model sizing.",
    url: "https://x.com/coldniko",
    publishedAt: "2026-10-06T14:00:00.000Z",
    author: "coldniko",
    locales: ["en", "zh", "ja"],
    tags: ["hardware", "benchmark"],
  },
  {
    id: "x-seed-qwen-compare",
    type: "post",
    title: "For those who slept on Qwen3.8-Flash-Next — community ts-bench comparisons vs 27B stacks",
    body: "Highlights MoE local speed vs dense llama.cpp routes; links to models and install pages.",
    url: "https://x.com/coldniko",
    publishedAt: "2026-10-06T13:00:00.000Z",
    author: "coldniko",
    locales: ["en", "ja"],
    tags: ["models", "benchmark"],
  },
  {
    id: "x-seed-strix-shipped",
    type: "post",
    title: "Strix Halo officially supported in Strata v0.1.40",
    body: "AMD GPU improvements, multi-GPU batching, decode and Turing/Arc fixes — see release notes on site.",
    url: "https://github.com/Niko1221/Strata/releases/tag/v0.1.40",
    publishedAt: "2026-10-06T05:00:00.000Z",
    author: "coldniko",
    locales: ["en", "zh", "ja", "de", "fr"],
    tags: ["release", "hardware"],
  },
];

const SEED_INTERACTIONS = [
  {
    id: "int-zed-strix",
    type: "mention",
    title: "Community call to support Strix Halo / Strata hardware outreach",
    body: "Ecosystem voices (e.g. Zed) amplifying AMD community hardware for Strata development.",
    url: "https://x.com/coldniko",
    relatedUrl: "https://x.com/ZedLLM",
    publishedAt: "2026-10-06T12:00:00.000Z",
    tags: ["community", "hardware"],
  },
];

async function fetchXApi() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];
  const userRes = await fetch("https://api.twitter.com/2/users/by/username/coldniko", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return [];
  const { data: user } = await userRes.json();
  const tl = await fetch(
    `https://api.twitter.com/2/users/${user.id}/tweets?max_results=20&tweet.fields=created_at,public_metrics,entities&exclude=retweets`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!tl.ok) return [];
  const { data } = await tl.json();
  return (data ?? []).map((tw) => ({
    id: `x-${tw.id}`,
    type: "post",
    title: tw.text.slice(0, 200),
    body: tw.text.slice(0, 4000),
    url: `https://x.com/coldniko/status/${tw.id}`,
    publishedAt: tw.created_at,
    author: PROFILE.handle,
    locales: ["en"],
    tags: inferTags(tw.text),
    metrics: tw.public_metrics,
  }));
}

function mergePosts(existing, incoming) {
  const map = new Map();
  for (const p of [...existing, ...incoming]) map.set(p.id, p);
  return [...map.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

const existing = loadExisting();
const { xApiMode } = await import("./intake/x-api-budget.mjs");
const { cheapXEnabled, fetchCheapXUserTweets } = await import("./intake/cheap-x-client.mjs");
const creatorXMode = xApiMode();
let fetched = [];
if (cheapXEnabled()) {
  fetched = (await fetchCheapXUserTweets(PROFILE.handle, 20)).map((r) => ({
    id: r.id,
    type: "post",
    title: r.title,
    body: r.body,
    url: r.url,
    publishedAt: r.publishedAt,
    author: PROFILE.handle,
    locales: ["en"],
    tags: r.tags,
  }));
}
if (fetched.length === 0 && creatorXMode === "full") {
  fetched = await fetchXApi();
}
if (fetched.length === 0) fetched = await fetchRssHub();
const posts = mergePosts(
  existing.posts?.length ? existing.posts : SEED_POSTS,
  fetched.length ? fetched : [],
);
const interactions =
  existing.interactions?.length ? existing.interactions : SEED_INTERACTIONS;

const payload = {
  syncedAt: new Date().toISOString(),
  profile: PROFILE,
  posts,
  interactions,
  linkExchange: {
    siteUrl: "https://stratat.com",
    siteName: "Strata Platform",
    suggestedAnchor: {
      en: "Strata — local Qwen3.8-Flash-Next on your PC",
      zh: "Strata — 本地运行 Qwen3.8-Flash-Next",
      ja: "Strata — ゲーミング PC で Qwen3.8-Flash-Next",
    },
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`creator-pulse.json — ${posts.length} posts, ${interactions.length} interactions`);
