/**
 * Pure, deterministic five-year TCO and break-even engine for the ROI tool.
 * No React, DOM, clock or network state: the same module runs in SSR, browser and node:test.
 */
import { clamp, fmtDecimal, fmtNum, fmtUsd } from "../format.ts";
import { decodeQuery, encodeQuery, type UrlParams, type UrlSchema } from "../url-state.ts";

/** A financial month is 365.25 / 12 days so month/day figures stay consistent. */
export const DAYS_PER_MONTH = 365.25 / 12;
const FIVE_YEARS = 60;
const CAP = 1e9;

export type RoiInput = {
  rigPriceUsd: number; powerWatts: number; dailyHours: number; electricityPerKwh: number;
  dailyMTokens: number; readShare: number; apiReadPerMM: number; apiWritePerMM: number;
  horizonMonths: number;
};

export type PresetKey = "claude-sonnet" | "gpt-4o" | "deepseek-v3" | "qwen-max" | "custom";
export type CloudPreset = { key: PresetKey; label: string; apiReadPerMM: number; apiWritePerMM: number };

/** Indicative USD per 1M tokens; Custom is an editable copy of the first row. */
export const CLOUD_PRESETS: readonly CloudPreset[] = [
  { key: "claude-sonnet", label: "Claude Sonnet", apiReadPerMM: 3, apiWritePerMM: 15 },
  { key: "gpt-4o", label: "GPT-4o", apiReadPerMM: 2.5, apiWritePerMM: 10 },
  { key: "deepseek-v3", label: "DeepSeek V3", apiReadPerMM: 0.27, apiWritePerMM: 1.1 },
  { key: "qwen-max", label: "Qwen Max", apiReadPerMM: 1.6, apiWritePerMM: 6.4 },
  { key: "custom", label: "Custom", apiReadPerMM: 3, apiWritePerMM: 15 },
] as const;

export function normalizePresetKey(value: unknown): PresetKey {
  return typeof value === "string" && CLOUD_PRESETS.some((preset) => preset.key === value)
    ? (value as PresetKey)
    : "claude-sonnet";
}

export function getPreset(key: PresetKey): CloudPreset {
  return CLOUD_PRESETS.find((preset) => preset.key === key) ?? CLOUD_PRESETS[0]!;
}

export const DEFAULT_INPUT: RoiInput = {
  rigPriceUsd: 3000,
  powerWatts: 450,
  dailyHours: 8,
  electricityPerKwh: 0.15,
  dailyMTokens: 5,
  readShare: 0.7,
  apiReadPerMM: 3,
  apiWritePerMM: 15,
  horizonMonths: 60,
};

function numberField(value: unknown, max: number, fallback = 0): number {
  const raw = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return fallback;
  return clamp(raw, 0, max, fallback);
}

/** Negative, non-finite and out-of-range values are clamped before any math. */
export function normalizeRoiInput(raw: Partial<RoiInput> = {}): RoiInput {
  const horizon = clamp(numberField(raw.horizonMonths, 60, 60), 12, 60, 60);
  return {
    rigPriceUsd: numberField(raw.rigPriceUsd, CAP),
    powerWatts: numberField(raw.powerWatts, CAP),
    dailyHours: numberField(raw.dailyHours, 24),
    electricityPerKwh: numberField(raw.electricityPerKwh, CAP),
    dailyMTokens: numberField(raw.dailyMTokens, CAP),
    readShare: clamp(numberField(raw.readShare, 1), 0, 1, 0),
    apiReadPerMM: numberField(raw.apiReadPerMM, CAP),
    apiWritePerMM: numberField(raw.apiWritePerMM, CAP),
    horizonMonths: Math.round(horizon),
  };
}

