import test from "node:test";
import assert from "node:assert/strict";

import type { ToolBuildRecord, ToolsBundle } from "../types.ts";
import {
  BUDGET_MAX,
  URL_SCHEMA,
  assessPsu,
  buildDetail,
  computeDonutSegments,
  computeGaugeAngles,
  decodeBuilderUrl,
  encodeBuilderUrl,
  estimateBom,
  filterBuilds,
  findAlternatives,
  normalizeFilters,
  polarPoint,
  recommendBuilds,
  recommendWithFallback,
} from "./engine.ts";

function build(slug: string, patch: Partial<ToolBuildRecord> = {}): ToolBuildRecord {
  return {
    slug,
    tier: "sweet-spot",
    vendor: "nvidia",
    gpuModel: `${slug}-gpu`,
    gpuCount: 1,
    totalVramGb: 24,
    systemRamGb: 64,
    runtime: "CUDA",
    readingTps: 120,
    writingTps: 100,
    evidence: "measured",
    idleWatts: 60,
    loadWatts: 450,
    totalPriceUsd: 2000,
    localCostPerMM: 2,
    breakEvenDays: 120,
    title: `Build ${slug}`,
    tagline: "catalogue build",
    ...patch,
  };
}

function bundle(builds: ToolBuildRecord[]): ToolsBundle {
  return {
    locale: "en",
    gpus: [],
    rigs: [],
    builds,
    variants: [],
    downloads: {
      syncedAt: "",
      siteUrl: "",
      engineTag: "",
      engineUrl: "",
      desktopTag: "",
      desktopUrl: "",
      assetCount: 0,
      platforms: [],
    },
  };
}

const CATALOG = bundle([
  build("cheap", { totalPriceUsd: 1200, writingTps: 60, totalVramGb: 12, vendor: "nvidia", tier: "budget" }),
  build("mid", { totalPriceUsd: 2200, writingTps: 100, totalVramGb: 24, vendor: "nvidia", tier: "sweet-spot" }),
  build("amd", { totalPriceUsd: 2600, writingTps: 110, totalVramGb: 24, vendor: "amd", tier: "sweet-spot" }),
  build("apple", { totalPriceUsd: 3200, writingTps: 95, totalVramGb: 64, vendor: "apple", tier: "compact-unified" }),
  build("flagship", { totalPriceUsd: 8000, writingTps: 220, totalVramGb: 96, vendor: "nvidia", tier: "flagship" }),
]);

test("engine: budget filter keeps only builds at or under the cap", () => {
  assert.deepEqual(filterBuilds(CATALOG.builds, { maxBudgetUsd: 2000 }).map((b) => b.slug), ["cheap"]);
  assert.deepEqual(filterBuilds(CATALOG.builds, { maxBudgetUsd: 2600 }).map((b) => b.slug), ["cheap", "mid", "amd"]);
  assert.deepEqual(filterBuilds(CATALOG.builds, {}).map((b) => b.slug), CATALOG.builds.map((b) => b.slug));
});

test("engine: vendor, VRAM and tier filters compose deterministically", () => {
  assert.deepEqual(filterBuilds(CATALOG.builds, { vendor: "amd" }).map((b) => b.slug), ["amd"]);
  assert.deepEqual(filterBuilds(CATALOG.builds, { minVramGb: 48 }).map((b) => b.slug), ["apple", "flagship"]);
  assert.deepEqual(
    filterBuilds(CATALOG.builds, { vendor: "nvidia", tier: "sweet-spot", minVramGb: 24 }).map((b) => b.slug),
    ["mid"],
  );
  assert.equal(normalizeFilters({ maxBudgetUsd: -5, vendor: "bogus" as never, minVramGb: -3, tier: "bad" as never }).maxBudgetUsd, 1000);
  assert.equal(normalizeFilters({ vendor: "bogus" as never, tier: "bad" as never }).vendor, "all");
  assert.equal(normalizeFilters({ tier: "bad" as never }).tier, "all");
});

test("engine: recommendations rank at most three and prefer strong measured builds", () => {
  const picks = recommendBuilds(CATALOG, { maxBudgetUsd: 3200 });
  assert.equal(picks.length, 3);
  assert.ok(picks.every((pick) => pick.build.totalPriceUsd <= 3200));
  assert.ok(picks[0]!.score >= picks[1]!.score);
  assert.ok(picks[1]!.score >= picks[2]!.score);
  assert.equal(new Set(picks.map((pick) => pick.build.slug)).size, 3);
  assert.ok(picks.every((pick) => pick.reasons.length > 0));
  assert.deepEqual(recommendBuilds(CATALOG, {}, 0), []);
  assert.equal(recommendBuilds(CATALOG, {}, 10).length, CATALOG.builds.length);
});

