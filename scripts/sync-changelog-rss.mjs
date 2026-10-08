#!/usr/bin/env node
/**
 * Merge Strata GitHub releases + site release sync into changelog feed JSON.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASES = join(ROOT, "apps/www/src/data/releases.json");
const OUT = join(ROOT, "apps/www/src/data/changelog.json");

function loadReleases() {
  return JSON.parse(readFileSync(RELEASES, "utf8"));
}

async function fetchAtom() {
  const url = "https://github.com/Niko1221/Strata/releases.atom";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "stratat-changelog/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseAtom(xml);
  } catch {
    return [];
  }
}

function parseAtom(xml) {
  const entries = [];
  const parts = xml.split("<entry>").slice(1);
  for (const block of parts) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim();
    const link = block.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const updated = block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim();
    const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
    if (!title || !link) continue;
    entries.push({
      id: `atom-${(id ?? link).replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`,
      title,
      url: link,
      publishedAt: updated ? new Date(updated).toISOString() : new Date().toISOString(),
      source: "github-atom",
    });
  }
  return entries;
}

const local = loadReleases();
const atom = await fetchAtom();

function plainLead(text, max = 220) {
  const head = String(text ?? "").split(/\n## |\n\|/)[0];
  const plain = head
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const slice = plain.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  const base = cut > 80 ? slice.slice(0, cut) : slice;
  return `${base}…`;
}

function tagKey(url, title) {
  const fromUrl = String(url ?? "").match(/\/tag\/(v[\d.]+)/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  const fromTitle = String(title ?? "").match(/v\d+(?:\.\d+)+/i)?.[0];
  return (fromTitle ?? url ?? title ?? "").toLowerCase();
}

const fromLocal = (local.releases ?? []).map((r) => ({
  id: `release-${r.tag}`,
  title: r.name || r.tag,
  summary: plainLead(r.body),
  url: r.url ?? `https://github.com/Niko1221/Strata/releases/tag/${r.tag}`,
  publishedAt: r.publishedAt ?? new Date().toISOString(),
  source: "releases-json",
}));

const merged = new Map();
for (const entry of atom) merged.set(tagKey(entry.url, entry.title), entry);
for (const entry of fromLocal) {
  const key = tagKey(entry.url, entry.title);
  const prev = merged.get(key);
  merged.set(key, prev ? { ...entry, summary: entry.summary || plainLead(prev.summary) } : entry);
}
const items = [...merged.values()].sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
);

const payload = {
  syncedAt: new Date().toISOString(),
  feedUrl: "https://github.com/Niko1221/Strata/releases.atom",
  siteRssPath: "/changelog/rss.xml",
  items: items.slice(0, 80),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`changelog.json — ${payload.items.length} entries`);
