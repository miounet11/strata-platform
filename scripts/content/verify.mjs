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

/**
 * Character n-grams, not word n-grams. Chinese and Japanese do not put spaces between words, so
 * splitting on whitespace yields a handful of "words" per article and every similarity score
 * collapses to 0 — the cross-locale check would silently pass for zh/ja. Character shingles work
 * for every script and still survive one language being a translation of another.
 */
function shingles(text, n = 5) {
  const chars = [...String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")];
  if (chars.length < n) return new Set(chars.join("") ? [chars.join("")] : []);
  const set = new Set();
  for (let i = 0; i + n <= chars.length; i++) set.add(chars.slice(i, i + n).join(""));
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
const awaitingImage = [];
const imageChecks = [];
const fail = (a, msg) => problems.push(`${a.locale}/${a.slug}: ${msg}`);

for (const a of articles) {
  const body = String(a.article?.body ?? "");
  const min = MIN_BODY[a.locale] ?? 900;
  if (body.length < min) fail(a, `body ${body.length} < ${min}`);

  const faq = a.article?.faq ?? [];
  if (faq.length < 3) fail(a, `faq ${faq.length} < 3`);
  if (faq.some((f) => !f.q || !f.a)) fail(a, "faq entry missing q or a");

  // A fact table is what makes the page quotable by an AI answer engine. Detect it by its
  // delimiter row rather than by requiring a closing pipe: GFM allows `| a | b` with no trailing
  // bar, and the writer emits all three shapes (`| a | b |`, `| a | b | `, `| a | b`). Anchoring
  // on `\|$` reported correct articles in de and pt as having no table at all.
  // The lookahead keeps a plain `---` horizontal rule from counting as a table.
  const hasTable = /^(?=[^\n]*\|)[\s|:-]*-{3,}[\s|:-]*$/m.test(body);
  if (!hasTable) fail(a, "no fact table");

  const headings = (body.match(/^##+ /gm) ?? []).length;
  if (headings < 2) fail(a, `headings ${headings} < 2`);

  if (!a.article?.title || a.article.title.length < 20) fail(a, "title too short");
  if (/^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i.test(a.article?.title ?? "")) fail(a, "title looks like a slug");

  // An article that has not been illustrated yet is a task, not a defect: images are produced
  // on the workstation, so a freshly written article legitimately has none. The hard error is a
  // manifest entry that points at a file which is not there.
  const id = `guide-${a.slug}`;
  const asset = manifest.assets[id];
  if (!asset?.path) awaitingImage.push(`${a.locale}/${a.slug}`);
  else imageChecks.push({ a, path: asset.path });
}

// The images do not necessarily live on this host. When the site is built with
// NEXT_PUBLIC_MEDIA_BASE (file.stratat.com), public/media is deliberately excluded from the
// standalone tree and every asset is served from the bucket — so a local existsSync reports
// "missing" for files that are fine in production, and the gate blocks a good publish. Ask the
// URL that the page will actually request instead. Without a base, public/ is authoritative.
const mediaBase = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/$/, "");
if (imageChecks.length) {
  if (mediaBase) {
    // Retry before failing. Observed on 2026-10-22: running this gate three times in a row gave
    // exit 0, 1, 0 — a dropped connection to the bucket was reported as "unreachable" and would
    // have blocked a healthy publish, then alerted about a problem that did not exist. A 404 is
    // answered once; only transport errors and 5xx are worth retrying.
    const probe = async (url) => {
      let lastError = "";
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20000) });
          if (res.ok) return null;
          lastError = `image ${res.status} at ${url}`;
          if (res.status < 500) return lastError;
        } catch (error) {
          lastError = `image unreachable: ${url} (${error.message})`;
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
      return lastError;
    };
    const results = await Promise.all(
      imageChecks.map(async ({ a, path }) => {
        const msg = await probe(`${mediaBase}${path}`);
        return msg ? { a, msg } : null;
      }),
    );
    for (const r of results) if (r) fail(r.a, r.msg);
  } else {
    for (const { a, path } of imageChecks) {
      if (!existsSync(join(PUBLIC, path.replace(/^\//, "")))) fail(a, `image file missing: ${path}`);
    }
  }
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
if (awaitingImage.length) {
  console.log(`${awaitingImage.length} article(s) await an image (generated on the workstation, then synced)`);
}
if (problems.length) {
  for (const p of problems.slice(0, 40)) console.log(`  ✗ ${p}`);
  if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
  console.log(`✗ ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("✓ all articles pass");
