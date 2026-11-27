/** Deterministic, browser-free comparison engine for the gpu-compare tool. */

import { clamp } from "../format.ts";
import type { ToolGpuRecord } from "../types.ts";
import { decodeQuery, encodeQuery } from "../url-state.ts";

export { decodeQuery, encodeQuery } from "../url-state.ts";

/** Canonical axis order, clockwise from the top of the radar chart. */
export const METRIC_KEYS = [
  "writingTps",
  "readingTps",
  "vramGb",
  "bandwidthGbs",
  "efficiency",
  "valueScore",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];
export type MetricValues = Record<MetricKey, number>;
export type MissingFlags = { efficiency: boolean; valueScore: boolean };

export type RadarPoint = { x: number; y: number };
export type RadarVertex = RadarPoint & { metric: MetricKey; value: number };

export type QuantRecommendation = {
  id: string;
  name: string;
  fit: "full-vram" | "hybrid-offload";
  estWriteTps: number;
};

export type GpuComparisonEntry = {
  gpu: ToolGpuRecord;
  raw: MetricValues;
  normalized: MetricValues;
  missing: MissingFlags;
  bestQuant: QuantRecommendation | null;
  winners: MetricKey[];
};

export type GpuComparisonResult = {
  entries: GpuComparisonEntry[];
  /** Winning slugs per metric, sorted by slug so ties are input-order independent. */
  winners: Record<MetricKey, string[]>;
  /** Largest raw value per metric inside the selected group. */
  maxRaw: MetricValues;
};

type QuantSeed = {
  id: string;
  name: string;
  vramGbMin: number;
  ramGbMin: number;
  downloadGb: number;
  speedFactor: number;
};

/** Mirrors the catalogue quant packs; richest first so ties resolve predictably. */
const QUANT_SEEDS: readonly QuantSeed[] = [
  { id: "ud-iq4_xs", name: "UD-IQ4_XS", vramGbMin: 12, ramGbMin: 80, downloadGb: 94, speedFactor: 45 / 94 },
  { id: "iq3_s", name: "IQ3_S", vramGbMin: 12, ramGbMin: 64, downloadGb: 76, speedFactor: 53 / 94 },
  { id: "iq3_xxs", name: "IQ3_XXS", vramGbMin: 12, ramGbMin: 64, downloadGb: 74, speedFactor: 62 / 94 },
  { id: "iq2_xs", name: "IQ2_XS", vramGbMin: 12, ramGbMin: 64, downloadGb: 72, speedFactor: 79 / 94 },
  { id: "q2_0", name: "Q2_0", vramGbMin: 12, ramGbMin: 48, downloadGb: 70, speedFactor: 1 },
  { id: "coder", name: "Coder", vramGbMin: 12, ramGbMin: 32, downloadGb: 68, speedFactor: 55 / 94 },
];

function positive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

export function zeroMetrics(): MetricValues {
  return {
    writingTps: 0,
    readingTps: 0,
    vramGb: 0,
    bandwidthGbs: 0,
    efficiency: 0,
    valueScore: 0,
  };
}

/** Raw (un-normalized) six-axis values with explicit flags for absent inputs. */
export function rawMetrics(gpu: ToolGpuRecord): { values: MetricValues; missing: MissingFlags } {
  const writing = positive(gpu.writingTps);
  const watts = positive(gpu.powerWatts);
  const price = positive(gpu.cardPrice);
  const missing: MissingFlags = { efficiency: watts === 0, valueScore: price === 0 };
  return {
    values: {
      writingTps: writing,
      readingTps: positive(gpu.readingTps),
      vramGb: positive(gpu.vramGb),
      bandwidthGbs: positive(gpu.bandwidthGbs),
      efficiency: missing.efficiency ? 0 : round((writing / watts) * 100),
      valueScore: missing.valueScore ? 0 : round(writing / price),
    },
    missing,
  };
}

/** Scale raw values into 0–100 against the selected group's per-axis maximum. */
export function normalizeMetrics(maxRaw: MetricValues, raw: MetricValues): MetricValues {
  const out = zeroMetrics();
  for (const key of METRIC_KEYS) {
    const ceiling = maxRaw[key];
    out[key] =
      typeof ceiling === "number" && Number.isFinite(ceiling) && ceiling > 0
        ? round(clamp((positive(raw[key]) / ceiling) * 100, 0, 100))
        : 0;
  }
  return out;
}

/** Richest quant that fits cleanly in VRAM; falls back to the leanest viable pack. */
export function recommendQuant(gpu: ToolGpuRecord): QuantRecommendation | null {
  const vram = positive(gpu.vramGb);
  const writing = positive(gpu.writingTps);
  const apple = gpu.vendor === "apple";
  let best: { seed: QuantSeed; fit: QuantRecommendation["fit"] } | null = null;
  for (const seed of QUANT_SEEDS) {
    const floor = apple ? seed.ramGbMin : seed.vramGbMin;
    if (vram < floor) continue;
    const fits = apple ? vram >= floor : vram >= seed.downloadGb + 4;
    if (best == null || fits) best = { seed, fit: fits ? "full-vram" : "hybrid-offload" };
  }
  if (!best) return null;
  return {
    id: best.seed.id,
    name: best.seed.name,
    fit: best.fit,
    estWriteTps: round(writing * best.seed.speedFactor),
  };
}

