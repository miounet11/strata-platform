import gpuData from "@/data/gpus.json";
import { modelNumber } from "./gpu-naming";

/**
 * Chip vendors in the catalogue. The last six are historical: they have no release build, but
 * they are real hardware and the index covers the line rather than only what the app runs on.
 */
export type GpuVendor =
  | "nvidia"
  | "amd"
  | "intel"
  | "apple"
  | "matrox"
  | "3dfx"
  | "xgi"
  | "sis"
  | "sony"
  | "s3"
  | "via";

export type Gpu = {
  id: string;
  slug: string;
  name: string;
  vendor: GpuVendor;
  arch: string;
  /** Marketing family, e.g. "GeForce RTX 40". Groups the catalogue into browsable pages. */
  series: string;
  /** Board vendor as printed by the source, e.g. "ATI" for pre-AMD cards. */
  brand: string;
  vramGb: number;
  year: number;
  bandwidthGbs: number;
  readingTps: number;
  writingTps: number;
  /** `measured` means benchmarks.json has real numbers; `estimated` is derived from bandwidth. */
  evidence: "measured" | "estimated";
  cardPrice: number | null;
  powerWatts: number | null;
  /** Memory technology and the bus form factor, from the spec sheet. Null when unreported. */
  memoryType: string | null;
  bus: string | null;
  process: string | null;
  /** The silicon, which is often a different name from the board ("AD102" vs "RTX 4090"). */
  gpuName: string | null;
  quant: string | null;
  runnable: boolean;
  variant: string;
  /** Release backend for this vendor: one engine build per accelerator. */
  runtime: "CUDA" | "ROCm" | "Metal";
  platforms: ("windows" | "linux" | "macos")[];
  driverMin: string;
  /** VRAM floor of the smallest shipped build. */
  vramGbMin: number;
  /**
   * Never inferred from the model name:
   *   verified      — benchmarked here, and a build fits.
   *   supported     — fits the VRAM/driver floor, throughput not measured on this card.
   *   not-supported — below the smallest VRAM floor; no build would load.
   */
  support: "verified" | "supported" | "not-supported";
  reason: string | null;
  recommendedBuild: {
    variant: string;
    runtime: string;
    platforms: string[];
    driverMin: string;
  } | null;
};

export type QuantVariant = {
  id: string;
  name: string;
  description: string;
  ramGbMin: number;
  vramGbMin: number;
  downloadGb: number;
};

const gpus = gpuData.gpus as Gpu[];
const variants = gpuData.variants as QuantVariant[];
export const gpuCounts = gpuData.counts;
export const gpuVariants = variants;
export const baseModel = gpuData.baseModel as string;

export function allGpus(): Gpu[] {
  return gpus;
}

export function getGpu(slug: string): Gpu | undefined {
  return gpus.find((g) => g.slug === slug);
}

export const vendorLabel: Record<GpuVendor, string> = {
  nvidia: "NVIDIA",
  amd: "AMD",
  intel: "Intel",
  apple: "Apple",
  matrox: "Matrox",
  "3dfx": "3dfx",
  xgi: "XGI",
  sis: "SiS",
  sony: "Sony",
  s3: "S3",
  via: "VIA",
};

/** Vendors that ship a release build. The rest are catalogue-only, and the site says so. */
export const runnableVendors: GpuVendor[] = ["nvidia", "amd", "intel", "apple"];

/** URL segment for a vendor, also used as the slug of its browsable index. */
export function vendorSlug(vendor: GpuVendor): string {
  return vendor === "3dfx" ? "3dfx" : vendor;
}

export function getVendor(slug: string): GpuVendor | undefined {
  return (Object.keys(vendorLabel) as GpuVendor[]).find((v) => vendorSlug(v) === slug);
}

export type SeriesSummary = {
  series: string;
  slug: string;
  vendor: GpuVendor;
  count: number;
  /** Newest year in the series, for ordering the index. */
  year: number;
  vramGbMax: number;
};

