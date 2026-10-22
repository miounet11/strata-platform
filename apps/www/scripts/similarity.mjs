#!/usr/bin/env node
/**
 * Near-duplicate detection over the build output.
 *
 *   node scripts/similarity.mjs                       # score .next, threshold 0.72
 *   NEXT_DIST_DIR=.next-build node scripts/similarity.mjs
 *   node scripts/similarity.mjs --max=0.8 --min-tokens=80
 *   node scripts/similarity.mjs --df=0                # keep boilerplate shingles
 *
 * Exit: 0 no duplicates, 1 duplicates found, 2 the check could not run (no build output, or
 * nothing above --min-tokens). 1 and 2 are different facts and must not be collapsed — a deploy
 * gate that maps both to "found duplicates" reports a measurement it never took.
 *
 * Why this exists: templated pages plus bulk LLM writing converge. Two pages that differ only in
 * the entity name read as one page to a crawler and to a model, and nothing else in the pipeline
 * notices — `audit.mjs` checks structure, not whether the words changed. This is the check from
 * miounet11/yyds-bot (`content/similarity.ts`, `max_similarity: 0.72`), narrowed to what we can
 * run without a browser or a model.
 *
 * How, and why it is not O(n²):
 *   1. Extract visible text, tokenize (Latin words + one token per Han character), 5-shingles.
 *   2. Drop shingles that appear on more than `--df` of the pages **in the same locale**.
 *      Template blocks live inside `<main>` too — an "Other series" cross-link list on every
 *      vendor page is 60% of that page's shingles, and without this filter 13,451 pairs of pages
 *      with different tables scored 0.799. The cutoff is per locale because that is the
 *      comparison group: 341 vendor pages are 0.8% of the build but ~5.6% of their locale, so a
 *      global share keeps them and a local share drops them. The filter is document frequency,
 *      not a hand-written selector: a block that is genuinely per-page survives.
 *   3. MinHash each page to a 64-value signature, bucket by 8 bands of 8 rows (LSH).
 *      Only pages landing in the same band become candidates.
 *   4. Verify every candidate pair with **exact** Jaccard over the filtered shingle sets.
 *      The signature only proposes; it never decides. An estimate at ±12% around a 0.72
 *      threshold would turn a quality gate into a coin flip.
 *
 * Comparison is within a locale (first path segment), because a zh page and its en translation
 * are supposed to be similar in structure and are not duplicates.
 *
 * Exit: 0 = no pair above threshold, 1 = at least one pair above it (or nothing to read).
 * Zero dependencies: `git clone && node scripts/similarity.mjs`.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// `SITE_DIR` exists because these scripts are copied between repositories: run from inside a
// site, and the default resolves to the site; run from the methodology repo against a checkout,
// and it needs to be told where that checkout is.
const wwwDir = process.env.SITE_DIR
  ? resolve(process.cwd(), process.env.SITE_DIR)
  : new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const dist = process.env.NEXT_DIST_DIR || ".next";
const appDir = join(wwwDir, dist, "server", "app");

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value ?? "true"];
    }),
);

const THRESHOLD = Number(args.get("max") ?? 0.72);
const MIN_TOKENS = Number(args.get("min-tokens") ?? 50);
const REPORT = Number(args.get("report") ?? 10);
const MAX_PAIRS = Number(args.get("limit-pairs") ?? 2_000_000);
const DF_CUTOFF = Number(args.get("df") ?? 0.01);
const SHINGLE = 5;
const HASHES = 64;
const ROWS = 8;
const BANDS = HASHES / ROWS;

// Exit codes are load-bearing and must stay distinguishable:
//   0  no duplicates
//   1  duplicates found — a real finding about the content
//   2  the check could not run (no build, nothing comparable) — a failure of the harness
//
// Collapsing 2 into 1 is how a deploy gate ends up printing "duplicate pages reported, continuing"
// when in fact nothing was measured. The wrapper cannot tell the two apart afterwards, so the
// distinction has to exist here.
const CANNOT_RUN = 2;

if (!existsSync(appDir)) {
  console.error(`similarity: no build output at ${relative(wwwDir, appDir)} — run a build first`);
  process.exit(CANNOT_RUN);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("(") || entry.name.startsWith("[")) continue;
      if (entry.name === "sitemaps") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

/** Visible text only: the nav and footer are identical on every page and would flatten the
 *  comparison to "all pages are 0.4 similar because they share a header". This strips them at
 *  the layout level; the df filter below handles template blocks that sit inside `<main>`. */
