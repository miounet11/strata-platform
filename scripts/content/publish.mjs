// Flip scheduled articles to live on their publish day.
//
//   node scripts/content/publish.mjs            # apply today's batch
//   node scripts/content/publish.mjs --dry-run  # show what would change
//   node scripts/content/publish.mjs --all      # ignore publishAt (first launch / local preview)
//
// Articles are written by generate.mjs as `scheduled`. Only `live` articles are rendered, so
// this is the single gate that keeps ~1000 pages from all appearing on the same day.
import { readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "scripts/content/out");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const today = new Date().toISOString().slice(0, 10);

function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

if (!existsSync(OUT)) {
  console.error(`no articles at ${OUT} — run generate.mjs first`);
  process.exit(1);
}

let live = 0, pending = 0, already = 0;
const byLocale = {};

for (const entry of readdirSync(OUT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(OUT, entry.name);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const item = JSON.parse(readFileSync(path, "utf8"));
    if (item.status === "live") { already++; continue; }

    const due = all || !item.publishAt || item.publishAt <= today;
    if (!due) { pending++; continue; }

    item.status = "live";
    item.publishedAt = today;
    if (!dryRun) writeAtomic(path, `${JSON.stringify(item, null, 2)}\n`);
    live++;
    byLocale[item.locale] = (byLocale[item.locale] ?? 0) + 1;
  }
}

const mode = dryRun ? "would publish" : "published";
console.log(`${mode} ${live} · already live ${already} · still scheduled ${pending}`);
for (const [locale, n] of Object.entries(byLocale).sort()) console.log(`  ${locale}: ${n}`);
if (dryRun) console.log("(dry run — nothing written)");
