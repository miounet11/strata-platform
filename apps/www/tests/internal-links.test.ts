import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linksIn, parseMarkdown } from "../src/lib/markdown.ts";
import {
  breadcrumbLinks,
  classifyHref,
  findMentions,
  isInternalHref,
  isLinkableName,
  isPublicPath,
  linkifyMentions,
  parentPathOf,
  pickRelated,
  PRIVATE_PREFIXES,
  translationLinks,
  uniqueLinks,
} from "../src/lib/internal-links.ts";

const kinds = ["concept", "compare", "hardware", "local", "task", "troubleshoot"];

test("markdown: headings, lists, emphasis, tables and links all survive parsing", () => {
  const blocks = parseMarkdown(
    [
      "## Section",
      "",
      "Use the **RTX 4090**, see [VRAM guide](/guides/vram).",
      "",
      "### Detail",
      "",
      "1. first",
      "2. second",
      "",
      "- alpha",
      "- beta",
      "",
      "| Card | VRAM |",
      "| --- | --- |",
      "| 4090 | 24 |",
    ].join("\n"),
  );

  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "paragraph", "heading", "list", "list", "table"],
  );

  const [h2, para, h3, ordered, unordered, table] = blocks;
  assert.equal(h2.kind === "heading" && h2.level, 2);
  assert.equal(h3.kind === "heading" && h3.level, 3);
  assert.equal(ordered.kind === "list" && ordered.ordered, true);
  assert.equal(unordered.kind === "list" && unordered.ordered, false);

  assert.ok(para.kind === "paragraph");
  const seen = para.inlines.map((i) => i.kind);
  assert.ok(seen.includes("strong"), "**bold** must become strong, not literal asterisks");
  assert.ok(seen.includes("link"), "a markdown link must become a link node");
  const link = para.inlines.find((i) => i.kind === "link");
  assert.equal(link?.kind === "link" && link.href, "/guides/vram");
  assert.equal(link?.kind === "link" && link.text, "VRAM guide");

  assert.deepEqual(table.kind === "table" && table.head, ["Card", "VRAM"]);
  assert.deepEqual(table.kind === "table" && table.rows, [["4090", "24"]]);
});

test("markdown: a leading H1 is dropped and never produces a second heading", () => {
  const blocks = parseMarkdown("# Title\n\nBody text.");
  assert.equal(blocks.some((b) => b.kind === "heading"), false);
  assert.equal(linksIn("# Title\n\nBody text.").length, 0);
});

test("markdown: linksIn returns every href in document order", () => {
  const body = "See [a](/guides/a) and [b](/gpus/b).\n\n- [c](/guides/c)";
  assert.deepEqual(linksIn(body), ["/guides/a", "/gpus/b", "/guides/c"]);
});

test("isInternalHref: site paths and our own absolute URLs count, everything else does not", () => {
  assert.equal(isInternalHref("/guides/vram"), true);
  assert.equal(isInternalHref("/gpus/rtx-4090"), true);
  assert.equal(isInternalHref("https://www.stratat.com/guides/vram"), true);
  assert.equal(isInternalHref("https://example.com/guides"), false);
  assert.equal(isInternalHref("mailto:a@b.c"), false);
  assert.equal(isInternalHref("javascript:alert(1)"), false);
  assert.equal(isInternalHref("#anchor"), false);
  assert.equal(isInternalHref(""), false);
});

test("isInternalHref: private prefixes are never offered as crawl targets", () => {
  for (const href of ["/b/1", "/dashboard", "/login", "/api/v1", "/admin/x"]) {
    assert.equal(isInternalHref(href), false, `${href} must not be an internal link`);
    assert.equal(isPublicPath(href), false);
  }
  assert.equal(isPublicPath("/guides/vram"), true);
});

test("uniqueLinks: drops duplicates, self links and non-internal hrefs", () => {
  const out = uniqueLinks(
    [
      { href: "/guides/a", title: "A" },
      { href: "/guides/a/", title: "A again" },
      { href: "/guides/b", title: "B" },
      { href: "/guides/c", title: "C (self)" },
      { href: "https://evil.example/x", title: "offsite" },
    ],
    { excludeHref: "/guides/c" },
  );
  assert.deepEqual(out.map((i) => i.href), ["/guides/a", "/guides/b"]);
});

