/**
 * Pure, deterministic recommendation engine for the pc-builder tool.
 *
 * Prices, throughput and power figures are always taken from the shipped
 * `bundle.builds` catalogue. BOM category splits are explicitly labelled
 * estimates derived from those fields — no live shopping prices and no
 * invented thermal benchmarks are produced here.
 */
import type { ToolsBundle, ToolBuildRecord } from "../types.ts";
import { clamp } from "../format.ts";
import { decodeQuery, encodeQuery, type UrlParams, type UrlSchema } from "../url-state.ts";

export { decodeQuery, encodeQuery } from "../url-state.ts";

export const VENDOR_OPTIONS = ["all", "nvidia", "amd", "apple"] as const;
export const TIER_OPTIONS = [
  "all",
  "budget",
  "sweet-spot",
  "dual-gpu",
  "workstation",
  "compact-unified",
  "flagship",
] as const;

export type VendorFilter = (typeof VENDOR_OPTIONS)[number];
export type TierFilter = (typeof TIER_OPTIONS)[number];

export const BUDGET_MIN = 1000;
export const BUDGET_MAX = 30000;
export const VRAM_MAX = 1024;

export type BuilderFilters = {
  maxBudgetUsd: number;
  vendor: VendorFilter;
  minVramGb: number;
  tier: TierFilter;
};

export const DEFAULT_FILTERS: BuilderFilters = {
  maxBudgetUsd: BUDGET_MAX,
  vendor: "all",
  minVramGb: 0,
  tier: "all",
};

/** Standard retail PSU capacities used only to express a load ratio, never a price. */
export const STANDARD_PSU_WATTS = [450, 550, 650, 750, 850, 1000, 1300, 1600] as const;

export type BomCategory = "gpu" | "platform" | "powerCoolingChassis";

export const BOM_CATEGORIES: Record<BomCategory, { label: string; color: string }> = {
  gpu: { label: "GPU & VRAM", color: "#2563eb" },
  platform: { label: "System & memory platform", color: "#7c3aed" },
  powerCoolingChassis: { label: "PSU, cooling & chassis", color: "#0891b2" },
};

export type BomShare = {
  key: BomCategory;
  label: string;
  usd: number;
  pct: number;
};

export type BomEstimate = {
  totalUsd: number;
  /** Percentages are rounded to 0.1 and always sum to 100. */
  shares: BomShare[];
  estimated: true;
};

export type DonutSegment = BomShare & {
  startAngle: number;
  endAngle: number;
  angle: number;
};

export type PsuLoadTier = "tight" | "comfortable" | "ample" | "unknown";

export type PsuAssessment = {
  loadWatts: number;
  recommendedWatts: number;
  loadPct: number;
  headroomPct: number;
  tier: PsuLoadTier;
};

export type GaugeAngles = {
  loadAngle: number;
  headroomAngle: number;
};

export type Alternative = {
  slug: string;
  title: string;
  direction: "upgrade" | "downgrade";
  priceUsd: number;
  priceDeltaUsd: number;
  writingTps: number;
  reason: string;
};

export type Alternatives = {
  upgrade: Alternative | null;
  downgrade: Alternative | null;
};

export type Recommendation = {
  build: ToolBuildRecord;
  score: number;
  reasons: string[];
};

export type BuildDetail = {
  build: ToolBuildRecord;
  bom: BomEstimate;
  donut: DonutSegment[];
  psu: PsuAssessment;
  gauge: GaugeAngles;
  efficiencyTpsPer100W: number;
  alternatives: Alternatives;
};

function positive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pick<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeFilters(raw: Partial<BuilderFilters> = {}): BuilderFilters {
  return {
    maxBudgetUsd: clamp(
      Math.round(Number(raw.maxBudgetUsd)),
      BUDGET_MIN,
      BUDGET_MAX,
      DEFAULT_FILTERS.maxBudgetUsd,
    ),
    vendor: pick(raw.vendor, VENDOR_OPTIONS, DEFAULT_FILTERS.vendor),
    minVramGb: clamp(Math.round(Number(raw.minVramGb)), 0, VRAM_MAX, 0),
    tier: pick(raw.tier, TIER_OPTIONS, DEFAULT_FILTERS.tier),
  };
}

