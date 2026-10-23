#!/usr/bin/env node
/**
 * Sitemap ↔ build output, checked in both directions.
 *
 *   node scripts/verify-sitemap.mjs            # both directions
 *   node scripts/verify-sitemap.mjs --forward  # sitemap → file only
 *   node scripts/verify-sitemap.mjs --reverse  # file → sitemap only
 *
 * Why both directions, and why against the build output rather than the live site:
 *
 *  - Forward (`sitemap → file`) catches phantom URLs. A data file with one extra comma yields a
 *    sparse array; `map()` over it produces `undefined` without throwing, and the sitemap ships
 *    `/en/undefined`. Crawlers fetch it, get a 404, and the whole section loses trust. Nothing in
 *    a successful build reports this.
 *  - Reverse (`file → sitemap`) catches orphans. A page that renders but is in no sitemap is
 *    invisible unless something links to it, and an index page that quietly lost its rows still
 *    returns 200. The only symptom is "fewer URLs than expected" in a log nobody reads.
 *
 * Checking the build output rather than the live site means this runs before a deploy can fail,
 * and it cannot be confused by a CDN serving a stale copy.
 *
 * Pages that are intentionally unindexable must say so in their own HTML (`<meta name="robots"
 * content="noindex">`). That is the escape hatch: it keeps the reverse check honest without a
 * hardcoded allowlist that drifts away from reality.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const wwwDir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const dist = process.env.NEXT_DIST_DIR || ".next";
const appDir = join(wwwDir, dist, "server", "app");

const args = new Set(process.argv.slice(2));
const forwardOnly = args.has("--forward");
const reverseOnly = args.has("--reverse");

// The sitemap index lists parts; each part is a file. Reading the index rather than globbing
// means a part that was dropped from the index is reported, not silently ignored.
const INDEX = join(appDir, "sitemap.xml.body");

function fail(message) {
  console.error(`verify-sitemap: ${message}`);
  process.exit(1);
}

if (!existsSync(appDir)) fail(`no build output at ${appDir}; run \`pnpm build\` first`);
if (!existsSync(INDEX)) fail(`no sitemap index at ${INDEX}`);

/** `<loc>` values, one per entry. `grep -c` counts lines and these files are single-line-ish. */
function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/** URL path → the single form both directions compare. Both sides call this. */
function normalizePath(path) {
  return path.replace(/\/+$/, "") || "/";
}

/** Where a URL path would be prerendered. `/` is `index.html`, not a directory. */
function pathToFile(path) {
  const clean = normalizePath(path);
  const local = clean === "/" ? "/index" : clean;
  return join(appDir, `${local}.html`);
}

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups and catch-all markers are not URL segments.
      if (entry.name.startsWith("(") || entry.name.startsWith("[")) continue;
      out.push(...walkHtml(full));
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

function fileToUrl(file) {
  let rel = relative(appDir, file).split(sep).join("/");
  rel = rel.replace(/\.html$/, "");
  if (rel === "index" || rel === "_not-found") return null;
  if (rel.endsWith("/index")) rel = rel.slice(0, -"/index".length);
  return `/${rel}`;
}

const problems = [];
const notes = [];

// ── forward ────────────────────────────────────────────────────────────────────────────────
const indexXml = readFileSync(INDEX, "utf8");
const parts = locs(indexXml).map((url) => ({ url, file: new URL(url).pathname.split("/").pop() }));
if (parts.length === 0) fail("sitemap index lists no parts");

const sitemapUrls = new Set();
const sitemapPaths = new Set();
const missing = [];
for (const part of parts) {
  // A prerendered route handler is stored as `<name>.body`; older Next versions wrote the bare
  // name. Accept either so this check does not break on an upgrade for the wrong reason.
  const candidates = [join(appDir, "sitemaps", `${part.file}.body`), join(appDir, "sitemaps", part.file)];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) {
    problems.push(`index lists ${part.url} but ${relative(wwwDir, candidates[0])} does not exist`);
    continue;
  }
  const urls = locs(readFileSync(file, "utf8"));
  notes.push(`${part.file}: ${urls.length} urls`);
  for (const url of urls) {
    sitemapUrls.add(url);
    // Match on pathname only: the sitemap's host comes from NEXT_PUBLIC_SITE_URL and differs
    // between a staging build and production, but the set of paths must not.
    sitemapPaths.add(normalizePath(new URL(url).pathname));
  }

  // A sitemap entry whose path contains these tokens came from a missing field, not from data.
  const bad = urls.filter((url) => /\/(undefined|null|NaN)(\/|$)/.test(new URL(url).pathname));
  if (bad.length) problems.push(`${part.file}: ${bad.length} url(s) with an empty path segment, e.g. ${bad[0]}`);

  // The entry must have a page behind it. A `200` from the live site is not evidence: Next answers
  // an unknown path in a locale with the not-found page, which also returns 200 for some hosts.
  // Every URL in these sitemaps is prerendered, so a missing `.html` is a real 404 waiting.
  for (const url of urls) {
    const path = new URL(url).pathname;
    if (/\/(undefined|null|NaN)(\/|$)/.test(path)) continue; // already reported above
    const file = pathToFile(path);
    if (!existsSync(file)) {
      missing.push(`${path} (${relative(wwwDir, file)})`);
    }
  }
}

if (missing.length) {
  problems.push(`${missing.length} sitemap url(s) have no prerendered page, e.g. ${missing.slice(0, 3).join(", ")}`);
}

if (!forwardOnly) {
  // ── reverse ──────────────────────────────────────────────────────────────────────────────
  const pages = walkHtml(appDir);
  let noindex = 0;
  for (const page of pages) {
    const url = fileToUrl(page);
    if (!url) continue;

    // `/b/<key>` and other gated trees render for anyone who knows the key; they must declare
    // noindex themselves. Reading the meta is what makes this check survive route changes.
    const html = readFileSync(page, "utf8");
    const unindexable = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
    if (unindexable) {
      noindex += 1;
      continue;
    }
    if (!sitemapPaths.has(normalizePath(url))) {
      problems.push(`page ${url} is not in any sitemap and is not marked noindex`);
    }
  }
  notes.push(`html: ${pages.length} pages, ${noindex} noindex`);
}

console.log(notes.join("\n"));
console.log(`sitemap urls: ${sitemapUrls.size}`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  process.exit(1);
}

console.log("OK");
