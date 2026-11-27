import test from "node:test";
import assert from "node:assert/strict";

import {
  decodePlannerUrl,
  emptySlot,
  encodePlannerUrl,
  isCardAvailable,
  planMultiGpu,
  sanitizeSlugs,
  slotsFromUrl,
  URL_SCHEMA,
  type PlannerInput,
  type PlannerSlot,
} from "./engine.ts";
import type { ToolGpuRecord } from "../types.ts";

function gpu(slug: string, overrides: Partial<ToolGpuRecord> = {}): ToolGpuRecord {
  return {
    id: slug,
    slug,
    name: slug,
    vendor: "nvidia",
    arch: "ada",
    vramGb: 24,
    bandwidthGbs: 1000,
    readingTps: 100,
    writingTps: 100,
    evidence: "estimated",
    cardPrice: 1000,
    powerWatts: 350,
    support: "verified",
    runtime: "CUDA",
    platforms: ["windows", "linux"],
    driverMin: "550",
    recommendedPsuWatts: 850,
    coolingTier: "high-airflow-tower",
    isUnifiedOrMobile: false,
    multiGpuViable: true,
    tpsPer100W: 28,
    annualPower4hUsd: 100,
    ...overrides,
  };
}

function slot(g: ToolGpuRecord | null, index = 0): PlannerSlot {
  return { id: `slot-${index + 1}`, gpu: g };
}

function input(slots: PlannerSlot[], overrides: Partial<PlannerInput> = {}): PlannerInput {
  return { slots, systemRamGb: 64, quantId: "iq2_xs", ...overrides };
}

test("engine: single card is Main with x16 and auto layer-split", () => {
  const result = planMultiGpu(input([slot(gpu("rtx-4090", { writingTps: 130 }))]));
  assert.equal(result.cards[0]!.role, "main");
  assert.equal(result.main?.gpu?.slug, "rtx-4090");
  assert.equal(result.pcieTopology, "x16");
  assert.deepEqual(result.laneWidths, [16]);
  assert.equal(result.layerSplit, "auto");
  assert.equal(result.layerSplitArg, "");
  assert.equal(result.combinedVramGb, 24);
  assert.equal(result.cards[0]!.layerSharePct, 100);
  assert.match(result.estimateNote, /规划估算，非实测承诺/);
});

test("engine: dual mixed GPUs pick the faster Main, 24:16 split and x8+x8", () => {
  const result = planMultiGpu(input([
    slot(gpu("rtx-3090", { vramGb: 24, writingTps: 95, powerWatts: 350 })),
    slot(gpu("rtx-4090", { vramGb: 24, writingTps: 130, powerWatts: 450 })),
  ]));
  assert.equal(result.main?.gpu?.slug, "rtx-4090");
  assert.equal(result.helpers.length, 1);
  assert.equal(result.helpers[0]!.gpu?.slug, "rtx-3090");
  assert.equal(result.pcieTopology, "x8+x8");
  assert.deepEqual(result.laneWidths, [8, 8]);
  // Equal VRAM yields a clean 24:24; the faster card is listed first.
  assert.equal(result.layerSplit, "24:24");
  assert.equal(result.layerSplitArg, "--layer-split 24:24");
  assert.equal(result.combinedVramGb, 48);
  assert.ok(Math.abs(result.cards[0]!.layerSharePct - 50) < 0.01);
});

test("engine: layer-split ratio follows VRAM in Main-first order", () => {
  const result = planMultiGpu(input([
    slot(gpu("rtx-4090", { vramGb: 24, writingTps: 130 })),
    slot(gpu("rtx-3090", { vramGb: 16, writingTps: 95 })),
  ]));
  assert.equal(result.main?.gpu?.slug, "rtx-4090");
  assert.equal(result.layerSplit, "24:16");
  assert.equal(result.combinedVramGb, 40);
});

test("engine: four cards use x8x4 with one Main and three Helpers", () => {
  const result = planMultiGpu(input([
    slot(gpu("a", { writingTps: 80, vramGb: 24 }), 0),
    slot(gpu("b", { writingTps: 90, vramGb: 24 }), 1),
    slot(gpu("c", { writingTps: 100, vramGb: 24 }), 2),
    slot(gpu("d", { writingTps: 70, vramGb: 16 }), 3),
  ]));
  assert.equal(result.main?.gpu?.slug, "c");
  assert.deepEqual(result.helpers.map((card) => card.gpu?.slug), ["a", "b", "d"]);
  assert.equal(result.pcieTopology, "x8x4");
  assert.deepEqual(result.laneWidths, [8, 4, 4, 4]);
  assert.equal(result.layerSplit, "24:24:24:16");
  assert.equal(result.combinedVramGb, 88);
});