/** Stable, de-duplicated catalogue candidates matching every active filter. */
export function filterBuilds(
  builds: readonly ToolBuildRecord[],
  rawFilters: Partial<BuilderFilters> = {},
): ToolBuildRecord[] {
  const filters = normalizeFilters(rawFilters);
  const seen = new Set<string>();
  const out: ToolBuildRecord[] = [];
  for (const build of builds) {
    if (!build || typeof build.slug !== "string" || !build.slug || seen.has(build.slug)) continue;
    if (positive(build.totalPriceUsd) <= 0) continue;
    if (filters.maxBudgetUsd > 0 && build.totalPriceUsd > filters.maxBudgetUsd) continue;
    if (filters.vendor !== "all" && build.vendor !== filters.vendor) continue;
    if (filters.minVramGb > 0 && positive(build.totalVramGb) < filters.minVramGb) continue;
    if (filters.tier !== "all" && build.tier !== filters.tier) continue;
    seen.add(build.slug);
    out.push(build);
  }
  return out;
}

/**
 * Rank a pool against its own maxima, so scores stay meaningful for any
 * budget slice. Ties resolve by slug; the catalogue order never leaks in.
 */
export function rankBuilds(candidates: readonly ToolBuildRecord[]): Recommendation[] {
  if (candidates.length === 0) return [];
  const raw = candidates.map((build) => {
    const writingTps = positive(build.writingTps);
    const vramGb = positive(build.totalVramGb);
    const loadWatts = positive(build.loadWatts);
    const price = positive(build.totalPriceUsd);
    const localCostPerMM = positive(build.localCostPerMM);
    return {
      build,
      writingTps,
      vramGb,
      efficiency: loadWatts > 0 ? writingTps / loadWatts : 0,
      value: localCostPerMM > 0 ? 1 / localCostPerMM : price > 0 ? writingTps / price : 0,
      measured: build.evidence === "measured",
    };
  });
  const ceiling = raw.reduce(
    (max, row) => ({
      writingTps: Math.max(max.writingTps, row.writingTps),
      vramGb: Math.max(max.vramGb, row.vramGb),
      efficiency: Math.max(max.efficiency, row.efficiency),
      value: Math.max(max.value, row.value),
    }),
    { writingTps: 0, vramGb: 0, efficiency: 0, value: 0 },
  );
  const ratio = (value: number, max: number) => (max > 0 ? clamp(value / max, 0, 1, 0) : 0);

  return raw
    .map((row) => {
      const nWrite = ratio(row.writingTps, ceiling.writingTps);
      const nVram = ratio(row.vramGb, ceiling.vramGb);
      const nEff = ratio(row.efficiency, ceiling.efficiency);
      const nValue = ratio(row.value, ceiling.value);
      const score = round(
        clamp(
          (nWrite * 0.35 + nVram * 0.25 + nEff * 0.2 + nValue * 0.2 + (row.measured ? 0.04 : 0)) * 100,
          0,
          100,
          0,
        ),
        1,
      );
      const reasons: string[] = [];
      if (nWrite >= 0.8) reasons.push("Top generation throughput in this budget");
      if (nVram >= 0.8) reasons.push("Largest VRAM pool among matches");
      if (nEff >= 0.8) reasons.push("Best tokens per watt");
      if (nValue >= 0.8) reasons.push("Best cost per million tokens");
      if (row.measured) reasons.push("Catalogue-measured results");
      if (reasons.length === 0) reasons.push("Balanced price, VRAM and throughput");
      return { build: row.build, score, reasons: reasons.slice(0, 3) };
    })
    .sort((a, b) => b.score - a.score || a.build.slug.localeCompare(b.build.slug));
}

/** Filter then score; never returns more than `limit` recommendations. */
export function recommendBuilds(
  bundle: ToolsBundle,
  rawFilters: Partial<BuilderFilters> = {},
  limit = 3,
): Recommendation[] {
  const cap = clamp(Math.trunc(limit), 0, 10, 3);
  if (cap === 0) return [];
  return rankBuilds(filterBuilds(bundle.builds, rawFilters)).slice(0, cap);
}

/**
 * For impossible filter combinations, relax in a fixed order (tier → brand +
 * VRAM → budget) so the UI can show a useful fallback instead of a dead end.
 */
export function recommendWithFallback(
  bundle: ToolsBundle,
  rawFilters: Partial<BuilderFilters> = {},
  limit = 3,
): { recommendations: Recommendation[]; filters: BuilderFilters; relaxed: boolean } {
  const base = normalizeFilters(rawFilters);
  const attempts: BuilderFilters[] = [
    base,
    { ...base, tier: "all" },
    { ...base, tier: "all", vendor: "all", minVramGb: 0 },
    { ...DEFAULT_FILTERS },
  ];
  for (let index = 0; index < attempts.length; index += 1) {
    const filters = attempts[index]!;
    const recommendations = recommendBuilds(bundle, filters, limit);
    if (recommendations.length > 0) return { recommendations, filters, relaxed: index > 0 };
  }
  return { recommendations: [], filters: DEFAULT_FILTERS, relaxed: true };
}

