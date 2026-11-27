import test from "node:test";
import assert from "node:assert/strict";

import {
  METRIC_KEYS,
  URL_SCHEMA,
  compareGpus,
  computeRadarVertices,
  decodeQuery,
  encodeQuery,
  normalizeMetrics,
  parseGpuSlugs,
  radarPolygonPoints,
  rawMetrics,
  recommendQuant,
  sanitizeGpuSlugs,
  serializeGpuSlugs,
  zeroMetrics,
} from "./engine.ts";

function gpu(slug: string, patch: Partial<Parameters<typeof rawMetrics>[0]> = {}) {
  return {
    id: slug,
    slug,
    name: slug,
    vendor: "nvidia",
    arch: "Ada",
    vramGb: 24,
    bandwidthGbs: 1008,
    readingTps: 120,
    writingTps: 100,
    evidence: "measured" as const,
    cardPrice: 1000,
    powerWatts: 400,
    support: "verified" as const,
    runtime: "CUDA" as const,
    platforms: ["windows" as const, "linux" as const],
    driverMin: "550",
    recommendedPsuWatts: 850,
    coolingTier: "high-airflow-tower" as const,
    isUnifiedOrMobile: false,
    multiGpuViable: true,
    tpsPer100W: 25,
    annualPower4hUsd: 100,
    ...patch,
  };
}

test("engine: raw metrics compute efficiency and value with explicit missing flags", () => {
  const base = rawMetrics(gpu("a"));
  assert.equal(base.values.efficiency, 25);
  assert.equal(base.values.valueScore, 0.1);
  assert.deepEqual(base.missing, { efficiency: false, valueScore: false });

  const noPower = rawMetrics(gpu("b", { powerWatts: null, tpsPer100W: null }));
  assert.equal(noPower.values.efficiency, 0);
  assert.equal(noPower.missing.efficiency, true);
  assert.equal(noPower.values.valueScore, 0.1);

  const noPrice = rawMetrics(gpu("c", { cardPrice: null }));
  assert.equal(noPrice.values.valueScore, 0);
  assert.equal(noPrice.missing.valueScore, true);

  const zero = rawMetrics(gpu("d", { powerWatts: 0, cardPrice: 0, writingTps: NaN }));
  assert.equal(zero.values.writingTps, 0);
  assert.equal(zero.values.efficiency, 0);
  assert.equal(zero.values.valueScore, 0);
  assert.deepEqual(zero.missing, { efficiency: true, valueScore: true });
});

test("engine: two-card comparison normalizes maxima to 100 and awards winners", () => {
  const result = compareGpus([gpu("a", { writingTps: 100, vramGb: 24 }), gpu("b", { writingTps: 50, vramGb: 48 })]);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.maxRaw, {
    writingTps: 100,
    readingTps: 120,
    vramGb: 48,
    bandwidthGbs: 1008,
    efficiency: 25,
    valueScore: 0.1,
  });
  assert.equal(result.entries[0]?.normalized.writingTps, 100);
  assert.equal(result.entries[1]?.normalized.writingTps, 50);
  assert.equal(result.entries[0]?.normalized.vramGb, 50);
  assert.equal(result.entries[1]?.normalized.vramGb, 100);
  assert.deepEqual(result.winners.writingTps, ["a"]);
  assert.deepEqual(result.winners.vramGb, ["b"]);
  assert.ok(result.entries[0]?.winners.includes("writingTps"));
  assert.ok(result.entries[1]?.winners.includes("vramGb"));
});

test("engine: four cards, duplicates and ties are handled deterministically", () => {
  const cards = [gpu("d", { writingTps: 40 }), gpu("b", { writingTps: 80 }), gpu("a", { writingTps: 80 }), gpu("c", { writingTps: 60 }), gpu("d", { writingTps: 999 })];
  const result = compareGpus(cards);
  assert.deepEqual(result.entries.map((entry) => entry.gpu.slug), ["a", "b", "c", "d"]);
  assert.deepEqual(result.winners.writingTps, ["a", "b"]);
  assert.equal(result.maxRaw.writingTps, 80);

  const reversed = compareGpus([...cards].reverse());
  assert.deepEqual(reversed.winners.writingTps, ["a", "b"]);
  assert.deepEqual(reversed.entries.map((entry) => entry.gpu.slug), ["a", "b", "c", "d"]);
});

test("engine: fewer than two distinct cards yields an empty comparison", () => {
  for (const cards of [[], [gpu("a")], [gpu("a"), gpu("a")]]) {
    const result = compareGpus(cards);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.maxRaw, zeroMetrics());
    for (const key of METRIC_KEYS) assert.deepEqual(result.winners[key], []);
  }
});

