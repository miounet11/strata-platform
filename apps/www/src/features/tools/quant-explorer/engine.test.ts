import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTEXT_OPTIONS,
  QUALITY_LADDER,
  RAM_MAX,
  RAM_MIN,
  URL_SCHEMA,
  comparePacks,
  evaluateVariant,
  evaluatePacks,
  normalizeEnvironment,
} from "./engine.ts";

function gpu(overrides: Partial<Parameters<typeof evaluateVariant>[1]["gpu"]> = {}) {
  return {
    id: "test-gpu",
    slug: "test-gpu",
    name: "Test GPU",
    vendor: "nvidia",
    arch: "test",
    vramGb: 192,
    bandwidthGbs: 1000,
    readingTps: 140,
    writingTps: 100,
    evidence: "estimated" as const,
    cardPrice: null,
    powerWatts: null,
    support: "verified" as const,
    runtime: "CUDA" as const,
    platforms: ["windows" as const],
    driverMin: "0",
    recommendedPsuWatts: null,
    coolingTier: "high-airflow-tower" as const,
    isUnifiedOrMobile: false,
    multiGpuViable: false,
    tpsPer100W: null,
    annualPower4hUsd: 0,
    ...overrides,
  };
}

function variant(id: string, name: string, opts: Partial<{ ramGbMin: number; vramGbMin: number; downloadGb: number; outputTps5070: number }> = {}) {
  return {
    id,
    name,
    description: `${name} catalogue pack`,
    ramGbMin: opts.ramGbMin ?? 64,
    vramGbMin: opts.vramGbMin ?? 12,
    downloadGb: opts.downloadGb ?? 72,
    outputTps5070: opts.outputTps5070 ?? 60,
    tags: [],
  };
}

const VARIANTS = [
  variant("q2_0", "Q2_0", { ramGbMin: 48, downloadGb: 70, outputTps5070: 94 }),
  variant("iq2_xs", "IQ2_XS", { ramGbMin: 64, downloadGb: 72, outputTps5070: 79 }),
  variant("iq3_xxs", "IQ3_XXS", { ramGbMin: 64, downloadGb: 74, outputTps5070: 62 }),
  variant("iq3_s", "IQ3_S", { ramGbMin: 64, downloadGb: 76, outputTps5070: 53 }),
  variant("coder", "Coder", { ramGbMin: 32, downloadGb: 68, outputTps5070: 55 }),
  variant("ud-iq4_xs", "Unsloth UD-IQ4_XS", { ramGbMin: 80, downloadGb: 94, outputTps5070: 45 }),
];

const ENV = normalizeEnvironment(gpu(), RAM_MAX, 8)!;

test("evaluates all six shipped packs with ordered quality tiers", () => {
  const rows = evaluatePacks(VARIANTS, ENV);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.id), VARIANTS.map((v) => v.id));
  assert.deepEqual(rows.map((row) => row.downloadGb), [70, 72, 74, 76, 68, 94]);
  assert.ok(rows.every((row) => row.fitStatus === "full-vram"));
  assert.ok(rows.every((row) => row.estWriteTps > 0 && Number.isFinite(row.estWriteTps)));
  assert.ok(QUALITY_LADDER.every((entry) => Number.isInteger(entry.tier) && entry.tier >= 1 && entry.tier <= 5));
  assert.deepEqual(rows.map((row) => row.qualityTier), [2, 3, 4, 5, 1, 5]);
  assert.ok(rows.every((row) => row.fitReason.length > 0));
});

test("large context and small memory degrade fit status", () => {
  const mid = normalizeEnvironment(gpu({ vramGb: 80 }), RAM_MAX, 8)!;
  const small = normalizeEnvironment(gpu(), 16, 8)!;
  const base = evaluateVariant(VARIANTS[0], mid);
  assert.equal(base.fitStatus, "full-vram");
  assert.equal(base.contextCacheGb, 1);

  const longCtx = evaluateVariant(VARIANTS[0], normalizeEnvironment(gpu({ vramGb: 80 }), RAM_MAX, 128)!);
  assert.equal(longCtx.contextCacheGb, 15.4);
  assert.equal(longCtx.fitStatus, "hybrid-offload");
  assert.ok(longCtx.estWriteTps < base.estWriteTps);

  const lowRam = evaluateVariant(VARIANTS[5], small);
  assert.equal(lowRam.fitStatus, "needs-ram");
  assert.equal(lowRam.estWriteTps, 0);
});

test("A/B comparison computes deltas and a reasoned recommendation", () => {
  const rows = evaluatePacks(VARIANTS, ENV);
  const cmp = comparePacks(rows, "q2_0", "iq2_xs");
  assert.equal(cmp.a?.id, "q2_0");
  assert.equal(cmp.b?.id, "iq2_xs");
  assert.equal(cmp.speedDeltaPct, -16);
  assert.equal(cmp.sizeDeltaGb, 2);
  assert.equal(cmp.ramDeltaGb, 16);
  assert.equal(cmp.recommendedChoice, "a");
  assert.match(cmp.reason, /16%/);

  const same = comparePacks(rows, "q2_0", "q2_0");
  assert.equal(same.recommendedChoice, null);
  assert.equal(same.speedDeltaPct, 0);
  const missing = comparePacks(rows, "q2_0", "nope");
  assert.equal(missing.b, null);
  assert.equal(missing.recommendedChoice, null);
});

test("no fabricated benchmark scores are emitted", () => {
  const rows = evaluatePacks(VARIANTS, ENV);
  const text = JSON.stringify([...rows, comparePacks(rows, "q2_0", "iq2_xs")]).toLowerCase();
  assert.doesNotMatch(text, /mmlu|benchmark score|accuracy|benchmark[% ]/);
  assert.doesNotMatch(text, /\b\d{2,3}\.\d+\s*(%|points?)\b/);
  assert.ok(rows.every((row) => Number.isInteger(row.qualityTier)));
});

test("URL schema and input normalization stay bounded", () => {
  assert.deepEqual(Object.keys(URL_SCHEMA), ["gpu", "ram", "ctx", "a", "b"]);
  assert.deepEqual(CONTEXT_OPTIONS, [8, 32, 64, 128]);
  assert.equal(URL_SCHEMA.ram.min, RAM_MIN);
  assert.equal(URL_SCHEMA.ram.max, RAM_MAX);
  const bounded = normalizeEnvironment(gpu(), 9999, 9999)!;
  assert.equal(bounded.systemRamGb, RAM_MAX);
  assert.equal(bounded.contextK, 8);
  assert.equal(normalizeEnvironment(undefined, 64, 32), null);
});