/** URL segment for a series page: stable, ASCII, and unique within its vendor. */
export function seriesSlug(series: string): string {
  return series
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function seriesOfVendor(vendor: GpuVendor): SeriesSummary[] {
  const bySeries = new Map<string, Gpu[]>();
  for (const gpu of gpus) {
    if (gpu.vendor !== vendor) continue;
    const list = bySeries.get(gpu.series) ?? [];
    list.push(gpu);
    bySeries.set(gpu.series, list);
  }
  return [...bySeries.entries()]
    .map(([series, list]) => ({
      series,
      slug: seriesSlug(series),
      vendor,
      count: list.length,
      year: Math.max(...list.map((g) => g.year || 0)),
      vramGbMax: Math.max(...list.map((g) => g.vramGb)),
    }))
    .sort((a, b) => b.year - a.year || b.count - a.count || a.series.localeCompare(b.series));
}

export function gpusOfSeries(vendor: GpuVendor, slug: string): Gpu[] {
  return gpus
    .filter((gpu) => gpu.vendor === vendor && seriesSlug(gpu.series) === slug)
    .sort((a, b) => b.vramGb - a.vramGb || b.year - a.year || a.name.localeCompare(b.name));
}

export function gpusOfVendor(vendor: GpuVendor): Gpu[] {
  return gpus
    .filter((gpu) => gpu.vendor === vendor)
    .sort((a, b) => b.year - a.year || b.vramGb - a.vramGb || a.name.localeCompare(b.name));
}

export function allSeries(): SeriesSummary[] {
  return (Object.keys(vendorLabel) as GpuVendor[])
    .flatMap((vendor) => seriesOfVendor(vendor))
    .sort((a, b) => b.year - a.year || b.count - a.count);
}

/** Vendor → how many cards, newest year, so the index can show a real count per brand. */
export function vendorSummaries(): { vendor: GpuVendor; label: string; slug: string; count: number; year: number }[] {
  return (Object.keys(vendorLabel) as GpuVendor[])
    .map((vendor) => {
      const list = gpus.filter((g) => g.vendor === vendor);
      return {
        vendor,
        label: vendorLabel[vendor],
        slug: vendorSlug(vendor),
        count: list.length,
        year: Math.max(0, ...list.map((g) => g.year || 0)),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Vendor → arch, newest first: the shape of a driver-download site's left column. */
export function vendorTree(): { vendor: GpuVendor; arches: { arch: string; gpus: Gpu[] }[] }[] {
  const byVendor = new Map<GpuVendor, Map<string, Gpu[]>>();
  for (const gpu of gpus) {
    if (!byVendor.has(gpu.vendor)) byVendor.set(gpu.vendor, new Map());
    const arches = byVendor.get(gpu.vendor)!;
    if (!arches.has(gpu.arch)) arches.set(gpu.arch, []);
    arches.get(gpu.arch)!.push(gpu);
  }
  return [...byVendor.entries()].map(([vendor, arches]) => ({
    vendor,
    arches: [...arches.entries()]
      .map(([arch, list]) => ({ arch, gpus: [...list].sort((a, b) => b.vramGb - a.vramGb) }))
      .sort((a, b) => (b.gpus[0]?.year ?? 0) - (a.gpus[0]?.year ?? 0)),
  }));
}

/**
 * The quant a card should actually run. Richest variant whose VRAM floor fits; `null` when even
 * the smallest does not, because offering a download that cannot load is worse than saying no.
 */
export function recommendedVariant(gpu: Gpu): QuantVariant | null {
  const fits = [...variants].sort((a, b) => b.vramGbMin - a.vramGbMin).filter((v) => gpu.vramGb >= v.vramGbMin);
  return fits[0] ?? null;
}

export type CompatLevel = Gpu["support"];

/**
 * The support level is computed by the catalogue generator from VRAM floors and measurement
 * status — never from the model name — so this just reads it back.
 */
export function compatLevel(gpu: Gpu): CompatLevel {
  return gpu.support;
}

/** Cards a person can actually filter to, in the order a driver site lists them. */
export function filterGpus(opts: {
  vendor?: string;
  arch?: string;
  minVram?: number;
  support?: string;
  query?: string;
}): Gpu[] {
  const q = opts.query?.trim().toLowerCase();
  return gpus.filter((gpu) => {
    if (opts.vendor && gpu.vendor !== opts.vendor) return false;
    if (opts.arch && gpu.arch !== opts.arch) return false;
    if (opts.minVram != null && gpu.vramGb < opts.minVram) return false;
    if (opts.support && gpu.support !== opts.support) return false;
    if (q && !`${gpu.name} ${gpu.arch} ${gpu.vendor}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Newest and fastest first: the order a comparison table should read in. */
export function sortGpus(list: Gpu[], by: "vram" | "speed" | "year" | "name" = "vram"): Gpu[] {
  const sorted = [...list];
  if (by === "vram") sorted.sort((a, b) => b.vramGb - a.vramGb || b.readingTps - a.readingTps);
  if (by === "speed") sorted.sort((a, b) => b.readingTps - a.readingTps);
  if (by === "year") sorted.sort((a, b) => b.year - a.year || b.vramGb - a.vramGb);
  if (by === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

/**
 * The other cards in the same series, nearest in VRAM first.
 *
 * This is the link that makes the catalogue a graph rather than 3,209 leaves: the series page
 * lists its cards, but only this direction connects card to card, which is what a reader
 * choosing between a 3060 12 GB and a 3060 8 GB actually needs.
 */
export function seriesSiblings(gpu: Gpu, limit = 6): Gpu[] {
  // The card's own model number, so "RTX 4090" is followed by its Max-Q and Mobile variants
  // before an unrelated 16 GB 4080. Sorting on VRAM alone would bury them behind every card
  // that happens to share a capacity.
  const own = modelNumber(gpu.name);
  const affinity = (other: Gpu) => (own && modelNumber(other.name) === own ? 0 : 1);

  return gpus
    .filter((g) => g.id !== gpu.id && g.vendor === gpu.vendor && g.series === gpu.series)
    .sort(
      (a, b) =>
        affinity(a) - affinity(b) ||
        Math.abs(a.vramGb - gpu.vramGb) - Math.abs(b.vramGb - gpu.vramGb) ||
        Math.abs((a.year || 0) - (gpu.year || 0)) - Math.abs((b.year || 0) - (gpu.year || 0)) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export { modelNumber, vramLabel } from "./gpu-naming";

/** Same-resolution cards from other vendors, for the "compare with" block. */
export function rivals(gpu: Gpu, limit = 4): Gpu[] {
  return gpus
    .filter((g) => g.id !== gpu.id && Math.abs(g.vramGb - gpu.vramGb) <= Math.max(4, gpu.vramGb * 0.25))
    .sort((a, b) => Math.abs(a.vramGb - gpu.vramGb) - Math.abs(b.vramGb - gpu.vramGb))
    .slice(0, limit);
}

export const variantLabel: Record<string, string> = {
  nvidia: "NVIDIA · CUDA",
  "nvidia-legacy": "NVIDIA · CUDA 12 (legacy)",
  amd: "AMD · HIP / ROCm",
  intel: "Intel · oneAPI / SYCL",
  apple: "Apple · Metal",
};
