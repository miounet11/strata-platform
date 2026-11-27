/** Server-side projections that turn the site catalogues into one compact tools payload. */
import downloadsData from "@/data/downloads.json";
import modelsData from "@/data/models.json";
import { getRigs } from "@/lib/benchmarks";
import { allBuilds, buildText } from "@/lib/builds";
import { allGpus, type Gpu } from "@/lib/gpus";
import { gpuHardwareProfile as computeGpuProfile } from "@/lib/gpu-profiles";
import type {
  ToolBuildRecord,
  ToolDownloadSummary,
  ToolGpuRecord,
  ToolRigRecord,
  ToolSlug,
  ToolVariantRecord,
  ToolsBundle,
} from "@/features/tools/types";

const MAX_GPUS = 80;
const DEV_VENDORS = new Set<string>(["nvidia", "amd", "apple", "intel"]);

function evidenceRank(gpu: Gpu): number {
  return gpu.evidence === "measured" ? 0 : 1;
}

function compareGpu(a: Gpu, b: Gpu): number {
  return (
    evidenceRank(a) - evidenceRank(b) ||
    b.vramGb - a.vramGb ||
    b.year - a.year ||
    a.slug.localeCompare(b.slug)
  );
}

/** Verified cards are always kept, then runnable high-VRAM cards fill up to the cap. */
function selectGpus(): Gpu[] {
  const candidates = allGpus().filter(
    (gpu) =>
      gpu.support === "verified" ||
      (gpu.runnable === true && gpu.vramGb >= 8 && DEV_VENDORS.has(gpu.vendor)),
  );
  candidates.sort(compareGpu);
  const selected = candidates.slice(0, MAX_GPUS);
  const selectedIds = new Set(selected.map((gpu) => gpu.id));
  const missing = candidates.filter((gpu) => gpu.support === "verified" && !selectedIds.has(gpu.id));
  if (missing.length === 0) return selected;
  const kept = selected.filter((gpu) => gpu.support !== "verified").slice(0, MAX_GPUS - missing.length);
  return [...kept, ...selected.filter((gpu) => gpu.support === "verified"), ...missing];
}

function toGpuRecord(gpu: Gpu): ToolGpuRecord {
  const profile = computeGpuProfile(gpu);
  return {
    id: gpu.id,
    slug: gpu.slug,
    name: gpu.name,
    vendor: gpu.vendor,
    arch: gpu.arch,
    vramGb: gpu.vramGb,
    bandwidthGbs: gpu.bandwidthGbs,
    readingTps: gpu.readingTps,
    writingTps: gpu.writingTps,
    evidence: gpu.evidence,
    cardPrice: gpu.cardPrice,
    powerWatts: gpu.powerWatts,
    support: gpu.support,
    runtime: gpu.runtime,
    platforms: gpu.platforms,
    driverMin: gpu.driverMin,
    recommendedPsuWatts: profile.recommendedPsuWatts,
    coolingTier: profile.coolingTier,
    isUnifiedOrMobile: profile.isUnifiedOrMobile,
    multiGpuViable: profile.multiGpuViable,
    tpsPer100W: profile.tpsPer100W,
    annualPower4hUsd: profile.annualPower4hUsd,
  };
}

function toRigRecord(rig: (ReturnType<typeof getRigs>)[number]): ToolRigRecord {
  return {
    id: rig.id,
    name: rig.name,
    vendor: rig.vendor,
    memoryGb: rig.memory,
    form: rig.form,
    readingTps: rig.readingToks,
    writingTps: rig.writingToks,
    fit: rig.fit,
    powerWatts: rig.powerWatts,
    cardPrice: rig.cardPrice,
    rigTotal: rig.rigTotal,
    capacityMTokDay: rig.capacityMTokDay,
    localCostPerMM: rig.localCostPerMM,
    energyPerDay: rig.energyPerDay,
    apiValuePerDay: rig.apiValuePerDay,
    breakEvenDays: rig.breakEvenDays,
    evidence: rig.evidence,
    note: rig.note,
  };
}

function toBuildRecord(build: (ReturnType<typeof allBuilds>)[number], locale: string): ToolBuildRecord {
  return {
    slug: build.slug,
    tier: build.tier,
    vendor: build.vendor,
    gpuModel: build.gpuModel,
    gpuCount: build.gpuCount,
    totalVramGb: build.totalVramGb,
    systemRamGb: build.systemRamGb,
    runtime: build.runtime,
    readingTps: build.readingToks,
    writingTps: build.writingToks,
    evidence: build.evidence,
    idleWatts: build.idleWatts,
    loadWatts: build.loadWatts,
    totalPriceUsd: build.totalPriceUsd,
    localCostPerMM: build.localCostPerMM,
    breakEvenDays: build.breakEvenDays,
    title: buildText(build.title, locale),
    tagline: buildText(build.tagline, locale),
  };
}

function toVariantRecords(): ToolVariantRecord[] {
  return modelsData.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    description: variant.description,
    ramGbMin: variant.ramGbMin,
    vramGbMin: variant.vramGbMin,
    downloadGb: variant.downloadGb,
    outputTps5070: variant.outputTps5070,
    tags: variant.tags,
  }));
}

function toDownloadSummary(): ToolDownloadSummary {
  const assets = [...downloadsData.engine.assets, ...downloadsData.desktop.assets];
  const platforms = [...new Set(assets.map((asset) => asset.platform))].filter(
    (platform): platform is "windows" | "linux" | "macos" | "other" =>
      platform === "windows" || platform === "linux" || platform === "macos" || platform === "other",
  );
  return {
    syncedAt: downloadsData.syncedAt,
    siteUrl: downloadsData.siteUrl,
    engineTag: downloadsData.engine.tag,
    engineUrl: downloadsData.engine.url,
    desktopTag: downloadsData.desktop.tag,
    desktopUrl: downloadsData.desktop.url,
    assetCount: assets.length,
    platforms,
  };
}

/** One deterministic, server-produced payload for every tool surface. */
export function getToolsBundle(locale: string): ToolsBundle {
  return {
    locale,
    gpus: selectGpus().map(toGpuRecord),
    rigs: getRigs().map(toRigRecord),
    builds: allBuilds().map((build) => toBuildRecord(build, locale)),
    variants: toVariantRecords(),
    downloads: toDownloadSummary(),
  };
}

const GPU_SLUGS = new Set<ToolSlug>(["vram-visualizer", "gpu-compare", "quant-explorer", "multi-gpu-planner"]);
const RIG_SLUGS = new Set<ToolSlug>(["benchmark-scatter", "roi-calculator", "vram-visualizer", "quant-explorer"]);
const BUILD_SLUGS = new Set<ToolSlug>(["pc-builder", "roi-calculator"]);

/** Per-tool compact payload so every static HTML page stays well under the 180 KB budget. */
export function getToolsBundleForSlug(locale: string, slug: ToolSlug): ToolsBundle {
  return {
    locale,
    gpus: GPU_SLUGS.has(slug) ? selectGpus().map(toGpuRecord) : [],
    rigs: RIG_SLUGS.has(slug) ? getRigs().map(toRigRecord) : [],
    builds: BUILD_SLUGS.has(slug) ? allBuilds().map((build) => toBuildRecord(build, locale)) : [],
    variants: toVariantRecords(),
    downloads: toDownloadSummary(),
  };
}
