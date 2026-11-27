import test from "node:test";
import assert from "node:assert/strict";

import type { ToolRigRecord } from "../types.ts";
import {
  AXES,
  AXIS_KEYS,
  ALL_VENDORS,
  SCATTER_PRESETS,
  URL_SCHEMA,
  buildScatter,
  decodeScatterUrl,
  dominates,
  encodeScatterUrl,
  isUsableValue,
  listVendors,
  normalizeAxisKey,
  presetFor,
  type ScatterOptions,
} from "./engine.ts";

type RigOverride = Partial<ToolRigRecord>;

function rig(id: string, overrides: RigOverride = {}): ToolRigRecord {
  return {
    id,
    name: id,
    vendor: "nvidia",
    memoryGb: 24,
    form: "test node",
    readingTps: 50,
    writingTps: 50,
    fit: "Good",
    powerWatts: 500,
    cardPrice: 1000,
    rigTotal: 2000,
    capacityMTokDay: 10,
    localCostPerMM: 0.05,
    energyPerDay: 1,
    apiValuePerDay: 5,
    breakEvenDays: 400,
    evidence: "median",
    note: "",
    ...overrides,
  };
}

const OPTIONS: ScatterOptions = { x: "writingToks", y: "readingToks", vendor: ALL_VENDORS };

const TRADEOFF_RIGS = [
  rig("A", { writingTps: 10, readingTps: 100 }),
  rig("B", { writingTps: 20, readingTps: 80 }),
  rig("C", { writingTps: 30, readingTps: 60 }),
  rig("D", { writingTps: 40, readingTps: 40 }),
  rig("E", { writingTps: 20, readingTps: 50 }),
];

test("axis metadata covers all seven fields with the planned directions", () => {
  assert.deepEqual(AXIS_KEYS, [
    "rigTotal", "writingToks", "readingToks", "powerWatts",
    "localCostPerMM", "breakEvenDays", "memoryGb",
  ]);
  assert.deepEqual(AXIS_KEYS.map((key) => AXES[key].direction), [
    "max", "max", "max", "min", "min", "min", "max",
  ]);
  assert.ok(AXIS_KEYS.every((key) => AXES[key].label.length > 0 && AXES[key].format(0).length > 0));
  assert.equal(normalizeAxisKey("bogus"), "rigTotal");
  assert.equal(normalizeAxisKey(123), "rigTotal");
  assert.equal(normalizeAxisKey("powerWatts"), "powerWatts");
});

test("dominance is strict, direction-aware and never self-applied", () => {
  const b = { x: 20, y: 80 };
  const e = { x: 20, y: 50 };
  assert.equal(dominates(b, e, "writingToks", "readingToks"), true);
  assert.equal(dominates(e, b, "writingToks", "readingToks"), false);
  assert.equal(dominates(b, b, "writingToks", "readingToks"), false);

  const efficient = { x: 300, y: 100 };
  const wasteful = { x: 500, y: 90 };
  assert.equal(dominates(efficient, wasteful, "powerWatts", "writingToks"), true);
  assert.equal(dominates(efficient, wasteful, "writingToks", "powerWatts"), false);
  assert.equal(dominates({ x: Number.NaN, y: 1 }, e, "writingToks", "readingToks"), false);
});

test("Pareto frontier is non-dominated and monotonic along the trade-off", () => {
  const result = buildScatter(TRADEOFF_RIGS, OPTIONS);
  assert.equal(result.validCount, 5);
  assert.equal(result.excludedCount, 0);
  assert.deepEqual(result.frontier.map((point) => point.id), ["D", "C", "B", "A"]);
  assert.ok(result.frontier.every((point) => point.pareto && point.dominatedBy.length === 0));

  // Frontier runs from best X to worst X; along it Y improves monotonically.
  const ys = result.frontier.map((point) => point.y);
  assert.ok(ys.every((value, index) => index === 0 || value > ys[index - 1]!));

  const excluded = result.points.find((point) => point.id === "E")!;
  assert.equal(excluded.pareto, false);
  assert.deepEqual(excluded.dominatedBy, ["B", "C"]);
});

test("tie coordinates never dominate each other", () => {
  const tied = [
    rig("T1", { writingTps: 20, readingTps: 80 }),
    rig("T2", { writingTps: 20, readingTps: 80 }),
  ];
  const result = buildScatter(tied, OPTIONS);
  assert.equal(result.frontier.length, 2);
  assert.ok(result.frontier.every((point) => point.dominatedBy.length === 0 && point.pareto));
  assert.ok(!result.frontier.some((point) => point.dominatedBy.includes(point.id)));
});

test("min axes produce a monotonic power/throughput frontier", () => {
  const rigs = [
    rig("P1", { powerWatts: 300, writingTps: 50 }),
    rig("P2", { powerWatts: 500, writingTps: 100 }),
    rig("P3", { powerWatts: 700, writingTps: 120 }),
    rig("P4", { powerWatts: 500, writingTps: 40 }),
  ];
  const result = buildScatter(rigs, { x: "powerWatts", y: "writingToks", vendor: ALL_VENDORS });
  assert.deepEqual(result.frontier.map((point) => point.id), ["P1", "P2", "P3"]);
  const ys = result.frontier.map((point) => point.y);
  assert.ok(ys.every((value, index) => index === 0 || value > ys[index - 1]!));
  assert.deepEqual(result.points.find((point) => point.id === "P4")!.dominatedBy, ["P1", "P2"]);
});

