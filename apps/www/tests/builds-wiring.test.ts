import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildPath, isInternalHref } from "../src/lib/internal-links.ts";

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

function messages(locale: string): Map<string, unknown> {
  return flatten(JSON.parse(read(`../messages/${locale}.json`)));
}

function hubKeyFor(pathname: string): string | undefined {
  const source = read("../src/lib/routes.ts");
  const block = /const HUB_LABELS: Record<string, string> = \{([\s\S]*?)\};/.exec(source);
  assert.ok(block, "HUB_LABELS must stay a literal object");
  const labels: Record<string, string> = {};
  for (const match of block[1].matchAll(/["']?([A-Za-z0-9-]+)["']?\s*:\s*"([^"]+)"/g)) {
    labels[match[1]] = match[2];
  }
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? labels[first] : undefined;
}

test("seven locale files share one key set", () => {
  const base = messages("en");
  for (const locale of LOCALES) {
    const keys = messages(locale);
    const missing = [...base.keys()].filter((key) => !keys.has(key));
    const extra = [...keys.keys()].filter((key) => !base.has(key));
    assert.deepEqual(missing, [], `${locale} missing keys`);
    assert.deepEqual(extra, [], `${locale} extra keys`);
    assert.equal(keys.size, base.size);
  }
});

test("nav.builds, builds.*, and gpus.config.* are non-empty in every locale", () => {
  for (const locale of LOCALES) {
    for (const [key, value] of messages(locale)) {
      const watched = key === "nav.builds" || key.startsWith("builds.") || key.startsWith("gpus.config.");
      if (!watched) continue;
      assert.equal(typeof value, "string", `${locale} ${key}`);
      assert.ok(String(value).trim().length > 0, `${locale} ${key} is empty`);
    }
    assert.ok(messages(locale).has("nav.builds"));
    assert.ok([...messages(locale).keys()].some((key) => key.startsWith("builds.")));
    assert.ok([...messages(locale).keys()].some((key) => key.startsWith("gpus.config.")));
  }
});

test("buildPath keeps the catalogue slug", () => {
  assert.equal(buildPath("rtx-4090-workstation"), "/builds/rtx-4090-workstation");
});

test("a build URL is an internal href", () => {
  assert.equal(isInternalHref("/builds/rtx-4090-workstation"), true);
});

test("PRIMARY_NAV lists /builds immediately after GPUs", () => {
  const source = read("../src/lib/routes.ts");
  assert.match(source, /\{ href: "\/gpus", key: "gpus" \},\n\s*\{ href: "\/builds", key: "builds" \}/);
});

test("SECONDARY_NAV learn group includes /builds", () => {
  const source = read("../src/lib/routes.ts");
  assert.match(
    source,
    /\{ href: "\/gpus", key: "gpus" \},\n\s*\{ href: "\/builds", key: "builds" \},\n\s*\{ href: "\/gpus\/vendor", key: "gpuBrands" \}/,
  );
});

test("STATIC_PATHS includes /builds", () => {
  const source = read("../src/lib/routes.ts");
  const block = /export const STATIC_PATHS = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(block);
  const paths = [...block[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(paths.includes("/builds"));
});

test("hubKeyFor names /builds/rtx-4090-workstation as the builds hub", () => {
  assert.equal(hubKeyFor("/builds/rtx-4090-workstation"), "builds");
  assert.equal(hubKeyFor("/builds"), "builds");
});

test("sitemap wires allBuilds() and buildPath, with hub and detail priorities", () => {
  const source = read("../src/lib/sitemap.ts");
  assert.match(source, /allBuilds\(\)/);
  assert.match(source, /buildPath/);
  assert.match(source, /path === "\/builds"/);
  assert.match(source, /path\.startsWith\("\/builds\/"\)/);
});

test("search route indexes allBuilds() as type build", () => {
  const source = read("../src/app/api/search/route.ts");
  assert.match(source, /allBuilds\(\)/);
  assert.match(source, /"build"/);
  assert.match(source, /score: s \+ 11/);
});

test("search UI offers a build filter", () => {
  const client = read("../src/components/SearchClient.tsx");
  const page = read("../src/app/[locale]/search/page.tsx");
  assert.match(client, /value="build"/);
  assert.match(page, /filterBuild/);
});

test("llms.txt lists /builds", () => {
  const source = read("../src/app/llms.txt/route.ts");
  assert.match(source, /\/builds/);
  assert.match(source, /allBuilds\(\)/);
});

test("GPU detail page mounts GpuConfigPanel and buildsForGpu", () => {
  const source = read("../src/app/[locale]/gpus/[slug]/page.tsx");
  assert.match(source, /GpuConfigPanel/);
  assert.match(source, /buildsForGpu/);
  assert.match(source, /\/builds/);
  assert.match(source, /\/can-i-run/);
});

test("builds index and detail export revalidate and jsonLdGraph", () => {
  for (const rel of ["../src/app/[locale]/builds/page.tsx", "../src/app/[locale]/builds/[slug]/page.tsx"]) {
    const source = read(rel);
    assert.match(source, /export const revalidate = 1800;/);
    assert.match(source, /jsonLdGraph/);
    assert.match(source, /<h1>/);
  }
});

test("revalidate accepts a builds scope and IndexNow submits build URLs", () => {
  const revalidate = read("../src/app/api/revalidate/route.ts");
  assert.match(revalidate, /builds: \["", "\/builds", "\/gpus"\]/);
  assert.match(revalidate, /"\/\[locale\]\/builds\/\[slug\]"/);
  assert.match(revalidate, /"\/\[locale\]\/gpus\/\[slug\]"/);
  const indexnow = read("../../../scripts/indexnow-submit.mjs");
  assert.match(indexnow, /\/builds/);
  assert.match(indexnow, /pc-builds\.json/);
  assert.match(indexnow, /pcBuildPaths\(\)/);
});
