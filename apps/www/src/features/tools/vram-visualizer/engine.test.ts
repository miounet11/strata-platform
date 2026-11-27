import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeVramUrl,
  encodeVramUrl,
  engineSpec,
  ENGINE_SPECS,
  kvCacheGb,
  QUANT_SPECS,
  quantSpec,
  simulateVram,
  URL_SCHEMA,
  type VramSimInput,
} from "./engine.ts";

function input(overrides: Partial<VramSimInput> = {}): VramSimInput {
  return {
    gpuSlug: "rtx-4090",
    vramGb: 24,
    ramGb: 64,
    unifiedMemory: false,
    quantId: "iq2_xs",
    contextK: 8,
    kvPrecision: "q8_0",
    engineFamily: "strata-engine",
    ...overrides,
  };
}

function finiteNonNegative(value: number, label: string) {
  assert.equal(Number.isFinite(value), true, `${label} must be finite, got ${value}`);
  assert.equal(value >= 0, true, `${label} must be >= 0, got ${value}`);
}

test("engine: all six quant packs are supported with finite, distinct footprints", () => {
  assert.equal(QUANT_SPECS.length, 6);
  for (const spec of QUANT_SPECS) {
    assert.equal(quantSpec(spec.id).id, spec.id);
    const result = simulateVram(
      input({ quantId: spec.id, vramGb: 24, ramGb: 128, contextK: 8 }),
    );
    finiteNonNegative(result.vramWeightsGb, "vramWeightsGb");
    finiteNonNegative(result.estWriteTps, "estWriteTps");
    assert.match(result.cliCommand, new RegExp(`--quant ${spec.id}`));
  }
  assert.ok(new Set(QUANT_SPECS.map((spec) => spec.id)).size === 6);
  assert.ok(new Set(QUANT_SPECS.map((spec) => spec.weightsGb)).size >= 5);
  assert.equal(quantSpec("not-a-quant").id, "iq2_xs");
});

test("engine: all three engine families expose different capacity/speed coefficients", () => {
  assert.equal(ENGINE_SPECS.length, 3);
  for (const spec of ENGINE_SPECS) {
    assert.equal(engineSpec(spec.id).id, spec.id);
    const result = simulateVram(input({ engineFamily: spec.id }));
    finiteNonNegative(result.vramCapacityGb, "vramCapacityGb");
    assert.match(result.cliCommand, new RegExp(`--engine ${spec.id}`));
  }
  assert.equal(engineSpec("strata-engine").vramFactor > engineSpec("strata-hy4").vramFactor, true);
  assert.equal(engineSpec("strata-hy4").speedFactor > engineSpec("strata-inkling").speedFactor, true);
  assert.equal(engineSpec("unknown").id, "strata-engine");
});

test("engine: 128 GB VRAM loads weights + KV fully with zero offload", () => {
  const result = simulateVram(input({ vramGb: 128, ramGb: 128, contextK: 128 }));
  assert.equal(result.overflowTier, "none");
  assert.equal(result.ramOffloadGb, 0);
  assert.equal(result.ssdOffloadGb, 0);
  assert.ok(result.vramKvGb > 0);
  assert.ok(result.vramHeadroomGb > 0);
  assert.ok(result.vramWeightsGb + result.vramKvGb <= result.vramCapacityGb + 0.01);
});

test("engine: 12 GB VRAM + 64 GB RAM offloads weights to RAM without SSD", () => {
  const result = simulateVram(input({ vramGb: 12, ramGb: 64, contextK: 32 }));
  assert.equal(result.overflowTier, "ram-offload");
  assert.ok(result.vramWeightsGb > 0);
  assert.ok(result.ramOffloadGb > 0);
  assert.equal(result.ssdOffloadGb, 0);
  assert.ok(result.recommendedFlags.includes("--ram-offload"));
  assert.ok(!result.recommendedFlags.includes("--ple-io"));
});

test("engine: 8 GB VRAM + 32 GB RAM with UD-IQ4_XS spills to SSD PLE", () => {
  const result = simulateVram(
    input({ vramGb: 8, ramGb: 32, quantId: "ud-iq4_xs", contextK: 128 }),
  );
  assert.equal(result.overflowTier, "ssd-offload");
  assert.ok(result.ssdOffloadGb > 0);
  assert.ok(result.recommendedFlags.includes("--ple-io"));
  assert.ok(result.warnings.some((warning) => warning.includes("SSD PLE")));
});

