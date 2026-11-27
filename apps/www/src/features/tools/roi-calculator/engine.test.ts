import test from "node:test";
import assert from "node:assert/strict";

import {
  CLOUD_PRESETS,
  DAYS_PER_MONTH,
  DEFAULT_INPUT,
  URL_SCHEMA,
  computeRoi,
  decodeRoiUrl,
  encodeRoiUrl,
  getPreset,
  normalizePresetKey,
  normalizeRoiInput,
  roiInputFromUrl,
  type RoiInput,
} from "./engine.ts";

const BASE: RoiInput = { ...DEFAULT_INPUT };

test("curve covers month 0..horizon and interpolates the exact break-even point", () => {
  const result = computeRoi(BASE);
  assert.equal(result.curve.length, 61);
  assert.equal(result.curve[0]!.month, 0);
  assert.equal(result.curve[0]!.localCumulativeUsd, BASE.rigPriceUsd);
  assert.equal(result.curve[0]!.cloudCumulativeUsd, 0);
  assert.equal(result.curve[60]!.month, 60);
  assert.ok(result.curve[0]!.savingsUsd < 0 && result.curve[60]!.savingsUsd > 0);

  const exact = 3000 / (1004.4375 - 16.43625);
  assert.ok(Math.abs(result.breakEvenMonth! - exact) < 1e-4);
  assert.ok(Math.abs(result.breakEvenDays! - exact * DAYS_PER_MONTH) < 1e-3);
  assert.match(result.breakEven.hint, /Break-even/);
  assert.ok(Math.abs(result.netSavings5YearUsd - 56280.08) < 0.02);

  const allEqual = result.curve.every((point, index) =>
    index === 0 || point.localCumulativeUsd >= result.curve[index - 1]!.localCumulativeUsd,
  );
  assert.equal(allEqual, true);
});

test("cloud always cheaper yields null break-even with an explicit hint", () => {
  const result = computeRoi({ ...BASE, apiReadPerMM: 0, apiWritePerMM: 0 });
  assert.equal(result.breakEvenMonth, null);
  assert.equal(result.breakEvenDays, null);
  assert.match(result.breakEven.hint, /No break-even/);
  assert.ok(result.curve.every((point) => point.savingsUsd <= 0));
  assert.ok(result.netSavings5YearUsd < 0);

  const beyond = computeRoi({ ...BASE, rigPriceUsd: 1_000_000 });
  assert.equal(beyond.breakEvenMonth, null);
  assert.match(beyond.breakEven.hint, /beyond the horizon/);
});

test("zero cost is break-even at month 0 and stays finite", () => {
  const result = computeRoi({
    ...BASE,
    rigPriceUsd: 0,
    powerWatts: 0,
    apiReadPerMM: 0,
    apiWritePerMM: 0,
  });
  assert.equal(result.breakEvenMonth, 0);
  assert.equal(result.breakEvenDays, 0);
  assert.equal(result.netSavings5YearUsd, 0);
  assert.ok(result.curve.every((point) => point.savingsUsd === 0 && Number.isFinite(point.cloudCumulativeUsd)));
});

test("sensitivity band scales only cloud cost and brackets the base case", () => {
  const result = computeRoi(BASE);
  const { low, high, netSavings5YearRangeUsd } = result.sensitivity;
  assert.equal(low.factor, 0.75);
  assert.equal(high.factor, 1.25);
  assert.ok(result.netSavings5YearUsd > netSavings5YearRangeUsd[0]);
  assert.ok(result.netSavings5YearUsd < netSavings5YearRangeUsd[1]);
  assert.deepEqual(netSavings5YearRangeUsd, [low.netSavings5YearUsd, high.netSavings5YearUsd]);
  assert.ok(low.breakEven.month! > result.breakEvenMonth!);
  assert.ok(high.breakEven.month! < result.breakEvenMonth!);
  const local60 = result.curve[60]!.localCumulativeUsd;
  const rawLocalMonthly = (BASE.powerWatts / 1000) * BASE.dailyHours * BASE.electricityPerKwh * DAYS_PER_MONTH;
  assert.ok(Math.abs(local60 - (BASE.rigPriceUsd + rawLocalMonthly * 60)) < 0.01);
});

test("inputs are normalized at every boundary", () => {
  const raw = normalizeRoiInput({
    rigPriceUsd: -5,
    powerWatts: Number.NaN,
    dailyHours: 99,
    electricityPerKwh: -1,
    dailyMTokens: Number.POSITIVE_INFINITY,
    readShare: 2,
    apiReadPerMM: -3,
    apiWritePerMM: Number.NaN,
    horizonMonths: 999,
  });
  assert.deepEqual(raw, {
    rigPriceUsd: 0,
    powerWatts: 0,
    dailyHours: 24,
    electricityPerKwh: 0,
    dailyMTokens: 0,
    readShare: 1,
    apiReadPerMM: 0,
    apiWritePerMM: 0,
    horizonMonths: 60,
  });
  assert.equal(computeRoi({ ...BASE, horizonMonths: 1 }).curve.length, 13);
  assert.equal(computeRoi({ ...BASE, readShare: -1 }).input.readShare, 0);
});

test("URL round-trip preserves every field and rejects unknown presets", () => {
  assert.deepEqual(Object.keys(URL_SCHEMA), [
    "preset", "hardware", "rigPriceUsd", "powerWatts", "dailyHours", "electricityPerKwh",
    "dailyMTokens", "readShare", "apiReadPerMM", "apiWritePerMM", "horizonMonths",
  ]);
  const state = {
    ...BASE,
    preset: "deepseek-v3" as const,
    hardware: "rig-rtx4090",
  };
  const search = encodeRoiUrl(state);
  assert.ok(search.includes("preset=deepseek-v3"));
  assert.ok(search.includes("hardware=rig-rtx4090"));
  assert.deepEqual(decodeRoiUrl(search), state);
  assert.equal(encodeRoiUrl(decodeRoiUrl(search)), search);
  assert.deepEqual(decodeRoiUrl(""), { ...BASE, preset: "claude-sonnet", hardware: "" });
  assert.equal(encodeRoiUrl({}), "");
  assert.equal(normalizePresetKey("x"), "claude-sonnet");
  assert.equal(normalizePresetKey("gpt-4o"), "gpt-4o");
  assert.equal(decodeRoiUrl("?preset=bogus").preset, "claude-sonnet");
});

test("named presets override URL prices, while Custom keeps its own", () => {
  const preset = getPreset("deepseek-v3");
  assert.equal(CLOUD_PRESETS.length, 5);
  assert.equal(preset.apiReadPerMM, 0.27);
  const decoded = decodeRoiUrl("?preset=claude-sonnet&apiReadPerMM=0.01&apiWritePerMM=0.02");
  const fromUrl = roiInputFromUrl(decoded);
  assert.equal(fromUrl.apiReadPerMM, 3);
  assert.equal(fromUrl.apiWritePerMM, 15);
  const custom = roiInputFromUrl(decodeRoiUrl("?preset=custom&apiReadPerMM=1.25&apiWritePerMM=4.5"));
  assert.equal(custom.apiReadPerMM, 1.25);
  assert.equal(custom.apiWritePerMM, 4.5);
});