export const URL_SCHEMA = {
  preset: { kind: "enum", default: "claude-sonnet", values: CLOUD_PRESETS.map((preset) => preset.key) },
  hardware: { kind: "string", default: "" },
  rigPriceUsd: { kind: "number", default: 3000, min: 0, max: CAP },
  powerWatts: { kind: "number", default: 450, min: 0, max: CAP },
  dailyHours: { kind: "number", default: 8, min: 0, max: 24 },
  electricityPerKwh: { kind: "number", default: 0.15, min: 0, max: CAP },
  dailyMTokens: { kind: "number", default: 5, min: 0, max: CAP },
  readShare: { kind: "number", default: 0.7, min: 0, max: 1 },
  apiReadPerMM: { kind: "number", default: 3, min: 0, max: CAP },
  apiWritePerMM: { kind: "number", default: 15, min: 0, max: CAP },
  horizonMonths: { kind: "number", default: 60, min: 12, max: 60 },
} as const satisfies UrlSchema;

export type RoiUrlState = RoiInput & { preset: PresetKey; hardware: string };

export function decodeRoiUrl(search: string): RoiUrlState {
  const state = decodeQuery(search, URL_SCHEMA);
  return {
    preset: normalizePresetKey(state.preset),
    hardware: typeof state.hardware === "string" ? state.hardware : "",
    ...normalizeRoiInput({
      rigPriceUsd: state.rigPriceUsd,
      powerWatts: state.powerWatts,
      dailyHours: state.dailyHours,
      electricityPerKwh: state.electricityPerKwh,
      dailyMTokens: state.dailyMTokens,
      readShare: state.readShare,
      apiReadPerMM: state.apiReadPerMM,
      apiWritePerMM: state.apiWritePerMM,
      horizonMonths: state.horizonMonths,
    }),
  };
}

export function encodeRoiUrl(state: Partial<RoiUrlState>): string {
  const params: UrlParams = {};
  for (const [key, spec] of Object.entries(URL_SCHEMA)) {
    const raw = state[key as keyof RoiUrlState];
    if (raw === undefined) continue;
    params[key] = spec.kind === "number"
      ? numberField(raw, spec.max ?? CAP, Number(spec.default))
      : raw;
  }
  return encodeQuery(params, URL_SCHEMA);
}

/** Presets win over URL price fields except for Custom, which keeps its own numbers. */
export function roiInputFromUrl(state: RoiUrlState): RoiInput {
  const preset = getPreset(state.preset);
  return normalizeRoiInput({
    ...state,
    apiReadPerMM: state.preset === "custom" ? state.apiReadPerMM : preset.apiReadPerMM,
    apiWritePerMM: state.preset === "custom" ? state.apiWritePerMM : preset.apiWritePerMM,
  });
}

export type RoiCurvePoint = {
  month: number; localCumulativeUsd: number; cloudCumulativeUsd: number; savingsUsd: number;
};

export type RoiBreakEven = { month: number | null; days: number | null; hint: string };

export type SensitivitySide = {
  factor: number; netSavings5YearUsd: number; breakEven: RoiBreakEven;
};

