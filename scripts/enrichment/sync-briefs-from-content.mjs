#!/usr/bin/env node
/**
 * Append image briefs from creator-pulse + intelligence signals (for batch enrich).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BRIEFS = join(ROOT, "scripts/enrichment/briefs.json");

const briefs = JSON.parse(readFileSync(BRIEFS, "utf8"));
const ids = new Set(briefs.items.map((i) => i.id));

function add(item) {
  if (ids.has(item.id)) return;
  ids.add(item.id);
  briefs.items.push(item);
}

try {
  const creator = JSON.parse(readFileSync(join(ROOT, "apps/www/src/data/creator-pulse.json"), "utf8"));
  for (const p of creator.posts ?? []) {
    add({
      id: `creator-${p.id}`,
      page: "/creator",
      slot: "feed-art",
      type: "image",
      prompt: `Tech blog thumbnail, abstract: ${p.title.slice(0, 120)}, dark teal, no text`,
      alt: { en: p.title.slice(0, 80) },
    });
  }
} catch {}

try {
  const intel = JSON.parse(readFileSync(join(ROOT, "apps/www/src/data/intelligence-pulse.json"), "utf8"));
  for (const s of (intel.signals ?? []).slice(0, 15)) {
    add({
      id: `signal-${s.id}`,
      page: "/pulse",
      slot: "signal-art",
      type: "image",
      prompt: `News card illustration: ${s.title.slice(0, 100)}, GPU/local AI, no text`,
      alt: { en: s.title.slice(0, 80) },
    });
  }
} catch {}

try {
  const community = JSON.parse(readFileSync(join(ROOT, "apps/www/src/data/community.json"), "utf8"));
  const top = (community.issues ?? [])
    .slice()
    .sort(
      (a, b) =>
        (b.comments ?? 0) - (a.comments ?? 0) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, Number(process.env.ENRICH_COMMUNITY_BRIEFS ?? 12));
  for (const i of top) {
    add({
      id: `issue-${i.number}`,
      page: `/issues/${i.number}`,
      slot: "issue-hero",
      type: "image",
      prompt: `GitHub issue illustration, technical: ${i.title.slice(0, 100)}, GPU local AI, dark teal, no text`,
      alt: { en: i.title.slice(0, 80) },
    });
  }
} catch {}

writeFileSync(BRIEFS, JSON.stringify(briefs, null, 2));
console.log(`briefs.json — ${briefs.items.length} items`);
