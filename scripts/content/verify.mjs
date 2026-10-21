// Quality gate for generated articles. Run after generate.mjs/images.mjs, before publish.mjs.
//
//   node scripts/content/verify.mjs            # check everything
//   node scripts/content/verify.mjs --locale en
//   node scripts/content/verify.mjs --slug vram-vs-ram
//
// Exit 1 if any article fails, so a bad batch cannot reach the publish gate.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "scripts/content/out");
const PUBLIC = join(ROOT, "apps/www/public");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");

const args = process.argv.slice(2);
const onlyLocale = args.includes("--locale") ? args[args.indexOf("--locale") + 1] : null;
const onlySlug = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null;

// Minimum body length differs by script density: CJK says the same in fewer characters.
const MIN_BODY = { zh: 550, ja: 550, en: 900, de: 900, fr: 900, es: 900, pt: 900 };
// Cross-locale similarity must stay low or the pages read as translations of one another.
const MAX_CROSS_LOCALE_SIMILARITY = 0.4;
const MAX_PAIRS_SIMILARITY = 0.3;

function shingles(text, n = 5) {
  const words = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= words.length; i++) set.add(words.slice(i, i + n).join(" "));
  return set;
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const s of a) if (b.has(s)) hit++;
  return hit / (a.size + b.size - hit); // Jaccard
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const articles = [];

for (const entry of readdirSync(OUT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (onlyLocale && entry.name !== onlyLocale) continue;
  const dir = join(OUT, entry.name);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const item = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (onlySlug && item.slug !== onlySlug) continue;
    articles.push(item);
  }
}

const problems = [];
const fail = (a, msg) => problems.push(`${a.locale}/${a.slug}: ${msg}`);

for (const a of articles) {
  const body = String(a.article?.body ?? "");
  const min = MIN_BODY[a.locale] ?? 900;
  if (body.length < min) fail(a, `body ${body.length} < ${min}`);

  const faq = a.article?.faq ?? [];
  if (faq.length < 3) fail(a, `faq ${faq.length} < 3`);
  if (faq.some((f) => !f.q || !f.a)) fail(a, "faq entry missing q or a");

  // A fact table is what makes the page quotable by an AI answer engine.
  if (!/^\|.+\|$/m.test(body)) fail(a, "no fact table");

  const headings = (body.match(/^##+ /gm) ?? []).length;
  if (headings < 2) fail(a, `headings ${headings} < 2`);

  if (!a.article?.title || a.article.title.length < 20) fail(a, "title too short");
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(a.article?.title ?? "")) fail(a, "title looks like a slug");

  const id = `guide-${a.slug}`;
  const asset = manifest.assets[id];
  if (!asset?.path) fail(a, "no image registered in manifest");
  else if (!existsSync(join(PUBLIC, asset.path.replace(/^\//, "")))) fail(a, `image file missing: ${asset.path}`);
}

// Duplicate detection: every pair of articles must be distinct enough.
const shop = articles.map((a) => ({ a, s: shingles(a.article?.body ?? "") }));
let worstPair = { sim: 0, label: "" };
for (let i = 0; i < shop.length; i++) {
  for (let j = i + 1; j < shop.length; j++) {
    if (shop[i].a.locale === shop[j].a.locale) continue;
    const sim = similarity(shop[i].s, shop[j].s);
    if (sim > worstPair.sim) {
      worstPair = { sim, label: `${shop[i].a.locale}/${shop[i].a.slug} ~ ${shop[j].a.locale}/${shop[j].a.slug}` };
    }
    if (sim > MAX_CROSS_LOCALE_SIMILARITY) {
      fail(shop[i].a, `cross-locale similarity ${sim.toFixed(2)} with ${shop[j].a.locale}/${shop[j].a.slug}`);
    }
  }
}

console.log(`checked ${articles.length} article(s)`);
console.log(`worst cross-locale pair: ${worstPair.sim.toFixed(3)} ${worstPair.label || "(n/a)"}`);
if (problems.length) {
  for (const p of problems.slice(0, 40)) console.log(`  ✗ ${p}`);
  if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
  console.log(`✗ ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("✓ all articles pass");
