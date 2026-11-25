/**
 * Pure catalogue engine for assembled local-AI PC blueprints.
 * Browser-safe: JSON import plus deterministic helpers, no filesystem access.
 * Relative JSON import so `node --test` resolves the module without a path alias.
 */
import catalog from "../data/pc-builds.json" with { type: "json" };

export type LocaleKey = "en" | "zh" | "ja" | "de" | "fr" | "es" | "pt";

export type BuildTier =
  | "budget"
  | "sweet-spot"
  | "dual-gpu"
  | "workstation"
  | "compact-unified"
  | "flagship";

export type BuildVendor = "nvidia" | "amd" | "apple";

export type BomRole =
  | "gpu"
  | "cpu"
  | "motherboard"
  | "ram"
  | "psu"
  | "cooling"
  | "chassis"
  | "storage"
  | "system";

export type BomPart = {
  role: BomRole;
  model: string;
  spec: string;
  priceUsd: number;
};

export type WorkloadFit = "full-vram" | "hybrid-offload" | "unified";

export type ModelWorkloadProfile = {
  model: string;
  quant: string;
  fit: WorkloadFit;
  estWriteTps: number;
  maxContextK: number;
};

export type LocaleRecord = Record<LocaleKey, string>;
export type LocaleListRecord = Record<LocaleKey, string[]>;
export type FaqItem = { q: string; a: string };
export type LocaleFaqRecord = Record<LocaleKey, FaqItem[]>;

export type PcBuild = {
  slug: string;
  tier: BuildTier;
  vendor: BuildVendor;
  formFactor: "atx-mid" | "atx-full" | "workstation-tower" | "compact-desktop" | "mini-pc";
  rigId: string | null;
  gpuSlug: string | null;
  gpuModel: string;
  gpuCount: number;
  totalVramGb: number;
  systemRamGb: number;
  memoryType: string;
  recommendedQuant: string;
  maxContextK: number;
  readingToks: number;
  writingToks: number;
  evidence: "measured" | "estimated";
  idleWatts: number;
  loadWatts: number;
  noiseDbA: number;
  totalPriceUsd: number;
  localCostPerMM: number | null;
  breakEvenDays: number | null;
  runtime: "CUDA" | "ROCm" | "Metal";
  osSupport: ("linux" | "windows" | "macos")[];
  heroImageId: string;
  imagePrompt: string;
  bom: BomPart[];
  workloads: ModelWorkloadProfile[];
  title: LocaleRecord;
  tagline: LocaleRecord;
  summary: LocaleRecord;
  bestFor: LocaleRecord;
  tradeoffs: LocaleRecord;
  assemblyNotes: LocaleListRecord;
  faq: LocaleFaqRecord;
};

export type BuildSortKey = "cost" | "speed" | "price" | "vram" | "power";

export type BuildFilterOpts = {
  tier?: string;
  vendor?: string;
  minVram?: number;
  maxPrice?: number;
  query?: string;
  locale?: string;
};

export const BUILD_TIERS: readonly BuildTier[] = [
  "budget",
  "sweet-spot",
  "dual-gpu",
  "workstation",
  "compact-unified",
  "flagship",
];

const LOCALES: readonly LocaleKey[] = ["en", "zh", "ja", "de", "fr", "es", "pt"];

const builds = catalog as PcBuild[];

function bySlug(a: PcBuild, b: PcBuild): number {
  return a.slug.localeCompare(b.slug);
}

function costKey(build: PcBuild): number {
  return build.localCostPerMM ?? Number.POSITIVE_INFINITY;
}

export function allBuilds(): PcBuild[] {
  return builds.slice();
}

export function getBuild(slug: string): PcBuild | undefined {
  return builds.find((build) => build.slug === slug);
}

export function buildPath(slug: string): string {
  return `/builds/${encodeURIComponent(slug)}`;
}

export function buildsForGpu(gpuSlug: string): PcBuild[] {
  return builds
    .filter((build) => build.gpuSlug === gpuSlug)
    .sort((a, b) => costKey(a) - costKey(b) || a.totalPriceUsd - b.totalPriceUsd || bySlug(a, b));
}

export function buildsForRig(rigId: string): PcBuild[] {
  return builds.filter((build) => build.rigId === rigId);
}

function isAll(value: string | undefined): boolean {
  return value == null || value === "" || value === "all";
}

