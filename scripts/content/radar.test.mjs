import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, isPublishable, slugify } from "./radar.mjs";
import { collectSitemaps } from "../radar/sources.mjs";

/**
 * Regression tests for the new-term radar.
 *
 *   node --test scripts/content/radar.test.mjs
 *
 * The radar decides which new names become pages. Getting it wrong is not a visible error: an
 * off-topic name ships a page nobody searches for, and a missed name is simply never seen again
 * because the signal decays. These tests pin the failures that actually happened live on
 * 2026-10-23 rather than the whole scoring surface.
 *
 * The file sits next to `radar.mjs` on purpose: it is run by the deploy gate
 * (`scripts/deploy-www.sh`), by `npm test`, and by hand during an incident, and all three have to
 * be looking at the same file.
 */

const base = { momentum: 0.6, ageDays: 5, source: "huggingface", pipeline: "text-generation" };

test("a trending text model scores above the publishing floor", () => {
  const score = scoreCandidate({ ...base, name: "deepseek-ai/DeepSeek-V4-Flash", summary: "" });
  assert.ok(score > 0.55, `expected > 0.55, got ${score}`);
});

test("a GitHub repo that only mentions llm in its topics is rejected", () => {
  // Observed: `answer-me-with-html` (4,253 stars) passed the old description-wide match because
  // one of its topics said "llm". It would have produced a page about a web toy.
  const score = scoreCandidate({
    ...base,
    source: "github",
    pipeline: "",
    name: "someone/answer-me-with-html",
    summary: "a fun web toy llm agent local",
  });
  assert.equal(score, 0);
});

test("link-list and marketing names are rejected by shape", () => {
  for (const name of [
    "someone/awesome-opus5-videos",
    "someone/dsh-our-free-model",
    "someone/best-llm-ever",
  ]) {
    assert.equal(
      scoreCandidate({ ...base, source: "github", name, summary: "llm local" }),
      0,
      `${name} should be rejected`,
    );
  }
});

test("a non-text pipeline is rejected even when the name looks like a model", () => {
  const score = scoreCandidate({
    ...base,
    pipeline: "text-to-image",
    name: "acme/photo-model-2",
  });
  assert.equal(score, 0);
});

test("a model name carrying a topic word qualifies regardless of pipeline", () => {
  const score = scoreCandidate({
    ...base,
    pipeline: "text-to-image",
    name: "acme/flint-gguf",
  });
  assert.ok(score > 0, "the name states the subject, so the pipeline tag is not decisive");
});

test("a sitemap term needs the topic word as a whole segment, not as a substring", () => {
  // Observed live on 2026-10-23: the first sitemap run over four AI-tool directories selected
  // `quantum` (0.93) because `"quantum".includes("quant")` is true. That is a section word the
  // directories have carried for years, not a new product — the page would rank for nothing.
  assert.equal(
    scoreCandidate({ ...base, source: "sitemaps", pipeline: "", name: "quantum" }),
    0,
  );
  // The same word as its own segment is exactly what the source is for.
  assert.ok(
    scoreCandidate({ ...base, source: "sitemaps", pipeline: "", name: "quant-engine" }) > 0,
  );
});

test("a sitemap term with no topic word is rejected even at high momentum", () => {
  // Directories are mostly not about running models locally. Without a strict gate the radar
  // turns their whole new-product feed into pages this site cannot write honestly.
  assert.equal(
    scoreCandidate({ ...base, source: "sitemaps", pipeline: "", name: "rankify", momentum: 1 }),
    0,
  );
});

test("momentum dominates and freshness only nudges", () => {
  const hot = scoreCandidate({ ...base, name: "acme/x-gguf", momentum: 1 });
  const cold = scoreCandidate({ ...base, name: "acme/x-gguf", momentum: 0 });
  assert.ok(hot > cold, "more momentum must score higher");
  assert.ok(hot - cold > 0.4, "momentum is meant to dominate freshness");
});

test("slugs are stable and URL-safe", () => {
  assert.equal(slugify("deepseek-ai/DeepSeek-V4.1-Flash-1017"), "deepseek-ai-deepseek-v4-1-flash-1017");
  assert.equal(slugify("  Qwen/Qwen3-8B  "), "qwen-qwen3-8b");
});

test("an existing slug is never proposed again", () => {
  const taken = new Set(["qwen3-8b"]);
  assert.equal(isPublishable("qwen3-8b", taken), false);
  assert.equal(isPublishable("qwen4-9b", taken), true);
});

test("a real product name without hyphens survives the publishability check", () => {
  // Observed live on 2026-10-23: the floor was 10 characters for any hyphen-free slug, which
  // dropped `deepinfer` (DeepSeek's inference framework, 19,852 stars, score 0.97). That left the
  // GitHub source contributing nothing on every run, which looks identical to a quiet week.
  assert.equal(isPublishable("deepinfer", new Set()), true);
  assert.equal(isPublishable("vllm", new Set()), true);
  // Still rejected: too short to carry a query, or not a word at all.
  assert.equal(isPublishable("moe", new Set()), false);
  assert.equal(isPublishable("12345", new Set()), false);
});

/**
 * The sitemap collector talks to third-party directories that rot without telling us. These tests
 * pin the two ways that rot turned into a silent wrong answer on 2026-10-23.
 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test("a sitemap directory that is down is reported, not silently skipped", () => {
  // Three of the four configured directories were dead and the collector returned zero terms with
  // no error, which is indistinguishable from a quiet week with no new names.
  const restore = stubFetch(async () => {
    throw new Error("connect ECONNREFUSED");
  });
  return collectSitemaps(
    { urls: ["https://a.example/sitemap.xml", "https://b.example/sitemap.xml"], maxUrls: 100, minNewUrls: 3 },
    { sitemaps: ["https://a.example/old"] },
  )
    .then((result) => {
      assert.match(result.error ?? "", /no directory answered/);
      assert.match(result.error ?? "", /a\.example/);
      assert.match(result.error ?? "", /b\.example/);
      // The baseline of a directory that did not answer must survive, or tomorrow every one of
      // its pages reads as new.
      assert.deepEqual(result.snapshot, ["https://a.example/old"]);
    })
    .finally(restore);
});

test("a directory read for the first time becomes baseline instead of a fake surge", () => {
  // Adding a working aitoptools URL on 2026-10-23 made 19,829 previously-unseen URLs "new" in one
  // run: `blog` arrived at lift 39 and the whole radar filled with words the directory has carried
  // for years. A host with no history has no baseline to surge against.
  const body = (urls) =>
    `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  const restore = stubFetch(async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      String(url).includes("new.example")
        ? body([1, 2, 3, 4].map((i) => `https://new.example/tool-${i}`))
        : body([1, 2, 3, 4].map((i) => `https://old.example/tool-${i}`)),
  }));
  return collectSitemaps(
    { urls: ["https://new.example/sitemap.xml", "https://old.example/sitemap.xml"], maxUrls: 100, minNewUrls: 3 },
    { sitemaps: ["https://old.example/tool-1"] },
  )
    .then((result) => {
      assert.equal(result.terms.length, 0, "a first read must not produce terms");
      assert.match(result.error ?? "", /new\.example: first read/);
      assert.ok(result.snapshot.includes("https://new.example/tool-1"), "the first read is kept as baseline");
    })
    .finally(restore);
});
