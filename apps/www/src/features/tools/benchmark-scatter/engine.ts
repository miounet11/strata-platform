/**
 * Pure, deterministic 2D Pareto engine for the benchmark-scatter tool.
 *
 * It only reads the server-produced rig projection and emits plain values;
 * no React, DOM, clock or random state is used. The same module runs in the
 * browser, during SSR and inside `node --test`.
 */
import type { ToolRigRecord } from "../types.ts";
import { fmtDecimal, fmtNum, fmtTps, fmtUsd, fmtWatts } from "../format.ts";
import { decodeQuery, encodeQuery, type UrlParams, type UrlSchema } from "../url-state.ts";

/** Scalar fields on a benchmark rig that can be plotted on an axis. */
export type AxisKey =
  | "rigTotal"
  | "writingToks"
  | "readingToks"
  | "powerWatts"
  | "localCostPerMM"
  | "breakEvenDays"
  | "memoryGb";

export type AxisDirection = "max" | "min";

export type AxisMeta = {
  key: AxisKey;
  label: string;
  unit: string;
  direction: AxisDirection;
  /** Locale-neutral, deterministic value formatter shared by SVG labels and cards. */
  format: (value: number | null | undefined) => string;
};

export const AXIS_KEYS: readonly AxisKey[] = [
  "rigTotal",
  "writingToks",
  "readingToks",
  "powerWatts",
  "localCostPerMM",
  "breakEvenDays",
  "memoryGb",
] as const;

export const AXES: Readonly<Record<AxisKey, AxisMeta>> = {
  rigTotal: { key: "rigTotal", label: "Build cost", unit: "$", direction: "max", format: (v) => fmtUsd(v, 0) },
  writingToks: { key: "writingToks", label: "Writing speed", unit: "tok/s", direction: "max", format: (v) => fmtTps(v, 1) },
  readingToks: { key: "readingToks", label: "Reading speed", unit: "tok/s", direction: "max", format: (v) => fmtTps(v, 0) },
  powerWatts: { key: "powerWatts", label: "Power draw", unit: "W", direction: "min", format: (v) => fmtWatts(v, 0) },
  localCostPerMM: { key: "localCostPerMM", label: "Local cost / 1M", unit: "$/1M", direction: "min", format: (v) => `$${fmtDecimal(v, 3)}` },
  breakEvenDays: { key: "breakEvenDays", label: "Break-even", unit: "days", direction: "min", format: (v) => `${fmtNum(v)} d` },
  memoryGb: { key: "memoryGb", label: "Memory", unit: "GB", direction: "max", format: (v) => `${fmtNum(v)} GB` },
};

/** Sentinel used when no vendor filter is applied. */
export const ALL_VENDORS = "all";

/**
 * The rig projection uses `writingTps`/`readingTps` while the public axis keys
 * are named after the source measurements (`writingToks`/`readingToks`). */
const AXIS_FIELD: Record<AxisKey, keyof ToolRigRecord> = {
  rigTotal: "rigTotal",
  writingToks: "writingTps",
  readingToks: "readingTps",
  powerWatts: "powerWatts",
  localCostPerMM: "localCostPerMM",
  breakEvenDays: "breakEvenDays",
  memoryGb: "memoryGb",
};

/** Raw axis projection; null stays null so callers can decide how to treat it. */
export function axisValue(rig: ToolRigRecord, axis: AxisKey): number | null {
  const value = rig[AXIS_FIELD[axis] as keyof ToolRigRecord];
  return typeof value === "number" ? value : null;
}

/** A plotted axis requires a finite, strictly positive measurement. */
export function isUsableValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Unknown URL values collapse to the first axis; never trust raw query text. */
export function normalizeAxisKey(value: unknown, fallback: AxisKey = "rigTotal"): AxisKey {
  return typeof value === "string" && (AXIS_KEYS as readonly string[]).includes(value)
    ? (value as AxisKey)
    : fallback;
}

export function normalizeVendor(value: unknown): string {
  const vendor = typeof value === "string" ? value.trim() : "";
  return vendor === "" || vendor.toLowerCase() === ALL_VENDORS ? ALL_VENDORS : vendor;
}

/** Smaller rank == better on this axis; makes frontier ordering direction-agnostic. */
export function axisPreference(axis: AxisKey, value: number): number {
  return AXES[axis].direction === "min" ? value : -value;
}