function emptyWinners(): Record<MetricKey, string[]> {
  const out = {} as Record<MetricKey, string[]>;
  for (const key of METRIC_KEYS) out[key] = [];
  return out;
}

/**
 * Compare 2–4 distinct GPUs. Cards are sorted by slug so results never depend
 * on input order; fewer than two cards yields an empty result.
 */
export function compareGpus(gpus: readonly ToolGpuRecord[]): GpuComparisonResult {
  // Resolve conflicting duplicates canonically so input order never changes the result.
  const seen = new Map<string, ToolGpuRecord>();
  for (const gpu of gpus) {
    if (!gpu || typeof gpu.slug !== "string" || !gpu.slug) continue;
    const previous = seen.get(gpu.slug);
    if (!previous || positive(gpu.writingTps) < positive(previous.writingTps)) {
      seen.set(gpu.slug, gpu);
    }
  }
  const selected = [...seen.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .slice(0, 4);
  if (selected.length < 2) return { entries: [], winners: emptyWinners(), maxRaw: zeroMetrics() };

  const measured = selected.map(rawMetrics);
  const maxRaw = zeroMetrics();
  for (const key of METRIC_KEYS) {
    for (const { values } of measured) maxRaw[key] = Math.max(maxRaw[key], values[key]);
  }

  const winners = emptyWinners();
  for (const key of METRIC_KEYS) {
    const eligible = measured.flatMap((item, index) => {
      const gpu = selected[index];
      if (!gpu) return [];
      if (key === "efficiency" && item.missing.efficiency) return [];
      if (key === "valueScore" && item.missing.valueScore) return [];
      return [{ slug: gpu.slug, value: item.values[key] }];
    });
    const ceiling = eligible.reduce((best, item) => Math.max(best, item.value), 0);
    if (ceiling <= 0) continue;
    winners[key] = eligible
      .filter((item) => item.value === ceiling)
      .map((item) => item.slug)
      .sort((a, b) => a.localeCompare(b));
  }

  const entries: GpuComparisonEntry[] = selected.map((gpu, index) => ({
    gpu,
    raw: measured[index]?.values ?? zeroMetrics(),
    normalized: normalizeMetrics(maxRaw, measured[index]?.values ?? zeroMetrics()),
    missing: measured[index]?.missing ?? { efficiency: true, valueScore: true },
    bestQuant: recommendQuant(gpu),
    winners: METRIC_KEYS.filter((key) => winners[key].includes(gpu.slug)),
  }));
  return { entries, winners, maxRaw };
}

/** Six clockwise vertices (top → upper-right → … → upper-left) at the given radius. */
export function computeRadarVertices(
  values: Partial<MetricValues> | readonly number[],
  center: RadarPoint = { x: 200, y: 200 },
  radius = 140,
): RadarVertex[] {
  const safeRadius = positive(radius);
  const safeCenter = {
    x: Number.isFinite(center.x) ? center.x : 0,
    y: Number.isFinite(center.y) ? center.y : 0,
  };
  const valueOf = (key: MetricKey, index: number): number => {
    const raw = Array.isArray(values) ? values[index] : (values as Partial<MetricValues>)[key];
    if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
    return clamp(raw, 0, 100);
  };
  return METRIC_KEYS.map((key, index) => {
    const angle = ((-90 + index * 60) * Math.PI) / 180;
    const distance = (safeRadius * valueOf(key, index)) / 100;
    const x = safeCenter.x + distance * Math.cos(angle);
    const y = safeCenter.y + distance * Math.sin(angle);
    return {
      metric: key,
      value: valueOf(key, index),
      x: round(Math.abs(x) < 1e-9 ? 0 : x),
      y: round(Math.abs(y) < 1e-9 ? 0 : y),
    };
  });
}

/** SVG-friendly `x,y x,y …` point list. */
export function radarPolygonPoints(vertices: readonly RadarPoint[]): string {
  return vertices.map((point) => `${round(point.x)},${round(point.y)}`).join(" ");
}

/** URL query state: a single comma-separated `gpus` parameter. */
export const URL_SCHEMA = { gpus: { kind: "string", default: "" } } as const;

export function sanitizeGpuSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length === 4) break;
  }
  return out;
}

export function parseGpuSlugs(search: string): string[] {
  return sanitizeGpuSlugs(decodeQuery(search, URL_SCHEMA).gpus.split(","));
}

export function serializeGpuSlugs(slugs: readonly string[]): string {
  const valid = sanitizeGpuSlugs(slugs);
  if (valid.length < 2) return "";
  return encodeQuery({ gpus: valid.join(",") }, URL_SCHEMA);
}