test("engine: empty result degrades safely and can be restored", () => {
  const impossible = { maxBudgetUsd: 1000, vendor: "apple" as const, minVramGb: 1024, tier: "flagship" as const };
  assert.deepEqual(filterBuilds(CATALOG.builds, impossible), []);
  assert.deepEqual(recommendBuilds(CATALOG, impossible), []);

  const fallback = recommendWithFallback(CATALOG, impossible);
  assert.equal(fallback.relaxed, true);
  assert.ok(fallback.recommendations.length > 0);
  assert.ok(fallback.recommendations.every((pick) => pick.build.totalPriceUsd <= BUDGET_MAX));

  const exact = recommendWithFallback(CATALOG, { vendor: "amd" });
  assert.equal(exact.relaxed, false);
  assert.deepEqual(exact.recommendations.map((pick) => pick.build.slug), ["amd"]);
  assert.deepEqual(recommendWithFallback(bundle([]) as typeof CATALOG, {}).recommendations, []);
});

test("engine: donut segments sweep exactly 360 degrees and follow catalogue order", () => {
  const detail = buildDetail(CATALOG.builds[1]!, CATALOG.builds);
  const sum = detail.donut.reduce((total, segment) => total + segment.angle, 0);
  assert.ok(Math.abs(sum - 360) < 1e-9);
  assert.equal(detail.donut[0]!.startAngle, -90);
  assert.equal(detail.donut.at(-1)!.endAngle, 270);
  for (let i = 1; i < detail.donut.length; i += 1) {
    assert.equal(detail.donut[i]!.startAngle, detail.donut[i - 1]!.endAngle);
  }
  assert.equal(detail.bom.shares.reduce((total, share) => total + share.pct, 0), 100);
  assert.equal(detail.bom.estimated, true);
  assert.ok(detail.bom.shares.every((share) => share.usd >= 0));

  const zero = estimateBom(build("zero", { totalPriceUsd: 0 }));
  assert.deepEqual(computeDonutSegments(zero.shares), []);
  assert.deepEqual(computeDonutSegments([]), []);
});

test("engine: PSU recommendation covers the load with positive headroom", () => {
  const normal = assessPsu(450);
  assert.ok(normal.recommendedWatts >= 450 / 0.65);
  assert.ok(normal.loadPct < 100);
  assert.ok(normal.headroomPct > 0);
  assert.equal(normal.loadPct + normal.headroomPct, 100);
  assert.ok(["tight", "comfortable", "ample"].includes(normal.tier));

  const heavy = assessPsu(1600);
  assert.ok(heavy.recommendedWatts >= 1600 / 0.65);
  assert.ok(heavy.loadPct > 0 && heavy.loadPct <= 100);
  const unknown = assessPsu(0);
  assert.equal(unknown.tier, "unknown");
  assert.equal(unknown.recommendedWatts, 0);
  assert.equal(assessPsu(Number.NaN).tier, "unknown");

  const gauge = computeGaugeAngles(normal.loadPct);
  assert.ok(Math.abs(gauge.loadAngle + gauge.headroomAngle - 180) < 1e-9);
  assert.equal(computeGaugeAngles(150).loadAngle, 180);
});

test("engine: efficiency and alternatives come only from the catalogue", () => {
  const detail = buildDetail(CATALOG.builds[1]!, CATALOG.builds);
  assert.equal(detail.efficiencyTpsPer100W, 22.22);
  assert.equal(detail.alternatives.downgrade?.slug, "cheap");
  assert.equal(detail.alternatives.upgrade?.slug, "amd");
  assert.equal(detail.alternatives.upgrade?.priceDeltaUsd, 400);
  assert.equal(findAlternatives(CATALOG.builds[0]!, CATALOG.builds).downgrade, null);
  assert.equal(buildDetail(build("no-power", { loadWatts: 0 }), CATALOG.builds).efficiencyTpsPer100W, 0);
});

test("engine: SVG geometry helpers are stable and clamp to sane angles", () => {
  assert.deepEqual(polarPoint(100, 100, 50, -90), { x: 100, y: 50 });
  assert.deepEqual(polarPoint(100, 100, 50, 0), { x: 150, y: 100 });
  assert.deepEqual(polarPoint(100, 100, 50, 90), { x: 100, y: 150 });
});

test("engine: URL state round-trips filters and selected slug", () => {
  assert.deepEqual(Object.keys(URL_SCHEMA), ["budget", "vendor", "vram", "tier", "pick"]);
  const state = {
    maxBudgetUsd: 4200,
    vendor: "amd" as const,
    minVramGb: 32,
    tier: "dual-gpu" as const,
    pick: "amd",
  };
  const query = encodeBuilderUrl(state, state.pick);
  assert.equal(query, "?budget=4200&vendor=amd&vram=32&tier=dual-gpu&pick=amd");
  assert.deepEqual(decodeBuilderUrl(query), state);
  assert.deepEqual(decodeBuilderUrl(encodeBuilderUrl({})), {
    maxBudgetUsd: BUDGET_MAX,
    vendor: "all",
    minVramGb: 0,
    tier: "all",
    pick: "",
  });
  assert.equal(encodeBuilderUrl({}), "");
  assert.deepEqual(
    decodeBuilderUrl("?budget=-9999&vendor=nope&vram=99999&tier=nope&pick=whatever"),
    {
      maxBudgetUsd: 1000,
      vendor: "all",
      minVramGb: 1024,
      tier: "all",
      pick: "whatever",
    },
  );
});