test("parentPathOf: the hub is found past the locale prefix", () => {
  assert.equal(parentPathOf("/zh/gpus/rtx-4090"), "/zh/gpus");
  assert.equal(parentPathOf("/gpus/rtx-4090"), "/gpus");
  assert.equal(parentPathOf("/gpus"), undefined);
  assert.equal(parentPathOf("/zh"), undefined);
});

test("breadcrumbLinks: the trail starts at home, passes the hub, and ends at the page", () => {
  const trail = breadcrumbLinks("/zh/gpus/rtx-4090", "RTX 4090");
  assert.deepEqual(trail.map((c) => c.href), ["/", "/zh/gpus", "/zh/gpus/rtx-4090"]);
  assert.equal(trail[trail.length - 1].label, "RTX 4090");
  assert.equal(trail[trail.length - 1].current, true);
  assert.ok(trail.slice(0, -1).every((c) => !c.current), "only the leaf is the current page");
});

test("breadcrumbLinks: a private path yields no trail at all", () => {
  assert.deepEqual(breadcrumbLinks("/dashboard/settings"), []);
});

test("pickRelated: same kind first, never self, never duplicated", () => {
  const candidates = [
    { slug: "a", kind: "hardware", order: 3, title: "A" },
    { slug: "b", kind: "concept", order: 1, title: "B" },
    { slug: "c", kind: "hardware", order: 2, title: "C" },
    { slug: "b", kind: "concept", order: 1, title: "B duplicate" },
    { slug: "d", kind: "compare", order: 1, title: "D" },
  ];
  const picked = pickRelated(candidates, { slug: "a", kind: "hardware" }, 3, kinds);
  assert.deepEqual(picked.map((p) => p.slug), ["c", "b", "d"]);
  assert.ok(!picked.some((p) => p.slug === "a"), "the current page must never be its own related link");
  assert.equal(new Set(picked.map((p) => p.slug)).size, picked.length);
});

test("pickRelated: respects the limit and handles an empty catalogue", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({ slug: `s${i}`, kind: "task", order: i, title: `S${i}` }));
  assert.equal(pickRelated(candidates, { slug: "x", kind: "task" }, 4, kinds).length, 4);
  assert.deepEqual(pickRelated([], { slug: "x", kind: "task" }, 4, kinds), []);
});