function visibleText(html) {
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s>][\s\S]*?<\/body>/i)?.[0] ?? html;
  return main
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return text.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?|\p{Script=Han}/gu) ?? [];
}

function shinglesOf(tokens) {
  if (!tokens.length) return [];
  if (tokens.length < SHINGLE) return [tokens.join(" ")];
  const out = [];
  for (let i = 0; i <= tokens.length - SHINGLE; i++) out.push(tokens.slice(i, i + SHINGLE).join(" "));
  return out;
}

function hash32(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Sorted, deduplicated 32-bit hashes. Used for the df table and the MinHash signature, where a
 *  repeated shingle carries no information. */
function uniqueSorted(values) {
  const sorted = Uint32Array.from(values).sort();
  if (!sorted.length) return sorted;
  let count = 1;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1]) count++;
  const out = new Uint32Array(count);
  out[0] = sorted[0];
  let at = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1]) out[++at] = sorted[i];
  return out;
}

/** Sorted hashes with duplicates kept, for the exact Jaccard.
 *
 *  Deduplicating here is what made `/gpus/amd-radeon-rx-9070-16gb` and `…-9070-xt-16gb` score
 *  1.000: each page's cross-link block lists the whole series, so the 9070 page contains the
 *  shingle `AMD Radeon RX 9070 XT 16GB` and the XT page contains `AMD Radeon RX 9070 16GB`. As
 *  *sets* the two are identical and 1.000 is the arithmetically correct answer to the wrong
 *  question. Keeping duplicates makes it a multiset Jaccard (0.940 for that pair) while a page
 *  that really is a copy stays at 1.000. */
function sortedHashes(values) {
  return Uint32Array.from(values).sort();
}

// Deterministic permutations: two runs over the same build must produce the same pairs, or the
// gate cannot be compared against a baseline.
function makePermutations(count) {
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  return Array.from({ length: count }, () => [next() | 1, next()]);
}
const PERMS = makePermutations(HASHES);

function signatureOf(hashes) {
  const signature = new Uint32Array(HASHES).fill(0xffffffff);
  for (const hash of hashes) {
    for (let i = 0; i < HASHES; i++) {
      const value = Math.imul(hash ^ PERMS[i][1], PERMS[i][0]) >>> 0;
      if (value < signature[i]) signature[i] = value;
    }
  }
  return signature;
}

const localeOf = (path) => {
  const first = path.split("/")[1] ?? "";
  return /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(first) ? first : "_root";
};

// ── pass 1: read, tokenize, keep hashes ────────────────────────────────────
const pages = [];
let skippedThin = 0;

for (const file of walk(appDir)) {
  const rel = relative(appDir, file).replace(/\.html$/, "");
  const path = rel === "index" ? "/" : `/${rel}`;
  const html = readFileSync(file, "utf8");
  if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) continue;

  const tokens = tokenize(visibleText(html));
  if (tokens.length < MIN_TOKENS) {
    skippedThin += 1;
    continue;
  }

  const hashes = sortedHashes(shinglesOf(tokens).map(hash32));
  pages.push({
    file,
    path,
    locale: localeOf(path),
    tokenCount: tokens.length,
    hashes,
    // The df table counts *documents*, so a shingle repeated ten times on one page is still one.
    unique: uniqueSorted(hashes),
  });
}

if (!pages.length) {
  console.error(`similarity: no page has >= ${MIN_TOKENS} tokens in ${relative(wwwDir, appDir)}`);
  process.exit(CANNOT_RUN);
}

