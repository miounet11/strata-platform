import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonLdGraph, nodeId, pageLd } from "../src/lib/jsonld.ts";
import { breadcrumbJsonLd } from "../src/lib/breadcrumbs.ts";

const SITE = "https://www.stratat.com";
const url = `${SITE}/en/guides/vram-vs-ram`;

/**
 * `item` is present on every crumb but the non-final ones whose caller passed no path, so the
 * union the builder returns has a member without the property. Reading through one narrow helper
 * keeps the assertions about values rather than about TypeScript.
 */
type CrumbItem = { "@type": string; position: number; name: string; item?: string | { "@id": string } };

function trailOf(crumb: ReturnType<typeof breadcrumbJsonLd>): CrumbItem[] {
  assert.ok(crumb, "expected a BreadcrumbList");
  return crumb.itemListElement as CrumbItem[];
}

test("jsonld: members lose their own @context, the graph root keeps one", () => {
  const graph = jsonLdGraph([
    { "@context": "https://schema.org", "@type": "WebPage", url },
    { "@context": "https://schema.org", "@type": "Article", url },
  ]);

  assert.equal(graph["@context"], "https://schema.org");
  assert.equal(graph["@graph"].length, 2);
  for (const node of graph["@graph"]) {
    assert.equal("@context" in node, false);
  }
});

test("jsonld: null members are dropped instead of becoming empty nodes", () => {
  const graph = jsonLdGraph([{ "@type": "WebPage" }, null, undefined]);
  assert.equal(graph["@graph"].length, 1);
});

test("jsonld: nodeId is page-scoped so two pages never share an id", () => {
  assert.notEqual(nodeId(url, "article"), nodeId(`${SITE}/de/guides/vram-vs-ram`, "article"));
  assert.equal(nodeId(url, "article"), `${url}#article`);
});

test("breadcrumbs: the last item points at the page node instead of restating the URL", () => {
  const pageId = nodeId(url, "webpage");
  const crumb = breadcrumbJsonLd(SITE, "en", [
    { path: "", name: "Home" },
    { path: "/guides", name: "Guides" },
    { name: "VRAM vs RAM", id: pageId },
  ]);

  const items = trailOf(crumb);
  assert.deepEqual(items[0].item, `${SITE}/en`);
  assert.deepEqual(items[1].item, `${SITE}/en/guides`);
  assert.deepEqual(items[2].item, { "@id": pageId });
});

test("breadcrumbs: a single-item trail still yields nothing", () => {
  assert.equal(breadcrumbJsonLd(SITE, "en", [{ name: "Home" }]), null);
});

test("breadcrumbs: the home crumb keeps its URL even though its path is an empty string", () => {
  const crumb = breadcrumbJsonLd(SITE, "en", [
    { path: "", name: "Home" },
    { path: "/guides", name: "Guides" },
  ]);

  // `path: ""` is the home page. Treating it as absent dropped `item` from the first crumb on all
  // five trails that start at the home page, and Google requires `item` on every entry but the last.
  assert.deepEqual(trailOf(crumb)[0].item, `${SITE}/en`);
});

test("pageLd: the node points at the localized URL it describes", () => {
  const node = pageLd(SITE, "de", "/gpus/vendor", "Hersteller");

  assert.equal(node.url, `${SITE}/de/gpus/vendor`);
  assert.equal(node["@id"], `${SITE}/de/gpus/vendor#webpage`);
  assert.equal(node.name, "Hersteller");
  assert.equal(node.inLanguage, "de");
  assert.equal(node["@type"], "WebPage");
});

test("pageLd: a collection declares CollectionPage", () => {
  const node = pageLd(SITE, "en", "/gpus", "GPUs", { type: "CollectionPage" });
  assert.equal(node["@type"], "CollectionPage");
});

test("pageLd: an absent description is omitted, not emitted as undefined", () => {
  const node = pageLd(SITE, "en", "/links", "Links");
  assert.equal("description" in node, false);
});

test("skip link: every locale has the nav string it renders", () => {
  for (const locale of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    const label = messages?.nav?.skipToContent;
    assert.equal(typeof label, "string", `${locale} has no nav.skipToContent`);
    assert.ok(label.trim().length > 0, `${locale} skipToContent is blank`);
  }
});

test("i18n parity: all 7 locales define canIRun, search, vps, new guide kinds, and all 9 scenarios", () => {
  const scenarios = ["value", "under2000", "lowPower", "apple", "fastest", "fastPayback", "multiGpu", "amd", "highVram"];
  for (const locale of ["en", "zh", "ja", "de", "fr", "es", "pt"]) {
    const m = JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    assert.ok(m.nav?.canIRun, `${locale} missing nav.canIRun`);
    assert.ok(m.nav?.search, `${locale} missing nav.search`);
    assert.ok(m.nav?.vps, `${locale} missing nav.vps`);
    assert.ok(m.canIRun?.title, `${locale} missing canIRun.title`);
    assert.ok(m.search?.title, `${locale} missing search.title`);
    assert.ok(m.guides?.kinds?.radar, `${locale} missing guides.kinds.radar`);
    assert.ok(m.guides?.kinds?.release, `${locale} missing guides.kinds.release`);
    for (const key of scenarios) {
      assert.ok(m.scenarios?.items?.[key]?.title, `${locale} missing scenarios.items.${key}.title`);
    }
  }
});

test("site entities: WebSite declares SearchAction pointing at /en/search", () => {
  const source = readFileSync(new URL("../src/lib/site-entities.ts", import.meta.url), "utf8");
  assert.match(source, /"@type":\s*"SearchAction"/);
  assert.match(source, /\/en\/search\?q=\{search_term_string\}/);
});
