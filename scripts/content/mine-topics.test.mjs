import test from "node:test";
import assert from "node:assert/strict";
import {
  localeDemandOrder,
  mergeMinedIntoPlan,
  mineIssueClusters,
  mineReleaseTopics,
  slugifyTag,
} from "./mine-topics.mjs";
import { renderCoverSvg } from "./cover-svg.mjs";

test("mine-topics: localeDemandOrder prioritizes highest bot+human traffic", () => {
  const board = {
    sites: [
      { site: "ja", days7: { botPv: 36000, humanPv: 32000 } },
      { site: "zh", days7: { botPv: 45000, humanPv: 550000 } },
      { site: "en", days7: { botPv: 152000, humanPv: 330000 } },
    ],
  };
  const order = localeDemandOrder(board, ["ja", "zh", "en"]);
  assert.equal(order[0], "zh"); // 45k*2 + 550k = 640k > en 152k*2 + 330k = 634k
  assert.equal(order[2], "ja");
});

test("mine-topics: mineReleaseTopics skips prereleases and captures real facts", () => {
  const releases = {
    releases: [
      { tag: "v0.3.0-beta", prerelease: true, publishedAt: "2026-11-21T00:00:00Z", body: "beta" },
      {
        tag: "v0.2.17",
        prerelease: false,
        publishedAt: "2026-11-20T00:00:00Z",
        url: "https://github.com/Niko1221/Strata/releases/tag/v0.2.17",
        body: "## Highlights\nFaster Blackwell CUDA 13 kernels.",
        assets: [{ name: "a" }, { name: "b" }],
      },
    ],
  };
  const mined = mineReleaseTopics(releases, { maxReleases: 2, locales: ["en", "zh"] });
  assert.equal(mined.length, 2);
  assert.equal(mined[0].slug, slugifyTag("v0.2.17"));
  assert.equal(mined[0].kind, "release");
  assert.equal(mined[0].facts.releaseTag, "v0.2.17");
  assert.equal(mined[0].facts.assetCount, 2);
  assert.match(mined[0].facts.highlights, /Blackwell/);
});

test("mine-topics: mineIssueClusters clusters recurring real issues above threshold", () => {
  const community = {
    issues: [
      { number: 101, title: "RTX 5090 CUDA 13 crash", body: "Blackwell sm_120 fails", updatedAt: "2026-11-18T00:00:00Z" },
      { number: 102, title: "RTX 5080 Blackwell error", body: "CUDA 13 driver mismatch", updatedAt: "2026-11-19T00:00:00Z" },
      { number: 103, title: "RTX 5070 Ti CUDA 13 OOM", body: "sm_120 kernel init", updatedAt: "2026-11-20T00:00:00Z" },
      { number: 104, title: "Single unrelated typo", body: "fix readme", updatedAt: "2026-11-20T00:00:00Z" },
    ],
  };
  const mined = mineIssueClusters(community, { minMatches: 3, locales: ["en"] });
  assert.equal(mined.length, 1);
  assert.equal(mined[0].slug, "blackwell-rtx50-cuda13-setup");
  assert.equal(mined[0].facts.matchedIssueCount, 3);
  assert.match(mined[0].facts.sampleIssues, /#103/);
});

test("mine-topics: mergeMinedIntoPlan is idempotent and respects already-written out files", () => {
  const plan = { total: 0, byLocale: {}, byKind: {}, items: [] };
  const candidates = [
    { locale: "en", kind: "release", slug: "strata-v0-2-17-whats-new", workingTitle: "v0.2.17", facts: {}, minedFrom: "releases" },
    { locale: "zh", kind: "release", slug: "strata-v0-2-17-whats-new", workingTitle: "v0.2.17", facts: {}, minedFrom: "releases" },
  ];
  const taken = new Set(["zh/strata-v0-2-17-whats-new"]);
  const first = mergeMinedIntoPlan(plan, candidates, { today: "2026-11-21", takenByLocale: taken });
  assert.equal(first.length, 1);
  assert.equal(plan.total, 1);
  const second = mergeMinedIntoPlan(plan, candidates, { today: "2026-11-21", takenByLocale: taken });
  assert.equal(second.length, 0);
  assert.equal(plan.total, 1);
});

test("cover-svg: generates deterministic 16:9 text-free SVG covers per kind/slug", () => {
  const a = renderCoverSvg({ slug: "rtx4090-iq2-xs", locale: "en", kind: "hardware" });
  const b = renderCoverSvg({ slug: "rtx4090-iq2-xs", locale: "en", kind: "hardware" });
  const c = renderCoverSvg({ slug: "cuda-out-of-memory", locale: "en", kind: "troubleshoot" });
  assert.equal(a, b, "same inputs must render identical SVG");
  assert.notEqual(a, c, "different slug/kind must render distinct artwork");
  assert.match(a, /^<svg[^>]+viewBox="0 0 1024 576"/);
  assert.equal(/<text[\s>]/i.test(a), false, "SVG covers must contain no text elements");
  assert.ok(a.endsWith("</svg>\n"));
});