export type RoiResult = {
  input: RoiInput; curve: RoiCurvePoint[];
  breakEven: RoiBreakEven; breakEvenMonth: number | null; breakEvenDays: number | null;
  netSavings5YearUsd: number;
  sensitivity: { low: SensitivitySide; high: SensitivitySide; netSavings5YearRangeUsd: readonly [number, number] };
  monthlyLocalUsd: number; monthlyCloudUsd: number; blendedApiPerMM: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function findCrossingMonth(input: RoiInput, factor: number): number | null {
  const { localMonthly, cloudMonthly } = costs(input, factor);
  if (cloudMonthly <= localMonthly + 1e-12) return null;
  const exact = input.rigPriceUsd / (cloudMonthly - localMonthly);
  return Number.isFinite(exact) ? exact : null;
}

function costs(input: RoiInput, factor: number) {
  const blended = input.readShare * input.apiReadPerMM + (1 - input.readShare) * input.apiWritePerMM;
  const localMonthly = (input.powerWatts / 1000) * input.dailyHours * input.electricityPerKwh * DAYS_PER_MONTH;
  const cloudMonthly = input.dailyMTokens * factor * DAYS_PER_MONTH * blended;
  return { blended, localMonthly, cloudMonthly };
}

/** Linear interpolation of the first cloud-minus-local sign change in 0..horizon. */
function findBreakEven(input: RoiInput, factor: number): RoiBreakEven {
  const { localMonthly, cloudMonthly } = costs(input, factor);
  const diffs: number[] = [];
  for (let month = 0; month <= input.horizonMonths; month += 1) {
    diffs.push(cloudMonthly * month - (input.rigPriceUsd + localMonthly * month));
  }
  if (Math.abs(diffs[0]!) < 1e-9) {
    return { month: 0, days: 0, hint: `Already break-even at month 0 (no upfront cost).` };
  }
  if (cloudMonthly <= localMonthly + 1e-12) {
    return {
      month: null,
      days: null,
      hint: `No break-even: monthly API spend ${fmtUsd(cloudMonthly)} never exceeds local power ${fmtUsd(localMonthly)}.`,
    };
  }
  for (let month = 1; month < diffs.length; month += 1) {
    const previous = diffs[month - 1]!;
    const current = diffs[month]!;
    if (previous < 0 && current >= 0) {
      const exact = (month - 1) + -previous / (current - previous);
      const rounded = Math.round(exact * 1e6) / 1e6;
      return {
        month: rounded,
        days: Math.round(rounded * DAYS_PER_MONTH * 1e4) / 1e4,
        hint: `Break-even at month ${fmtDecimal(rounded, 2)} (~${fmtNum(rounded * DAYS_PER_MONTH)} days).`,
      };
    }
  }
  const exact = findCrossingMonth(input, factor);
  const suffix = exact == null ? "outside the selected horizon." : `crossing occurs near month ${fmtDecimal(exact, 1)}, beyond the horizon.`;
  return {
    month: null,
    days: null,
    hint: `No break-even within ${input.horizonMonths} months: ${suffix}`,
  };
}

function sensitivitySide(input: RoiInput, factor: number): SensitivitySide {
  const { localMonthly, cloudMonthly } = costs(input, factor);
  const savings = cloudMonthly * FIVE_YEARS - (input.rigPriceUsd + localMonthly * FIVE_YEARS);
  return { factor, netSavings5YearUsd: round2(savings), breakEven: findBreakEven(input, factor) };
}

/** Monthly cumulative curves, exact payback, fixed five-year savings and ±25% usage band. */
export function computeRoi(raw: RoiInput): RoiResult {
  const input = normalizeRoiInput(raw);
  const { blended, localMonthly, cloudMonthly } = costs(input, 1);
  const curve: RoiCurvePoint[] = [];
  for (let month = 0; month <= input.horizonMonths; month += 1) {
    const local = input.rigPriceUsd + localMonthly * month;
    const cloud = cloudMonthly * month;
    curve.push({
      month,
      localCumulativeUsd: round2(local),
      cloudCumulativeUsd: round2(cloud),
      savingsUsd: round2(cloud - local),
    });
  }
  const breakEven = findBreakEven(input, 1);
  const low = sensitivitySide(input, 0.75);
  const high = sensitivitySide(input, 1.25);
  const netSavings5YearUsd = round2(cloudMonthly * FIVE_YEARS - (input.rigPriceUsd + localMonthly * FIVE_YEARS));
  return {
    input,
    curve,
    breakEven,
    breakEvenMonth: breakEven.month,
    breakEvenDays: breakEven.days,
    netSavings5YearUsd,
    sensitivity: {
      low,
      high,
      netSavings5YearRangeUsd: [
        Math.min(low.netSavings5YearUsd, high.netSavings5YearUsd),
        Math.max(low.netSavings5YearUsd, high.netSavings5YearUsd),
      ],
    },
    monthlyLocalUsd: round2(localMonthly),
    monthlyCloudUsd: round2(cloudMonthly),
    blendedApiPerMM: round2(blended * 1000) / 1000,
  };
}
