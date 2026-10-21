import gpuData from "@/data/gpus.json";

export type GpuVendor = "nvidia" | "amd" | "intel" | "apple";

export type Gpu = {
  id: string;
  slug: string;
  name: string;
  vendor: GpuVendor;
  arch: string;
  vramGb: number;
  year: number;
  bandwidthGbs: number;
  readingTps: number;
  writingTps: number;
  /** `measured` means benchmarks.json has real numbers; `estimated` is derived from bandwidth. */
  evidence: "measured" | "estimated";
  cardPrice: number | null;
  powerWatts: number | null;
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
};

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