test("missing, zero, negative and non-finite axis values are excluded and counted", () => {
  const rigs = [
    rig("ok", { writingTps: 50, readingTps: 50 }),
    rig("null-write", { writingTps: null as unknown as number }),
    rig("zero-write", { writingTps: 0 }),
    rig("negative-read", { readingTps: -5 }),
    rig("nan-read", { readingTps: Number.NaN }),
    rig("inf-read", { readingTps: Number.POSITIVE_INFINITY }),
    rig("null-unused", { rigTotal: null }),
  ];
  const result = buildScatter(rigs, OPTIONS);
  assert.equal(result.totalCount, 7);
  assert.equal(result.validCount, 2);
  assert.equal(result.excludedCount, 5);
  assert.deepEqual(result.points.map((point) => point.id).sort(), ["null-unused", "ok"]);
  assert.equal(isUsableValue(0), false);
  assert.equal(isUsableValue(Number.NaN), false);
  assert.equal(isUsableValue(3), true);
});

test("vendor filtering restricts machines and exclusion counts to that vendor", () => {
  const rigs = [
    rig("n1", { vendor: "nvidia", writingTps: 30, readingTps: 30 }),
    rig("n2", { vendor: "nvidia", writingTps: null as unknown as number }),
    rig("a1", { vendor: "amd", writingTps: 20, readingTps: 20 }),
    rig("a2", { vendor: "amd", writingTps: null as unknown as number }),
  ];
  assert.deepEqual(listVendors(rigs), ["amd", "nvidia"]);

  const nvidia = buildScatter(rigs, { ...OPTIONS, vendor: "nvidia" });
  assert.equal(nvidia.totalCount, 2);
  assert.equal(nvidia.validCount, 1);
  assert.equal(nvidia.excludedCount, 1);
  assert.deepEqual(nvidia.frontier.map((point) => point.id), ["n1"]);

  const empty = buildScatter(rigs, { ...OPTIONS, vendor: "unknown-vendor" });
  assert.equal(empty.totalCount, 0);
  assert.equal(empty.points.length, 0);
  assert.equal(empty.frontier.length, 0);
  assert.equal(empty.excludedCount, 0);
});

test("results are deterministic and independent of input order", () => {
  const forward = buildScatter(TRADEOFF_RIGS, OPTIONS);
  const shuffled = buildScatter([TRADEOFF_RIGS[2]!, TRADEOFF_RIGS[4]!, TRADEOFF_RIGS[0]!, TRADEOFF_RIGS[3]!, TRADEOFF_RIGS[1]!], OPTIONS);
  assert.deepEqual(shuffled, forward);
  assert.deepEqual(shuffled.frontier.map((point) => point.id), forward.frontier.map((point) => point.id));
});

test("URL round-trip only uses x, y, vendor and rig", () => {
  assert.deepEqual(Object.keys(URL_SCHEMA), ["x", "y", "vendor", "rig"]);
  const search = "?x=writingToks&y=powerWatts&vendor=nvidia&rig=rtx4090";
  const state = decodeScatterUrl(search);
  assert.deepEqual(state, {
    x: "writingToks", y: "powerWatts", vendor: "nvidia", rig: "rtx4090",
  });
  assert.equal(encodeScatterUrl(state), search);
  assert.deepEqual(decodeScatterUrl(""), {
    x: "rigTotal", y: "writingToks", vendor: ALL_VENDORS, rig: "",
  });
  assert.equal(encodeScatterUrl({}), "");
});

test("URL rejects unknown enums and normalizes the vendor sentinel", () => {
  const state = decodeScatterUrl("?x=bogus&y=bogus&vendor=&rig=");
  assert.deepEqual(state, {
    x: "rigTotal", y: "writingToks", vendor: ALL_VENDORS, rig: "",
  });
  assert.equal(decodeScatterUrl("?vendor=all").vendor, ALL_VENDORS);
  assert.equal(encodeScatterUrl({ x: "bogus" as never, y: "bogus" as never, vendor: "  " }), "");
});

test("presets map to deterministic axis pairs", () => {
  assert.deepEqual(SCATTER_PRESETS.map((preset) => [preset.x, preset.y]), [
    ["rigTotal", "writingToks"],
    ["powerWatts", "writingToks"],
    ["rigTotal", "breakEvenDays"],
  ]);
  assert.equal(presetFor("rigTotal", "writingToks"), "value");
  assert.equal(presetFor("powerWatts", "writingToks"), "power");
  assert.equal(presetFor("rigTotal", "breakEvenDays"), "payback");
  assert.equal(presetFor("memoryGb", "readingToks"), null);
});