/** Sorted, de-duplicated vendor list for the filter control. */
export function listVendors(rigs: readonly ToolRigRecord[]): string[] {
  return [...new Set(rigs.map((rig) => String(rig.vendor ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export type ScatterOptions = {
  x: AxisKey;
  y: AxisKey;
  vendor?: string;
};

export type ScatterPoint = {
  rig: ToolRigRecord;
  id: string;
  name: string;
  vendor: string;
  x: number;
  y: number;
  /** True when no other valid point strictly dominates this one. */
  pareto: boolean;
  /** Ids of every valid point that dominates this one, sorted deterministically. */
  dominatedBy: string[];
};

export type ScatterResult = {
  points: ScatterPoint[];
  /** Frontier points ordered from best to worst along the X axis. */
  frontier: ScatterPoint[];
  /** Vendor-filtered rigs discarded because either plotted axis was missing/invalid. */
  excludedCount: number;
  totalCount: number;
  validCount: number;
  vendors: string[];
  vendor: string;
  x: AxisKey;
  y: AxisKey;
};

export type Coordinate = { x: number; y: number };

/**
 * Strict Pareto dominance on the two active axes: no worse on either axis and
 * strictly better on at least one. Identical coordinates never dominate each other.
 */
export function dominates(a: Coordinate, b: Coordinate, xAxis: AxisKey, yAxis: AxisKey): boolean {
  const xa = axisPreference(xAxis, a.x);
  const xb = axisPreference(xAxis, b.x);
  const ya = axisPreference(yAxis, a.y);
  const yb = axisPreference(yAxis, b.y);
  if (!Number.isFinite(xa) || !Number.isFinite(xb) || !Number.isFinite(ya) || !Number.isFinite(yb)) return false;
  return (xa <= xb && ya <= yb) && (xa < xb || ya < yb);
}

function comparePoints(a: ScatterPoint, b: ScatterPoint): number {
  return (
    a.x - b.x ||
    a.y - b.y ||
    a.id.localeCompare(b.id) ||
    a.name.localeCompare(b.name)
  );
}

/** Deterministic best-to-worst ordering along X, independent of input order. */
function compareFrontier(a: ScatterPoint, b: ScatterPoint, xAxis: AxisKey): number {
  return (
    axisPreference(xAxis, a.x) - axisPreference(xAxis, b.x) ||
    a.id.localeCompare(b.id) ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Filter, validate and compute the Pareto frontier for one view configuration.
 * Output ordering is stable even if the caller shuffles the rig array.
 */
export function buildScatter(rigs: readonly ToolRigRecord[], options: ScatterOptions): ScatterResult {
  const x = normalizeAxisKey(options.x);
  const y = normalizeAxisKey(options.y);
  const vendor = normalizeVendor(options.vendor);
  const vendors = listVendors(rigs);
  const vendorRigs = vendor === ALL_VENDORS
    ? [...rigs]
    : rigs.filter((rig) => String(rig.vendor ?? "").trim() === vendor);

  const points: ScatterPoint[] = [];
  let excludedCount = 0;
  for (const rig of vendorRigs) {
    const xValue = axisValue(rig, x);
    const yValue = axisValue(rig, y);
    if (!isUsableValue(xValue) || !isUsableValue(yValue)) {
      excludedCount += 1;
      continue;
    }
    points.push({
      rig,
      id: String(rig.id ?? ""),
      name: String(rig.name ?? rig.id ?? ""),
      vendor: String(rig.vendor ?? ""),
      x: xValue,
      y: yValue,
      pareto: true,
      dominatedBy: [],
    });
  }
  points.sort(comparePoints);

  for (const point of points) {
    for (const other of points) {
      if (other === point) continue;
      if (dominates(other, point, x, y)) point.dominatedBy.push(other.id);
    }
    point.dominatedBy.sort();
    point.pareto = point.dominatedBy.length === 0;
  }

  const frontier = points.filter((point) => point.pareto).sort((a, b) => compareFrontier(a, b, x));
  return {
    points,
    frontier,
    excludedCount,
    totalCount: vendorRigs.length,
    validCount: points.length,
    vendors,
    vendor,
    x,
    y,
  };
}

/** URL query schema; only these four keys are ever written to the address bar. */
export const URL_SCHEMA = {
  x: { kind: "enum", default: "rigTotal", values: AXIS_KEYS },
  y: { kind: "enum", default: "writingToks", values: AXIS_KEYS },
  vendor: { kind: "string", default: ALL_VENDORS },
  rig: { kind: "string", default: "" },
} as const satisfies UrlSchema;

export type ScatterUrlState = {
  x: AxisKey;
  y: AxisKey;
  vendor: string;
  rig: string;
};

export function decodeScatterUrl(search: string): ScatterUrlState {
  const state = decodeQuery(search, URL_SCHEMA);
  return {
    x: normalizeAxisKey(state.x, "rigTotal"),
    y: normalizeAxisKey(state.y, "writingToks"),
    vendor: normalizeVendor(state.vendor),
    rig: typeof state.rig === "string" ? state.rig : "",
  };
}

export function encodeScatterUrl(state: Partial<ScatterUrlState>): string {
  const params: UrlParams = {
    x: normalizeAxisKey(state.x, "rigTotal"),
    y: normalizeAxisKey(state.y, "writingToks"),
    vendor: normalizeVendor(state.vendor),
    rig: typeof state.rig === "string" ? state.rig : "",
  };
  return encodeQuery(params, URL_SCHEMA);
}

export type PresetKey = "value" | "power" | "payback";

export type ScatterPreset = {
  key: PresetKey;
  label: string;
  x: AxisKey;
  y: AxisKey;
};

/** Classic pairings; a preset is just a pair of axis values in the URL. */
export const SCATTER_PRESETS: readonly ScatterPreset[] = [
  { key: "value", label: "性价比前沿", x: "rigTotal", y: "writingToks" },
  { key: "power", label: "功耗效率前沿", x: "powerWatts", y: "writingToks" },
  { key: "payback", label: "回本速度前沿", x: "rigTotal", y: "breakEvenDays" },
] as const;

export function presetFor(x: AxisKey, y: AxisKey): PresetKey | null {
  return SCATTER_PRESETS.find((preset) => preset.x === x && preset.y === y)?.key ?? null;
}
