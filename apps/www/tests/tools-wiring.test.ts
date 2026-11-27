import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ALL_TOOLS, TOOL_SLUGS, isToolSlug } from "../src/features/tools/registry.ts";
import { isInternalHref, toolPath } from "../src/lib/internal-links.ts";

const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function flatten(value: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        for (const [nested, leaf] of flatten(child, path)) out.set(nested, leaf);
      } else {
        out.set(path, child);
      }
    }
  }
  return out;
}

test("registry defines 10 unique tools and valid relatedSlugs", () => {
  assert.equal(ALL_TOOLS.length, 10);
  assert.equal(new Set(TOOL_SLUGS).size, 10);
  for (const tool of ALL_TOOLS) {
    assert.ok(isToolSlug(tool.slug));
    for (const rel of tool.relatedSlugs) {
      assert.ok(isToolSlug(rel));
      assert.notEqual(rel, tool.slug);
    }
  }
});

test("toolPath and internal link checks accept all 10 tool routes", () => {
  for (const slug of TOOL_SLUGS) {
    const href = toolPath(slug);
    assert.equal(href, `/tools/${slug}`);
    assert.equal(isInternalHref(href), true);
  }
});

test("routes, sitemap, search, llms.txt, revalidate and indexnow wire /tools", () => {
  const routes = read("../src/lib/routes.ts");
  assert.match(routes, /\{ href: "\/tools", key: "tools" \}/);
  assert.match(routes, /"\/tools"/);
  assert.match(routes, /tools: "tools"/);

  const sitemap = read("../src/lib/sitemap.ts");
  assert.match(sitemap, /ALL_TOOLS/);
  assert.match(sitemap, /toolPath/);
  assert.match(sitemap, /path === "\/tools"/);

  const searchApi = read("../src/app/api/search/route.ts");
  assert.match(searchApi, /ALL_TOOLS/);
  assert.match(searchApi, /"tool"/);

  const searchClient = read("../src/components/SearchClient.tsx");
  assert.match(searchClient, /value="tool"/);

  const llms = read("../src/app/llms.txt/route.ts");
  assert.match(llms, /ALL_TOOLS/);
  assert.match(llms, /\/tools/);

  const revalidate = read("../src/app/api/revalidate/route.ts");
  assert.match(revalidate, /tools: \["", "\/tools"\]/);
  assert.match(revalidate, /"\/\[locale\]\/tools\/\[slug\]"/);

  const indexnow = read("../../../scripts/indexnow-submit.mjs");
  assert.match(indexnow, /\/tools/);
});

test("pages export revalidate = 1800, generateStaticParams, jsonLdGraph and h1", () => {
  const hub = read("../src/app/[locale]/tools/page.tsx");
  assert.match(hub, /export const revalidate = 1800;/);
  assert.match(hub, /jsonLdGraph/);
  assert.match(hub, /<h1>/);

  const detail = read("../src/app/[locale]/tools/[slug]/page.tsx");
  assert.match(detail, /export const revalidate = 1800;/);
  assert.match(detail, /generateStaticParams/);
  assert.match(detail, /jsonLdGraph/);
  assert.match(detail, /<h1>/);
  assert.doesNotMatch(detail, /searchParams/);
});

test("zero external chart dependencies added to @stratat/www", () => {
  const pkg = JSON.parse(read("../package.json")) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {});
  for (const banned of ["recharts", "chart.js", "echarts", "d3", "apexcharts", "plotly.js"]) {
    assert.ok(!deps.includes(banned), `unexpected chart dependency: ${banned}`);
  }
});

test("all 7 locales have non-empty nav.tools, seo.tools, search.filterTool, home.tools* and tools.*", () => {
  for (const locale of LOCALES) {
    const flat = flatten(JSON.parse(read(`../messages/${locale}.json`)));
    assert.ok(String(flat.get("nav.tools") ?? "").trim().length > 0, `${locale} nav.tools`);
    assert.ok(String(flat.get("seo.tools.title") ?? "").trim().length > 0, `${locale} seo.tools.title`);
    assert.ok(String(flat.get("search.filterTool") ?? "").trim().length > 0, `${locale} search.filterTool`);
    assert.ok(String(flat.get("home.toolsTitle") ?? "").trim().length > 0, `${locale} home.toolsTitle`);
    for (const slug of TOOL_SLUGS) {
      assert.ok(String(flat.get(`tools.items.${slug}.title`) ?? "").trim().length > 0, `${locale} ${slug} title`);
      assert.ok(String(flat.get(`tools.items.${slug}.tagline`) ?? "").trim().length > 0, `${locale} ${slug} tagline`);
      assert.ok(String(flat.get(`tools.items.${slug}.cta`) ?? "").trim().length > 0, `${locale} ${slug} cta`);
    }
  }
});