test("engine: unified memory reserves OS share before allocation", () => {
  const dedicated = simulateVram(input({ vramGb: 64, ramGb: 64, unifiedMemory: false }));
  const unified = simulateVram(input({ vramGb: 64, ramGb: 64, unifiedMemory: true }));
  assert.ok(unified.vramCapacityGb < dedicated.vramCapacityGb * 1.01);
  assert.ok(unified.ramCapacityGb < dedicated.ramCapacityGb);
  assert.ok(unified.recommendedFlags.includes("--unified-memory"));
  assert.ok(unified.warnings.some((warning) => warning.includes("Unified memory reserves")));
});

test("engine: FP16 KV doubles Q8_0, Q4_0 halves it; 128K is 16x 8K", () => {
  const q8 = kvCacheGb(8, "q8_0");
  const fp16 = kvCacheGb(8, "fp16");
  const q4 = kvCacheGb(8, "q4_0");
  assert.ok(Math.abs(fp16 - q8 * 2) < 0.02);
  assert.ok(Math.abs(q4 - q8 / 2) < 0.02);
  assert.ok(Math.abs(kvCacheGb(128, "q8_0") - q8 * 16) < 0.1);
  const base = simulateVram(input({ vramGb: 24, ramGb: 64, kvPrecision: "q8_0" }));
  const double = simulateVram(input({ vramGb: 24, ramGb: 64, kvPrecision: "fp16" }));
  assert.ok(double.vramKvGb + double.ramOffloadGb + double.ssdOffloadGb >= base.vramKvGb);
  assert.ok(double.recommendedFlags.includes("--kv fp16"));
});

test("engine: allocations never go negative on zero or invalid capacities", () => {
  for (const vramGb of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const ramGb of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = simulateVram(input({ vramGb, ramGb, contextK: 128, quantId: "ud-iq4_xs" }));
      for (const value of [
        result.vramWeightsGb,
        result.vramKvGb,
        result.ramOffloadGb,
        result.ssdOffloadGb,
        result.vramCapacityGb,
        result.ramCapacityGb,
        result.vramHeadroomGb,
        result.ramHeadroomGb,
        result.estWriteTps,
      ]) {
        finiteNonNegative(value, "allocation");
      }
    }
  }
});

test("url: round-trip encodes only non-default values with stable aliases", () => {
  const decoded = decodeVramUrl(
    "?gpu=rtx-4090&vram=32&ram=96&unified=1&quant=iq3_s&ctx=128&kv=fp16&engine=strata-hy4",
  );
  assert.deepEqual(decoded, {
    gpu: "rtx-4090",
    vram: 32,
    ram: 96,
    unified: true,
    quant: "iq3_s",
    context: "128",
    kv: "fp16",
    engine: "strata-hy4",
  });
  const encoded = encodeVramUrl({
    gpuSlug: decoded.gpu,
    vramGb: decoded.vram,
    ramGb: decoded.ram,
    unifiedMemory: decoded.unified,
    quantId: decoded.quant,
    contextK: 128,
    kvPrecision: "fp16",
    engineFamily: "strata-hy4",
  });
  assert.equal(
    encoded,
    "?gpu=rtx-4090&vram=32&ram=96&unified=1&quant=iq3_s&ctx=128&kv=fp16&engine=strata-hy4",
  );
});

test("url: defaults encode to empty string", () => {
  assert.equal(encodeVramUrl(input({ gpuSlug: "auto", contextK: 32 })), "");
  assert.deepEqual(decodeVramUrl(""), {
    gpu: "auto",
    vram: 24,
    ram: 64,
    unified: false,
    quant: "iq2_xs",
    context: "32",
    kv: "q8_0",
    engine: "strata-engine",
  });
});

test("url: invalid and out-of-range values fall back to safe defaults", () => {
  const state = decodeVramUrl(
    "?gpu=<script>&vram=NaN&ram=-999&unified=maybe&quant=bogus&ctx=999&kv=fp32&engine=evil",
  );
  assert.equal(state.gpu, "<script>");
  assert.equal(state.vram, 24);
  assert.equal(state.ram, 0);
  assert.equal(state.unified, false);
  assert.equal(state.quant, "iq2_xs");
  assert.equal(state.context, "32");
  assert.equal(state.kv, "q8_0");
  assert.equal(state.engine, "strata-engine");
  assert.equal(Object.keys(URL_SCHEMA).length, 8);
});