// ── pass 2: document frequency, counted *per locale* ───────────────────────
// Counting per locale rather than per build is the difference between a filter and a decoration.
// On stratat, 341 vendor index pages are 0.8% of 42,665 pages, so a global 1% cutoff kept every
// one of their template blocks and reported 7,769 "duplicate" pairs from `Other series` blocks
// that sit inside `<main>` on every one of them. Inside their own locale those 341 pages are
// ~5%, so the same cutoff removes them.
//
// A sorted flat array plus a parallel count array, looked up by binary search. A `Map` of 6.6M
// entries costs hundreds of MB on a 42k-page build; this costs 8 bytes per *unique* shingle.
function dfTable(group) {
  const total = group.reduce((sum, page) => sum + page.unique.length, 0);
  const flat = new Uint32Array(total);
  let at = 0;
  for (const page of group) {
    flat.set(page.unique, at);
    at += page.unique.length;
  }
  flat.sort();

  const uniqueHash = uniqueSorted(flat);
  const df = new Uint32Array(uniqueHash.length);
  // `df` is indexed by position in the sorted unique list, so the pointer advances on a value
  // *change* and the count lands on the run it belongs to. An earlier version advanced the
  // pointer while assigning, which left every entry at 1 — the filter then removed nothing and
  // still reported `skipped_boilerplate=0` as if the build had no template blocks.
  at = 0;
  for (let i = 0; i < flat.length; i++) {
    if (i > 0 && flat[i] !== flat[i - 1]) at += 1;
    df[at] += 1;
  }

  return (hash) => {
    let low = 0;
    let high = uniqueHash.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const value = uniqueHash[mid];
      if (value === hash) return df[mid];
      if (value < hash) low = mid + 1;
      else high = mid - 1;
    }
    return 0;
  };
}

// `--df=0` disables the filter, which is what you want when calibrating against yyds-bot's
// content-level numbers.
//
// The floor is 3, not 2, and that is load-bearing: a shingle shared by exactly two pages is the
// most common shape of the defect this script exists to find (a model emitted the same page
// twice). A floor of 2 would classify that as boilerplate and drop it — on the 6-page fixture,
// the one pair that should fail disappeared at `--df=0.5`. Genuine template blocks appear on
// dozens or hundreds of pages; 3 is low enough to catch them on a small site and still let a
// two-page duplicate through.
const dfLimitFor = (size) => (DF_CUTOFF > 0 ? Math.max(3, Math.round(DF_CUTOFF * size)) : Infinity);

// ── pass 3: filtered hashes and signatures ────────────────────────────────
let skippedBoilerplate = 0;
const live = [];

const byLocale = new Map();
for (const page of pages) {
  const group = byLocale.get(page.locale);
  if (group) group.push(page);
  else byLocale.set(page.locale, [page]);
}

for (const [locale, group] of byLocale) {
  const dfOf = dfTable(group);
  const limit = dfLimitFor(group.length);
  for (const page of group) {
    // Filter the *unique* list, then keep only the surviving shingles from the full sequence —
    // duplicates included. Filtering the full array against a set-based df would silently delete
    // every repeat of a template word, which is not what the cutoff means.
    const kept = limit === Infinity ? null : new Set(page.unique.filter((hash) => dfOf(hash) < limit));
    const filtered = kept ? page.hashes.filter((hash) => kept.has(hash)) : page.hashes;
    if (!filtered.length) {
      skippedBoilerplate += 1;
      continue;
    }
    live.push({ ...page, filtered, signature: signatureOf([...new Set(filtered)]) });
  }
}

if (!live.length) {
  console.error(`similarity: every page is boilerplate at df<=${DF_CUTOFF} — rerun with --df=0`);
  process.exit(CANNOT_RUN);
}

// ── candidate generation (LSH) ─────────────────────────────────────────────
// Candidate pairs hold page references directly. An earlier draft stored integer indices per
// locale and then had to rebuild the id space to read them back; one wrong offset there turns
// the gate green by comparing a page with itself.
const candidatePairs = new Map();
let truncated = false;

const seePair = (left, right) => {
  const [a, b] = left.path < right.path ? [left, right] : [right, left];
  const key = `${a.path}\u0000${b.path}`;
  if (candidatePairs.has(key)) return;
  if (candidatePairs.size >= MAX_PAIRS) {
    truncated = true;
    return;
  }
  candidatePairs.set(key, [a, b]);
};

