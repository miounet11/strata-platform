/** Shared domain types for the Top 10 graphical tool suite (WP0 baseline). */

export type ToolSlug =
  | "vram-visualizer"
  | "gpu-compare"
  | "quant-explorer"
  | "install-wizard"
  | "benchmark-scatter"
  | "multi-gpu-planner"
  | "pc-builder"
  | "troubleshooter"
  | "roi-calculator"
  | "agent-studio";

export type ToolCategory = "memory" | "hardware" | "models" | "setup" | "economics" | "diagnostics";

export type ToolPriority = "P0" | "P1" | "P2";

export type ToolDefinition = {
  slug: ToolSlug;
  category: ToolCategory;
  priority: ToolPriority;
  order: number;
  /** Short, locale-neutral headline metric rendered in tool cards. */
  badgeMetric: string;
  /** Slugs of related tools; each must be a valid ToolSlug and exclude the tool itself. */
  relatedSlugs: ToolSlug[];
  /** Internal destination for the tool's primary call to action. */
  ctaHref: string;
  /** Locale-neutral search/filter keywords. */
  keywords: string[];
};

/**
 * Compact GPU projection produced on the server. Deliberately excludes the quant
 * matrix and other heavy fields so the full 3.4 MB catalogue is never shipped.
 */
export type ToolGpuRecord = {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  arch: string;
  vramGb: number;
  bandwidthGbs: number;
  readingTps: number;
  writingTps: number;
  evidence: "measured" | "estimated";
  cardPrice: number | null;
  powerWatts: number | null;
  support: "verified" | "supported" | "not-supported";
  runtime: "CUDA" | "ROCm" | "Metal";
  platforms: ("windows" | "linux" | "macos")[];
  driverMin: string;
  recommendedPsuWatts: number | null;
  coolingTier: "unified-silent" | "compact-air" | "high-airflow-tower" | "workstation-blower-or-aio";
  isUnifiedOrMobile: boolean;
  multiGpuViable: boolean;
  tpsPer100W: number | null;
  annualPower4hUsd: number;
};

/** Compact benchmark rig projection (all 29 machines from benchmarks.json). */
export type ToolRigRecord = {
  id: string;
  name: string;
  vendor: string;
  memoryGb: number;
  form: string;
  readingTps: number;
  writingTps: number;
  fit: string;
  powerWatts: number;
  cardPrice: number | null;
  rigTotal: number | null;
  capacityMTokDay: number | null;
  localCostPerMM: number | null;
  energyPerDay: number | null;
  apiValuePerDay: number | null;
  breakEvenDays: number | null;
  evidence: string;
  note: string;
};

/** Compact PC build projection (all 24 builds; localized title/tagline). */
export type ToolBuildRecord = {
  slug: string;
  tier: string;
  vendor: string;
  gpuModel: string;
  gpuCount: number;
  totalVramGb: number;
  systemRamGb: number;
  runtime: string;
  readingTps: number;
  writingTps: number;
  evidence: "measured" | "estimated";
  idleWatts: number;
  loadWatts: number;
  totalPriceUsd: number;
  localCostPerMM: number | null;
  breakEvenDays: number | null;
  title: string;
  tagline: string;
};

/** Compact quantization variant projection (all 6 packs from models.json). */
export type ToolVariantRecord = {
  id: string;
  name: string;
  description: string;
  ramGbMin: number;
  vramGbMin: number;
  downloadGb: number;
  outputTps5070: number;
  tags: string[];
};

/** Download summary projection; absolute URLs are server-provided only. */
export type ToolDownloadSummary = {
  syncedAt: string;
  siteUrl: string;
  engineTag: string;
  engineUrl: string;
  desktopTag: string;
  desktopUrl: string;
  assetCount: number;
  platforms: ("windows" | "linux" | "macos" | "other")[];
};

/** Single server-produced payload shared by all tools. */
export type ToolsBundle = {
  locale: string;
  gpus: ToolGpuRecord[];
  rigs: ToolRigRecord[];
  builds: ToolBuildRecord[];
  variants: ToolVariantRecord[];
  downloads: ToolDownloadSummary;
};
