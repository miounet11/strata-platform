#!/usr/bin/env node
/**
 * Score the build output against the checks we can actually verify here.
 *
 *   node scripts/audit.mjs                       # score .next-build, fail if any check fails
 *   NEXT_DIST_DIR=.next node scripts/audit.mjs   # score .next
 *   node scripts/audit.mjs --advisory            # score only, always EXIT=0
 *
 * Why a scorecard and not a pass/fail script: a failing build tells you nothing about *which*
 * pages are wrong, and a passing build tells you nothing about the 2.8k pages that never got
 * looked at. Every failure here names a file and a number, because "performance is bad" is not
 * actionable and "ja/pulls 2280118 > 180000" is.
 *
 * Checks are deliberately limited to what can be verified from the written HTML. Anything that
 * needs a browser (contrast, tap targets, focus rings) belongs in a Lighthouse run, not here.
 *
 * This is the composite-check idea from miounet11/yyds-bot, narrowed to our stack — see
 * docs/11-inspiration-yyds-bot.md. Two details are copied on purpose: a pillar with zero checks
 * scores 0, not 100, and `pass` requires every check, not just the threshold.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const wwwDir = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const dist = process.env.NEXT_DIST_DIR || ".next";
const appDir = join(wwwDir, dist, "server", "app");
const advisory = process.argv.includes("--advisory");

// Thresholds. Each one is a number someone chose; writing it down is the point.
const LIMITS = {
  htmlBytes: 180_000,
  jsonldCoverage: 1.0, // every indexable page
  ogImageCoverage: 1.0,
};

if (!existsSync(appDir)) {
  console.error(`audit: no build output at ${relative(wwwDir, appDir)} — run a build first`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Route groups `(name)` and dynamic segments `[param]` are not URL segments.
      if (entry.name.startsWith("(") || entry.name.startsWith("[")) continue;
      if (entry.name === "sitemaps") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(appDir);
if (!files.length) {
  console.error("audit: build output has no HTML — nothing to score");
  process.exit(1);
}

// One page's facts, with the HTML dropped. Keeping 43k HTML strings alive costs several GB and
// gets the process OOM-killed (exit 137) on the largest builds — every check below needs a
// boolean, not the document.
const pages = files.map((file) => {
  const rel = relative(appDir, file).replace(/\.html$/, "");
  const path = rel === "index" ? "/" : `/${rel}`;
  const html = readFileSync(file, "utf8");
  const facts = {
    file,
    rel,
    path,
    bytes: Buffer.byteLength(html),
    noindex: /content="noindex/.test(html),
    hasJsonLd: html.includes("application/ld+json"),
    hasGraph: html.includes('"@graph"'),
    hasOgImage: html.includes('property="og:image"'),
    h1Count: html.match(/<h1[\s>]/g)?.length ?? 0,
    hasCanonical: /rel="canonical"/.test(html),
    hasDescription: /name="description" content=".{10,}"/.test(html),
    // Attribute is `hrefLang` in the serialized HTML — a lowercase search reports a false zero.
    hasXDefault: /hreflang="x-default"/i.test(html),
    // Articles and topics are written per language, so a page may legitimately exist in one
    // locale. x-default only has meaning when there are alternates to fall back between.
    hreflangCount: html.match(/hreflang="/gi)?.length ?? 0,
    hasSkipLink: /<a[^>]+href="#[^"]*"[^>]*>/.test(html) && /skip/i.test(html),
    hasLandmarks: /<(main|nav|header|footer)[\s>]/.test(html),
    hasHtmlLang: /<html lang="/.test(html),
    isArticle: /data-page="(guide|article)"/.test(html),
    hasTime: /<time datetime=/.test(html),
  };
  return facts;
});
const indexable = pages.filter((page) => !page.noindex);

/** Collect failures as {id, detail, count} so the summary can be per-check, not per-page. */
function check(id, failures, empty) {
  return { id, pass: failures.length === 0, count: failures.length, detail: failures.length ? failures.slice(0, 5).join("; ") : empty };
}

const checks = [];

// ── performance ────────────────────────────────────────────────────────────
{
  const over = pages.filter((page) => page.bytes > LIMITS.htmlBytes);
  over.sort((a, b) => b.bytes - a.bytes);
  checks.push(
    check(
      "performance-budget",
      over.map((page) => `${page.path} ${page.bytes}>${LIMITS.htmlBytes}`),
      `all pages <= ${LIMITS.htmlBytes} bytes`,
    ),
  );
  checks[checks.length - 1].count = over.length;
}

// ── structured data ────────────────────────────────────────────────────────
{
  const missing = indexable.filter((page) => !page.hasJsonLd);
  checks.push(
    check(
      "jsonld-coverage",
      missing.map((page) => page.path),
      `${indexable.length}/${indexable.length} indexable pages have JSON-LD`,
    ),
  );
  checks[checks.length - 1].count = missing.length;
}
{
  // A bare `{"@context","@type"}` block does not let nodes reference each other; the graph form
  // is what makes BreadcrumbList point at the same page node as the Article.
  const noGraph = indexable.filter((page) => page.hasJsonLd && !page.hasGraph);
  checks.push(
    check(
      "jsonld-graph",
      noGraph.map((page) => page.path),
      "JSON-LD blocks use @graph",
    ),
  );
  checks[checks.length - 1].count = noGraph.length;
}