const TIER_GPU_ANCHOR: Record<string, number> = {
  budget: 0.42,
  "sweet-spot": 0.5,
  "dual-gpu": 0.64,
  workstation: 0.55,
  "compact-unified": 0.34,
  flagship: 0.6,
};

/**
 * Split a build's catalogue total into three estimated groups. The fractions
 * are transparent heuristics over tier / GPU count / RAM; they are not
 * retailer quotes and are always flagged `estimated`.
 */
export function estimateBom(build: ToolBuildRecord): BomEstimate {
  const totalUsd = positive(build.totalPriceUsd);
  let gpu = TIER_GPU_ANCHOR[build.tier] ?? 0.5;
  gpu += (positive(build.gpuCount) - 1) * 0.05;
  if (build.vendor === "apple") gpu = Math.min(gpu, 0.4);
  gpu = clamp(gpu, 0.2, 0.7, 0.5);

  let platform = 0.28 + Math.min(0.12, positive(build.systemRamGb) / 1024);
  platform = clamp(platform, 0.15, 0.45, 0.28);

  const power = clamp(1 - gpu - platform, 0.08, 0.4, 0.2);
  const sum = gpu + platform + power;
  const fractions = [gpu / sum, platform / sum, power / sum];
  const keys: BomCategory[] = ["gpu", "platform", "powerCoolingChassis"];

  const rounded = fractions.map((fraction) => round(fraction * 100, 1));
  rounded[2] = round(100 - rounded[0]! - rounded[1]!, 1);

  const shares: BomShare[] = keys.map((key, index) => ({
    key,
    label: BOM_CATEGORIES[key].label,
    usd: round(totalUsd * fractions[index]!, 2),
    pct: rounded[index]!,
  }));
  return { totalUsd, shares, estimated: true };
}

/** Donut wedges in catalogue order; sweeps always total exactly 360 degrees. */
export function computeDonutSegments(shares: readonly BomShare[]): DonutSegment[] {
  const usable = shares.filter((share) => positive(share.usd) > 0);
  const total = usable.reduce((sum, share) => sum + positive(share.usd), 0);
  if (total <= 0) return [];
  let cursor = 0;
  return usable.map((share, index) => {
    const start = cursor;
    const angle = index === usable.length - 1 ? 360 - start : round((positive(share.usd) / total) * 360, 3);
    cursor = start + angle;
    return {
      ...share,
      startAngle: round(-90 + start, 3),
      endAngle: round(-90 + cursor, 3),
      angle: round(angle, 3),
    };
  });
}

/** Smallest standard PSU covering load / 0.65, plus the resulting headroom. */
export function assessPsu(loadWatts: number): PsuAssessment {
  const load = positive(loadWatts);
  if (load === 0) {
    return { loadWatts: 0, recommendedWatts: 0, loadPct: 0, headroomPct: 0, tier: "unknown" };
  }
  const target = load / 0.65;
  let recommended = STANDARD_PSU_WATTS.find((watts) => watts >= target);
  if (recommended == null) recommended = Math.ceil(target / 100) * 100;
  const loadPct = round(clamp((load / recommended) * 100, 0, 100, 0), 1);
  const headroomPct = round(100 - loadPct, 1);
  const tier: PsuLoadTier = headroomPct >= 35 ? "ample" : headroomPct >= 20 ? "comfortable" : "tight";
  return { loadWatts: load, recommendedWatts: recommended, loadPct, headroomPct, tier };
}

/** Half-circle gauge split; the two angles always total 180 degrees. */
export function computeGaugeAngles(loadPct: number): GaugeAngles {
  const loadAngle = round(clamp(Number(loadPct), 0, 100, 0) * 1.8, 3);
  return { loadAngle, headroomAngle: round(180 - loadAngle, 3) };
}

export function efficiencyTpsPer100W(build: ToolBuildRecord): number {
  const watts = positive(build.loadWatts);
  const tps = positive(build.writingTps);
  return watts > 0 ? round((tps / watts) * 100, 2) : 0;
}