test("engine: missing power or price degrades to zero without fabricating values", () => {
  const result = compareGpus([gpu("no-power", { powerWatts: null }), gpu("no-price", { cardPrice: 0 })]);
  assert.equal(result.entries[0]?.raw.efficiency, 0);
  assert.equal(result.entries[0]?.normalized.efficiency, 0);
  assert.equal(result.entries[0]?.missing.efficiency, true);
  assert.equal(result.entries[0]?.missing.valueScore, false);
  assert.equal(result.entries[1]?.raw.valueScore, 0);
  assert.equal(result.entries[1]?.normalized.valueScore, 0);
  assert.equal(result.entries[1]?.missing.valueScore, true);
  assert.deepEqual(result.winners.efficiency, ["no-price"]);
  assert.deepEqual(result.winners.valueScore, ["no-power"]);
});

test("engine: normalization clamps to 0–100 and handles zero/non-finite denominators", () => {
  assert.deepEqual(normalizeMetrics({ ...zeroMetrics(), vramGb: 200 }, { ...zeroMetrics(), vramGb: 100 }), {
    ...zeroMetrics(),
    vramGb: 50,
  });
  const raw = { ...zeroMetrics(), writingTps: 999, vramGb: -20 };
  const out = normalizeMetrics({ ...zeroMetrics(), writingTps: 100 }, raw);
  assert.equal(out.writingTps, 100);
  assert.equal(out.vramGb, 0);
  const nonFinite = normalizeMetrics({ ...zeroMetrics(), writingTps: Number.NaN }, { ...zeroMetrics(), writingTps: 1 });
  assert.equal(nonFinite.writingTps, 0);
});

test("engine: radar vertices are clockwise, closed, and centered correctly", () => {
  const vertices = computeRadarVertices({ writingTps: 100 }, { x: 100, y: 100 }, 50);
  assert.equal(vertices.length, 6);
  assert.deepEqual(vertices[0], { metric: "writingTps", value: 100, x: 100, y: 50 });
  assert.deepEqual(vertices[1], { metric: "readingTps", value: 0, x: 100, y: 100 });
  assert.deepEqual(vertices[3], { metric: "bandwidthGbs", value: 0, x: 100, y: 100 });
  assert.deepEqual(vertices[5], { metric: "valueScore", value: 0, x: 100, y: 100 });

  const full = computeRadarVertices([100, 100, 100, 100, 100, 100], { x: 100, y: 100 }, 50);
  assert.ok(Math.abs(full[2]!.x - (100 + (50 * Math.sqrt(3)) / 2)) < 0.001);
  assert.ok(Math.abs(full[2]!.y - 125) < 0.001);
  assert.equal(radarPolygonPoints(full), "100,50 143.301,75 143.301,125 100,150 56.699,125 56.699,75");
  assert.ok(full.every((vertex) => Math.abs(Math.hypot(vertex.x - 100, vertex.y - 100) - 50) < 0.002));
  assert.equal(computeRadarVertices([101, -1, Number.NaN, Number.POSITIVE_INFINITY], { x: 5, y: 5 }, 20)[0]?.value, 100);
  const zeroRadius = computeRadarVertices([100], { x: 0, y: 0 }, 0);
  assert.ok(zeroRadius.every((vertex) => vertex.x === 0 && vertex.y === 0));
});

test("engine: quant recommendation is deterministic and never invents a pack", () => {
  assert.equal(recommendQuant(gpu("small", { vramGb: 8 })), null);
  assert.equal(recommendQuant(gpu("apple", { vendor: "apple", vramGb: 96 }))?.fit, "full-vram");
  const card = gpu("card", { vramGb: 24, writingTps: 100 });
  assert.deepEqual(recommendQuant(card), recommendQuant(card));
  assert.equal(recommendQuant(card)?.fit, "hybrid-offload");
  assert.ok(recommendQuant(card)!.estWriteTps > 0);
});

test("engine: URL schema round-trips gpus and rejects bogus slugs", () => {
  const query = serializeGpuSlugs(["rtx-4090", "rx-7900-xtx", "rtx-4090"]);
  assert.equal(query, "?gpus=rtx-4090%2Crx-7900-xtx");
  assert.deepEqual(parseGpuSlugs(query), ["rtx-4090", "rx-7900-xtx"]);
  assert.deepEqual(parseGpuSlugs("?gpus=bad_slug,RTX-4090,ok,,,third,fourth,fifth"), ["ok", "third", "fourth", "fifth"]);
  assert.equal(serializeGpuSlugs(["only-one"]), "");
  assert.equal(serializeGpuSlugs(["a", "b", "c", "d", "e"]), "?gpus=a%2Cb%2Cc%2Cd");
  assert.deepEqual(sanitizeGpuSlugs(["a", "a", "b"]), ["a", "b"]);
  assert.deepEqual(decodeQuery("", URL_SCHEMA), { gpus: "" });
  assert.equal(encodeQuery({ gpus: "" }, URL_SCHEMA), "");
});