for (const locale of new Set(live.map((page) => page.locale))) {
  const group = live.filter((page) => page.locale === locale);
  const buckets = new Map();
  for (const page of group) {
    for (let band = 0; band < BANDS; band++) {
      const rows = page.signature.subarray(band * ROWS, (band + 1) * ROWS).join(",");
      const list = buckets.get(rows);
      if (list) list.push(page);
      else buckets.set(rows, [page]);
    }
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // A 43k-page template can put thousands of pages in one bucket. Comparing all of them is
    // quadratic again, so cap the bucket and say so instead of silently sampling.
    const capped = list.length > 200 ? (truncated = true, list.slice(0, 200)) : list;
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) seePair(capped[i], capped[j]);
    }
  }
}

// ── exact verification ─────────────────────────────────────────────────────
// Both arrays are sorted and contain duplicates, so this walk computes the multiset intersection:
// matching pairs are consumed one for one. The Jaccard below then divides by
// `|a| + |b| - |a∩b|` over the *same* multisets, which is the multiset Jaccard — a page that
// repeats a block ten times is not identical to one that says it once.
//
// The hashes are already in memory; reading the files again here was the slowest step in the
// first version and served no purpose.
const intersectionOf = (a, b) => {
  let count = 0;
  // Both arrays are sorted, so walk them once instead of hashing every element of `a`.
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      count += 1;
      i += 1;
      j += 1;
    } else if (a[i] < b[j]) i += 1;
    else j += 1;
  }
  return count;
};

const hits = [];
let compared = 0;

const jaccard = (a, b) => {
  const intersection = intersectionOf(a, b);
  const union = a.length + b.length - intersection;
  return union ? intersection / union : 0;
};

for (const [left, right] of candidatePairs.values()) {
  if (left === right) continue;

  // The score is the *minimum* of the filtered and the raw Jaccard, and that is not a detail:
  // the df filter deletes exactly the shingles that tell two near-identical pages apart.
  // `/en/gpus/amd-radeon-graphics-448sp-mobile-system-shared` and its `-2` differ only in
  // `Board power 15 W` vs `25 W`; "15 W" is a common value, so the filter removed both variants
  // and the pair scored 1.000. With `--df=0` the same pair scores 0.932. Two pages that really
  // are copies are 1.000 either way, so taking the minimum costs nothing and keeps the filter
  // from inventing identity.
  const filtered = jaccard(left.filtered, right.filtered);
  if (filtered <= THRESHOLD) continue;
  const raw = jaccard(left.hashes, right.hashes);
  const score = Math.min(filtered, raw);
  if (!score) continue;
  compared += 1;

  if (score > THRESHOLD) {
    const [first, second] = [left, right].sort((x, y) => (x.path < y.path ? -1 : 1));
    hits.push({ score, pair: `${first.path} ~ ${second.path}` });
  }
}

hits.sort((a, b) => b.score - a.score);

console.log(
  `pages=${pages.length} skipped_thin=${skippedThin} skipped_boilerplate=${skippedBoilerplate} shingle=${SHINGLE} df<=${DF_CUTOFF > 0 ? `${DF_CUTOFF} per locale` : "off"} candidates=${candidatePairs.size} verified=${compared}`,
);
console.log(
  `similarity max=${hits.length ? hits[0].score.toFixed(3) : "0.000"} threshold=${THRESHOLD} pairs=${hits.length} EXIT=${hits.length ? 1 : 0}`,
);
for (const hit of hits.slice(0, REPORT)) console.log(`failed=similarity count=${hits.length} detail=${hit.pair} ${hit.score.toFixed(3)}`);
if (hits.length > REPORT) console.log(`  … and ${hits.length - REPORT} more`);
if (truncated) console.log(`note= candidate set hit limit-pairs=${MAX_PAIRS}; similarity is a lower bound`);
if (!hits.length) console.log("OK");

process.exit(hits.length ? 1 : 0);