/** Nearest cheaper and nearest pricier catalogue entries, never invented. */
export function findAlternatives(
  build: ToolBuildRecord,
  builds: readonly ToolBuildRecord[],
  limit = 1,
): Alternatives {
  const cap = clamp(Math.trunc(limit), 0, 3, 1);
  const price = positive(build.totalPriceUsd);
  const others = builds.filter(
    (other) =>
      other &&
      other.slug !== build.slug &&
      typeof other.slug === "string" &&
      positive(other.totalPriceUsd) > 0,
  );
  const toAlternative = (other: ToolBuildRecord, direction: "upgrade" | "downgrade"): Alternative => {
    const otherPrice = positive(other.totalPriceUsd);
    const delta = round(otherPrice - price, 2);
    return {
      slug: other.slug,
      title: typeof other.title === "string" && other.title ? other.title : other.gpuModel,
      direction,
      priceUsd: otherPrice,
      priceDeltaUsd: delta,
      writingTps: positive(other.writingTps),
      reason: `${other.tier} · ${positive(other.totalVramGb)} GB VRAM · ${direction === "upgrade" ? "+" : ""}${round(delta)} USD vs current`,
    };
  };
  const cheaper = others
    .filter((other) => positive(other.totalPriceUsd) < price)
    .sort((a, b) => positive(b.totalPriceUsd) - positive(a.totalPriceUsd) || a.slug.localeCompare(b.slug))
    .slice(0, cap)
    .map((other) => toAlternative(other, "downgrade"));
  const pricier = others
    .filter((other) => positive(other.totalPriceUsd) > price)
    .sort((a, b) => positive(a.totalPriceUsd) - positive(b.totalPriceUsd) || a.slug.localeCompare(b.slug))
    .slice(0, cap)
    .map((other) => toAlternative(other, "upgrade"));
  return { downgrade: cheaper[0] ?? null, upgrade: pricier[0] ?? null };
}

export function buildDetail(build: ToolBuildRecord, builds: readonly ToolBuildRecord[]): BuildDetail {
  const bom = estimateBom(build);
  const psu = assessPsu(build.loadWatts);
  return {
    build,
    bom,
    donut: computeDonutSegments(bom.shares),
    psu,
    gauge: computeGaugeAngles(psu.loadPct),
    efficiencyTpsPer100W: efficiencyTpsPer100W(build),
    alternatives: findAlternatives(build, builds),
  };
}

/** Read/write throughput bars normalized against the strongest build in the set. */
export function performanceBars(
  builds: readonly ToolBuildRecord[],
): Array<{ build: ToolBuildRecord; readPct: number; writePct: number }> {
  const maxRead = builds.reduce((max, build) => Math.max(max, positive(build.readingTps)), 0);
  const maxWrite = builds.reduce((max, build) => Math.max(max, positive(build.writingTps)), 0);
  return builds.map((build) => ({
    build,
    readPct: round(maxRead > 0 ? clamp((positive(build.readingTps) / maxRead) * 100, 0, 100, 0) : 0, 1),
    writePct: round(maxWrite > 0 ? clamp((positive(build.writingTps) / maxWrite) * 100, 0, 100, 0) : 0, 1),
  }));
}

/** SVG helper: point on a circle. `-90°` = 12 o'clock, `0°` = 3 o'clock (screen coords). */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: round(cx + radius * Math.cos(radians), 3),
    y: round(cy + radius * Math.sin(radians), 3),
  };
}

/** SVG arc path between two angles in the same screen-coordinate convention. */
export function arcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const from = polarPoint(cx, cy, radius, start);
  const to = polarPoint(cx, cy, radius, end);
  const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

/** URL query schema for the shareable pc-builder state. */
export const URL_SCHEMA: UrlSchema = {
  budget: { kind: "number", default: BUDGET_MAX, min: BUDGET_MIN, max: BUDGET_MAX, alias: "budget" },
  vendor: { kind: "enum", default: "all", values: VENDOR_OPTIONS, alias: "vendor" },
  vram: { kind: "number", default: 0, min: 0, max: VRAM_MAX, alias: "vram" },
  tier: { kind: "enum", default: "all", values: TIER_OPTIONS, alias: "tier" },
  pick: { kind: "string", default: "", alias: "pick" },
} as const;

export type BuilderUrlState = BuilderFilters & { pick: string };

/** Decode with per-key fallbacks; malformed budgets, enums and pick values are ignored. */
export function decodeBuilderUrl(search: string): BuilderUrlState {
  const state = decodeQuery(search, URL_SCHEMA);
  return {
    maxBudgetUsd: clamp(Number(state.budget), BUDGET_MIN, BUDGET_MAX, BUDGET_MAX),
    vendor: pick(state.vendor, VENDOR_OPTIONS, "all"),
    minVramGb: clamp(Number(state.vram), 0, VRAM_MAX, 0),
    tier: pick(state.tier, TIER_OPTIONS, "all"),
    pick: typeof state.pick === "string" ? state.pick : "",
  };
}

/** Encode only non-default values with a stable key order. */
export function encodeBuilderUrl(filters: Partial<BuilderFilters>, pick = ""): string {
  const normalized = normalizeFilters(filters);
  const params: UrlParams = {
    budget: normalized.maxBudgetUsd,
    vendor: normalized.vendor,
    vram: normalized.minVramGb,
    tier: normalized.tier,
    pick: typeof pick === "string" ? pick : "",
  };
  return encodeQuery(params, URL_SCHEMA);
}