// ── social ─────────────────────────────────────────────────────────────────
{
  const missing = indexable.filter((page) => !page.hasOgImage);
  checks.push(
    check(
      "og-image",
      missing.map((page) => page.path),
      `all ${indexable.length} indexable pages declare og:image`,
    ),
  );
  checks[checks.length - 1].count = missing.length;
}

// ── head/meta ──────────────────────────────────────────────────────────────
{
  const bad = indexable.filter((page) => page.h1Count !== 1);
  checks.push(check("single-h1", bad.map((page) => page.path), "every page has exactly one h1"));
  checks[checks.length - 1].count = bad.length;
}
{
  const bad = indexable.filter((page) => !page.hasCanonical);
  checks.push(check("canonical", bad.map((page) => page.path), "every indexable page has canonical"));
  checks[checks.length - 1].count = bad.length;
}
{
  const bad = indexable.filter((page) => !page.hasDescription);
  checks.push(check("meta-description", bad.map((page) => page.path), "every page has a description"));
  checks[checks.length - 1].count = bad.length;
}
{
  const bad = indexable.filter((page) => !page.hasXDefault && page.hreflangCount > 1);
  checks.push(check("hreflang", bad.map((page) => page.path), "multi-locale pages declare x-default"));
  checks[checks.length - 1].count = bad.length;
}

// ── accessibility ──────────────────────────────────────────────────────────
// These three use `indexable`, not `pages`. `/` is a redirect with no body of its own and
// `_not-found` is a framework page; both declare noindex, so holding them to a content-page
// standard reports two permanent failures that no edit can fix.
{
  const bad = indexable.filter((page) => !page.hasSkipLink);
  checks.push(check("skip-link", bad.map((page) => page.path), "every page has a skip link"));
  checks[checks.length - 1].count = bad.length;
}
{
  const bad = indexable.filter((page) => !page.hasLandmarks);
  checks.push(check("landmarks", bad.map((page) => page.path), "every page has landmarks"));
  checks[checks.length - 1].count = bad.length;
}
{
  const bad = indexable.filter((page) => !page.hasHtmlLang);
  checks.push(check("html-lang", bad.map((page) => page.path), "every page declares lang"));
  checks[checks.length - 1].count = bad.length;
}

// ── machine consumption ────────────────────────────────────────────────────
{
  // The audience is people running models locally; a root llms.txt is the cheapest way to be
  // readable by the tools they use.
  // Two acceptable sources: a static file in `public/`, or a prerendered route handler. Strata
  // generates it (`src/app/llms.txt/route.ts`) so it stays in step with `routes.ts`; accepting
  // only the static path reported every build as missing a file that was in the output.
  const staticFile = existsSync(join(wwwDir, "public", "llms.txt"));
  const rendered = existsSync(join(appDir, "llms.txt.body"));
  const exists = staticFile || rendered;
  checks.push({
    id: "llms-txt",
    pass: exists,
    count: exists ? 0 : 1,
    detail: exists ? (rendered ? "llms.txt rendered from route handler" : "public/llms.txt present") : "llms.txt missing from both public/ and build output",
  });
}
{
  const missing = pages.filter((page) => page.isArticle && !page.hasTime);
  checks.push(check("updated", missing.map((page) => page.path), "article pages carry <time datetime>"));
  checks[checks.length - 1].count = missing.length;
}

// ── coverage sanity ────────────────────────────────────────────────────────
{
  // If the build quietly published fewer pages than the sitemap claims, the score above is
  // computed over a smaller set and looks better than it is.
  const sitemapBody = join(appDir, "sitemap.xml.body");
  if (!existsSync(sitemapBody)) {
    checks.push({ id: "sitemap-parity", pass: false, count: 1, detail: "sitemap.xml.body not found" });
  } else {
    const urls = readFileSync(sitemapBody, "utf8").match(/<loc>/g)?.length ?? 0;
    checks.push({
      id: "sitemap-parity",
      pass: urls > 0 && urls <= pages.length,
      count: urls > pages.length ? urls - pages.length : 0,
      detail: `sitemap ${urls} urls, build ${pages.length} pages`,
    });
  }
}

// ── scorecard ──────────────────────────────────────────────────────────────
const score = Math.round((100 * checks.filter((item) => item.pass).length) / checks.length);
const allPass = checks.every((item) => item.pass);

console.log(`pages=${pages.length} indexable=${indexable.length} noindex=${pages.length - indexable.length}`);
console.log(`audit score=${score} checks=${checks.length} EXIT=${allPass ? 0 : 1}`);
for (const item of checks.filter((entry) => !entry.pass)) {
  console.log(`failed=${item.id} count=${item.count} detail=${item.detail}`);
}
if (allPass) console.log("OK");

if (advisory) process.exit(0);
process.exit(allPass ? 0 : 1);
