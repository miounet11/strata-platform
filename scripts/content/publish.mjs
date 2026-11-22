// Flip scheduled articles to live on their publish day.
//
//   node scripts/content/publish.mjs                        # apply due items
//   node scripts/content/publish.mjs --locale en --limit 25 # paced publishing
//   node scripts/content/publish.mjs --dry-run              # preview only
//   node scripts/content/publish.mjs --all                  # ignore publishAt
//
// Priority when `--limit` is active: high-demand locales (en → zh → ja → de → fr → es → pt)
// and freshest kinds (radar / release / troubleshoot / task / compare / hardware / concept / local).
import { readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "scripts/content/out");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const onlyLocale = arg("locale");
const limit = arg("limit") ? Math.max(1, Number(arg("limit"))) : Infinity;
const today = new Date().toISOString().slice(0, 10);

const LOCALE_PRIORITY = ["en", "zh", "ja", "de", "fr", "es", "pt"];
const KIND_PRIORITY = ["radar", "release", "troubleshoot", "task", "compare", "hardware", "concept", "local"];

function rankOf(list, value) {
  const idx = list.indexOf(value);
  return idx === -1 ? list.length : idx;
}

function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

if (!existsSync(OUT)) {
  console.error(`no articles at ${OUT} — run generate.mjs first`);
  process.exit(1);
}

const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8")).assets ?? {}
  : {};

function hasCover(item) {
  return Boolean(
    manifest[`guide-${item.locale}-${item.slug}`]?.path ??
      manifest[`guide-${item.slug}`]?.path,
  );
}

let live = 0;
let pending = 0;
let already = 0;
let noImage = 0;
let deferredByCap = 0;
const blockedByImage = [];
const candidates = [];
const byLocale = {};
const publishedPaths = [];

for (const entry of readdirSync(OUT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (onlyLocale && entry.name !== onlyLocale) continue;
  const dir = join(OUT, entry.name);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const item = JSON.parse(readFileSync(path, "utf8"));
    if (item.status === "live") {
      already++;
      continue;
    }

    const due = all || !item.publishAt || item.publishAt <= today;
    if (!due) {
      pending++;
      continue;
    }

    if (!hasCover(item)) {
      noImage++;
      blockedByImage.push({ slug: item.slug, locale: item.locale, publishAt: item.publishAt });
      continue;
    }

    candidates.push({ path, item });
  }
}

candidates.sort(
  (a, b) =>
    rankOf(LOCALE_PRIORITY, a.item.locale) - rankOf(LOCALE_PRIORITY, b.item.locale) ||
    rankOf(KIND_PRIORITY, a.item.kind) - rankOf(KIND_PRIORITY, b.item.kind) ||
    (a.item.order ?? 0) - (b.item.order ?? 0),
);

for (const { path, item } of candidates) {
  if (live >= limit) {
    deferredByCap++;
    continue;
  }
  item.status = "live";
  item.publishedAt = today;
  if (!dryRun) writeAtomic(path, `${JSON.stringify(item, null, 2)}\n`);
  live++;
  byLocale[item.locale] = (byLocale[item.locale] ?? 0) + 1;
  publishedPaths.push(`/${item.locale}/guides/${item.slug}`);
}

const mode = dryRun ? "would publish" : "published";
console.log(
  `${mode} ${live} · already live ${already} · still scheduled ${pending + deferredByCap} · waiting for image ${noImage}` +
    (deferredByCap ? ` (paced cap deferred ${deferredByCap})` : ""),
);
for (const [locale, n] of Object.entries(byLocale).sort()) console.log(`  ${locale}: ${n}`);
if (publishedPaths.length > 0 && !dryRun) {
  console.log(`PUBLISHED_PATHS ${publishedPaths.join(",")}`);
}
if (dryRun) console.log("(dry run — nothing written)");

if (!dryRun && live === 0 && blockedByImage.length > 0) {
  console.log(`STARVED blocked_by_image=${blockedByImage.length}`);
  for (const b of blockedByImage.slice(0, 5)) {
    console.log(`  held ${b.locale}/${b.slug} (due ${b.publishAt})`);
  }
  if (blockedByImage.length > 5) console.log(`  … ${blockedByImage.length - 5} more`);
}