test("engine: three cards use x8+x4+x4", () => {
  const result = planMultiGpu(input([
    slot(gpu("a", { writingTps: 70, vramGb: 24 })),
    slot(gpu("b", { writingTps: 100, vramGb: 24 })),
    slot(gpu("c", { writingTps: 80, vramGb: 24 })),
  ]));
  assert.equal(result.main?.gpu?.slug, "b");
  assert.equal(result.pcieTopology, "x8+x4+x4");
  assert.deepEqual(result.laneWidths, [8, 4, 4]);
});

test("engine: <=8GB or unsupported cards are Off and excluded from split", () => {
  const result = planMultiGpu(input([
    slot(gpu("rtx-4090", { writingTps: 130, vramGb: 24 }), 0),
    slot(gpu("rtx-3060", { writingTps: 80, vramGb: 8 }), 1),
    slot(gpu("broken", { writingTps: 200, vramGb: 24, support: "not-supported" }), 2),
    slot(null, 3),
  ]));
  assert.equal(result.main?.gpu?.slug, "rtx-4090");
  assert.equal(result.helpers.length, 0);
  assert.equal(result.offCards.length, 3);
  assert.equal(result.cards[1]!.role, "off");
  assert.equal(result.cards[2]!.role, "off");
  assert.equal(result.layerSplit, "auto");
  assert.equal(result.combinedVramGb, 24);
  assert.equal(result.cards[1]!.layerSharePct, 0);
  assert.equal(result.cards[1]!.laneWidth, 0);
  assert.equal(isCardAvailable(result.cards[1]!.gpu), true);
});

test("engine: PSU estimate uses 1.35x headroom rounded up to 50W", () => {
  const result = planMultiGpu(input([
    slot(gpu("a", { writingTps: 100, vramGb: 24, powerWatts: 320 })),
    slot(gpu("b", { writingTps: 90, vramGb: 24, powerWatts: 320 })),
  ]));
  // (320 + 320 + 80 system) * 1.35 = 972 -> 1000 W
  assert.equal(result.totalTdpWatts, 720);
  assert.equal(result.recommendedPsuWatts, 1000);
  assert.equal(result.headroomFactor, 1.35);
  assert.equal(result.recommendedPsuWatts % 50, 0);
  assert.ok(result.recommendedPsuWatts >= result.totalTdpWatts * 1.35);
});

test("engine: invalid numbers and empty slots never leak NaN", () => {
  const result = planMultiGpu(input([
    slot(gpu("weird", { vramGb: Number.NaN, powerWatts: Number.POSITIVE_INFINITY, writingTps: -5 })),
    emptySlot(1),
  ]));
  assert.equal(result.cards[0]!.vramGb, 0);
  assert.equal(result.cards[0]!.powerWatts, 0);
  assert.equal(result.combinedVramGb, 0);
  assert.equal(result.recommendedPsuWatts % 50, 0);
});

test("url: round-trip preserves slugs, RAM and quant", () => {
  const state = decodePlannerUrl("?g0=rtx-4090&g1=rtx-3090&g2=rtx-4070tis&g3=rtx-3060&ram=128&quant=iq3_s");
  assert.deepEqual(state, {
    slugs: ["rtx-4090", "rtx-3090", "rtx-4070tis", "rtx-3060"],
    systemRamGb: 128,
    quantId: "iq3_s",
  });
  const slots = slotsFromUrl(state, {
    gpus: state.slugs.map((slug) => gpu(slug)),
  });
  const encoded = encodePlannerUrl(input(slots, { systemRamGb: 128, quantId: "iq3_s" }));
  assert.equal(
    encoded,
    "?g0=rtx-4090&g1=rtx-3090&g2=rtx-4070tis&g3=rtx-3060&ram=128&quant=iq3_s",
  );
  assert.deepEqual(decodePlannerUrl(encoded), state);
});

test("url: defaults and invalid values fall back safely", () => {
  assert.equal(encodePlannerUrl(input([emptySlot(0)])), "");
  assert.deepEqual(decodePlannerUrl(""), { slugs: [], systemRamGb: 64, quantId: "iq2_xs" });
  const state = decodePlannerUrl("?g0=<script>&g1=rtx-4090&g2=rtx-4090&g3=../etc&ram=NaN&quant=bogus");
  assert.deepEqual(state.slugs, ["rtx-4090"]);
  assert.equal(state.systemRamGb, 64);
  assert.equal(state.quantId, "iq2_xs");
  assert.deepEqual(sanitizeSlugs(["a", "a", "bad slug", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
  assert.equal(Object.keys(URL_SCHEMA).length, 6);
});
