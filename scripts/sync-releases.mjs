#!/usr/bin/env node
/** Fetch latest Strata releases into apps/www/src/data/releases.json */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/www/src/data/releases.json",
);

const res = await fetch(
  "https://api.github.com/repos/Niko1221/Strata/releases?per_page=30",
  { headers: { Accept: "application/vnd.github+json", "User-Agent": "stratat-sync" } },
);
if (!res.ok) throw new Error(`GitHub API ${res.status}`);
const raw = await res.json();
const releases = raw.map((r) => ({
  tag: r.tag_name,
  name: r.name,
  publishedAt: r.published_at,
  url: r.html_url,
  prerelease: r.prerelease,
  body: (r.body ?? "").slice(0, 8000),
  assets: (r.assets ?? []).map((a) => ({
    name: a.name,
    size: a.size,
    downloadUrl: a.browser_download_url,
  })),
}));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ syncedAt: new Date().toISOString(), releases }, null, 2));
console.log(`Wrote ${releases.length} releases to ${out}`);