export function filterBuilds(opts: BuildFilterOpts = {}): PcBuild[] {
  const tier = isAll(opts.tier) ? "" : opts.tier;
  const vendor = isAll(opts.vendor) ? "" : opts.vendor;
  const minVram = opts.minVram ?? 0;
  const maxPrice = opts.maxPrice ?? 0;
  const query = (opts.query ?? "").trim().toLowerCase();
  const locale = opts.locale ?? "en";

  return builds.filter((build) => {
    if (tier && build.tier !== tier) return false;
    if (vendor && build.vendor !== vendor) return false;
    if (minVram > 0 && build.totalVramGb < minVram) return false;
    if (maxPrice > 0 && build.totalPriceUsd > maxPrice) return false;
    if (!query) return true;
    const hay = [
      buildText(build.title, locale),
      buildText(build.tagline, locale),
      build.gpuModel,
      build.tier,
      build.vendor,
      build.slug,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(query);
  });
}

export function sortBuilds(list: PcBuild[], by: BuildSortKey = "cost"): PcBuild[] {
  const out = list.slice();
  out.sort((a, b) => {
    switch (by) {
      case "speed":
        return b.writingToks - a.writingToks || b.readingToks - a.readingToks || bySlug(a, b);
      case "price":
        return a.totalPriceUsd - b.totalPriceUsd || bySlug(a, b);
      case "vram":
        return b.totalVramGb - a.totalVramGb || a.totalPriceUsd - b.totalPriceUsd || bySlug(a, b);
      case "power":
        return a.loadWatts - b.loadWatts || bySlug(a, b);
      case "cost":
      default:
        return costKey(a) - costKey(b) || a.totalPriceUsd - b.totalPriceUsd || bySlug(a, b);
    }
  });
  return out;
}

/**
 * Closest cheaper tower, closest faster writer, closest higher-VRAM pool,
 * then same-tier peers by price. The subject is never returned.
 */
export function relatedBuilds(build: PcBuild, limit = 4): PcBuild[] {
  const cap = Math.max(0, limit);
  const others = builds.filter((item) => item.slug !== build.slug);
  const picked: PcBuild[] = [];
  const seen = new Set<string>();

  const take = (candidate: PcBuild | undefined) => {
    if (!candidate || seen.has(candidate.slug) || picked.length >= cap) return;
    seen.add(candidate.slug);
    picked.push(candidate);
  };

  take(
    others
      .filter((item) => item.totalPriceUsd < build.totalPriceUsd)
      .sort((a, b) => b.totalPriceUsd - a.totalPriceUsd || bySlug(a, b))[0],
  );
  take(
    others
      .filter((item) => item.writingToks > build.writingToks)
      .sort((a, b) => a.writingToks - b.writingToks || bySlug(a, b))[0],
  );
  take(
    others
      .filter((item) => item.totalVramGb > build.totalVramGb)
      .sort((a, b) => a.totalVramGb - b.totalVramGb || bySlug(a, b))[0],
  );

  const peers = others
    .filter((item) => item.tier === build.tier && !seen.has(item.slug))
    .sort((a, b) => a.totalPriceUsd - b.totalPriceUsd || bySlug(a, b));
  for (const peer of peers) take(peer);

  if (picked.length < cap) {
    const rest = others
      .filter((item) => !seen.has(item.slug))
      .sort(
        (a, b) =>
          Math.abs(a.totalPriceUsd - build.totalPriceUsd) - Math.abs(b.totalPriceUsd - build.totalPriceUsd) ||
          bySlug(a, b),
      );
    for (const item of rest) take(item);
  }

  return picked.slice(0, cap);
}

/** Annual energy cost. Active hours run at load; the rest of the day runs at idle. */
export function annualPowerCostUsd(
  loadWatts: number,
  idleWatts: number,
  activeHoursPerDay: number,
  kwhUsd = 0.15,
): number {
  const active = Math.min(24, Math.max(0, activeHoursPerDay));
  const idleHours = 24 - active;
  const wattHours = loadWatts * active + idleWatts * idleHours;
  const dollars = (wattHours / 1000) * 365 * kwhUsd;
  return Math.round(dollars * 100) / 100;
}

function localeKey(locale: string): LocaleKey {
  return (LOCALES as readonly string[]).includes(locale) ? (locale as LocaleKey) : "en";
}

export function buildText(record: Record<string, string>, locale: string): string {
  const key = localeKey(locale);
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value;
  return record.en ?? "";
}

export function buildListText(record: Record<string, string[]>, locale: string): string[] {
  const key = localeKey(locale);
  const value = record[key];
  if (Array.isArray(value) && value.length > 0) return value;
  return record.en ?? [];
}

export function buildFaq(build: PcBuild, locale: string): FaqItem[] {
  const key = localeKey(locale);
  const value = build.faq[key];
  if (Array.isArray(value) && value.length > 0) return value;
  return build.faq.en;
}