test("linkifyMentions: links the first mention only, capped by limit", () => {
  const catalog = [
    { name: "RTX 4090", slug: "rtx-4090" },
    { name: "RTX 5080", slug: "rtx-5080" },
    { name: "RX 7900 XTX", slug: "amd-radeon-rx-7900-xtx" },
  ];
  const once = linkifyMentions("The RTX 4090 wins. Later the RTX 4090 is cheap.", catalog);
  assert.equal(once.match(/\]\(\/gpus\//g)?.length, 1);
  assert.equal(linkifyMentions("RTX 4090, RTX 5080, RX 7900 XTX", catalog, { limit: 2 }).match(/\]\(\/gpus\//g)?.length, 2);
  assert.equal(linkifyMentions("nothing to see", catalog), "nothing to see");
});

test("linkifyMentions: an explicit exclude keeps the current card unlinked", () => {
  const catalog = [{ name: "RTX 4090", slug: "rtx-4090" }];
  assert.equal(
    linkifyMentions("The RTX 4090 is the subject here.", catalog, { exclude: ["rtx-4090"] }),
    "The RTX 4090 is the subject here.",
  );
});

test("linkifyMentions: never nests a link and never rewrites a heading", () => {
  const catalog = [{ name: "RTX 4090", slug: "rtx-4090" }];

  // The first mention is already linked, so the free occurrence further down is the one to use.
  const existing = linkifyMentions("Read [RTX 4090](/guides/x) first, then RTX 4090.", catalog);
  assert.equal(existing.match(/\[\[/g), null, "a link must never be nested inside another link");
  assert.equal(existing, "Read [RTX 4090](/guides/x) first, then [RTX 4090](/gpus/rtx-4090).");

  // A heading is a navigation label, not a sentence: linking inside it would also break the anchor.
  const heading = linkifyMentions("## RTX 4090\n\nbody RTX 4090 here.", catalog);
  assert.ok(heading.startsWith("## RTX 4090"));
  assert.ok(heading.includes("body [RTX 4090](/gpus/rtx-4090) here."));
});

test("linkifyMentions: numeric-only card names are never matched in prose", () => {
  // The catalogue really does contain a card called "300" (SiS, 1999) and one called "6326".
  // Word boundaries do not help: every number in a guide would become a link to a 1999 chip.
  const catalog = [{ name: "300", slug: "sis-300-32-mb-1999" }];
  const body = "It runs at 300 tok/s and was measured in 300 runs.";
  assert.equal(linkifyMentions(body, catalog), body);
  assert.deepEqual(findMentions(body, catalog), []);
  // A name carrying a letter is still matched.
  assert.equal(isLinkableName("RTX 4090"), true);
  assert.equal(isLinkableName("6326"), false);
});

test("route model: every advertised path is public and every private prefix stays out", () => {
  // The hubs a crawler is invited to. `routes.ts` cannot be imported here — Node resolves its
  // relative imports without extensions, which only a bundler can follow — so this list is read
  // from the source text instead of restated by hand: a hub added there without a matching
  // public prefix here is exactly the regression this test is for.
  const source = readFileSync(new URL("../src/lib/routes.ts", import.meta.url), "utf8");
  const block = /export const STATIC_PATHS = \[([\s\S]*?)\] as const;/.exec(source);
  assert.ok(block, "STATIC_PATHS must stay a literal array the test can read");
  const staticPaths = [...block[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
  assert.ok(staticPaths.length >= 10, "STATIC_PATHS must not be empty");

  for (const path of staticPaths) {
    assert.equal(isPublicPath(path || "/"), true, `${path || "/"} must be public`);
    assert.equal(isInternalHref(path || "/"), true, `${path || "/"} must be linkable`);
  }

  for (const prefix of PRIVATE_PREFIXES) {
    assert.equal(isPublicPath(prefix), false, `${prefix} must not be public`);
    assert.equal(isPublicPath(`${prefix}/example`), false, `${prefix}/example must not be public`);
    assert.equal(isInternalHref(`${prefix}/example`), false, `${prefix}/example must not be linkable`);
  }
});

test("classifyHref: the protocol decides how a prose link is rendered", () => {
  // The router only understands site paths; these must never be handed to it.
  assert.equal(classifyHref("/guides/vram"), "internal");
  assert.equal(classifyHref("https://www.stratat.com/guides/vram"), "internal");
  assert.equal(classifyHref("https://example.com/spec-sheet"), "external");
  assert.equal(classifyHref("//example.com/x"), "external");
  assert.equal(classifyHref("mailto:team@stratata.com"), "contact");
  assert.equal(classifyHref("tel:+10000000"), "contact");
  // Active content has no safe rendering as a link at all.
  assert.equal(classifyHref("javascript:alert(1)"), "unsafe");
  assert.equal(classifyHref("JavaScript:alert(1)"), "unsafe");
  assert.equal(classifyHref("data:text/html,<script>alert(1)</script>"), "unsafe");
  assert.equal(classifyHref(""), "unsafe");
  // A private path is a site path, but still not something to link.
  assert.equal(classifyHref("/b/secret"), "unsafe");
});

test("translationLinks: same slug in other languages, current language excluded", () => {
  const links = translationLinks("vram", [
    { code: "en", title: "VRAM" },
    { code: "zh", title: "显存" },
    { code: "ja", title: "VRAM とは" },
  ], "en");
  assert.deepEqual(links.map((l) => l.href), ["/zh/guides/vram", "/ja/guides/vram"]);
});
