/**
 * Pure, deterministic hardware-fit & economics engine for `/can-i-run`.
 *
 * Kept free of Node-only APIs and bundler path aliases so it works both in the browser
 * calculator and directly under `node --test`.
 */

export type ModelVariantSpec = {
  id: string;
  name: string;
  description: string;
  ramGbMin: number;
  vramGbMin: number;
  downloadGb: number;
  outputTps5070: number;
  tags?: string[];
};

export type ContextWindowK = 8 | 32 | 64 | 128;

export type FitStatus = "recommended" | "fits" | "tight" | "needs-ram" | "needs-vram";

export type HardwareInput = {
  /** Dedicated VRAM in GB (or total unified memory when `unifiedMemory` is true). */
  vramGb: number;
  /** System RAM in GB (ignored when `unifiedMemory` is true; treated equal to `vramGb`). */
  ramGb: number;
  unifiedMemory: boolean;
  contextK: ContextWindowK;
  /** Optional memory bandwidth (GB/s) for throughput estimation when unmeasured. */
  bandwidthGbs?: number;
  /** Optional measured read/write tok/s from benchmarks.json. */
  measuredReadTps?: number;
  measuredWriteTps?: number;
  /** Optional system power & rig price for economics estimate. */
  powerWatts?: number;
  rigPriceUsd?: number | null;
  dailyHours?: number;
  electricityPerKwh?: number;
  apiReadingPerMM?: number;
  apiWritingPerMM?: number;
};

export type VariantFit = {
  variant: ModelVariantSpec;
  status: FitStatus;
  effectiveVramGb: number;
  effectiveRamGb: number;
  kvCacheGb: number;
  requiredRamGb: number;
  requiredVramGb: number;
  /** Estimated generation speed in tok/s for this quant. */
  estimatedWriteTps: number | null;
  estimatedReadTps: number | null;
  evidence: "measured" | "estimated";
  /** Local cost $/M tokens at 90/10 mix, if rigPriceUsd + powerWatts + speed available. */
  localCostPerMM: number | null;
  breakEvenDays: number | null;
};

export type CanIRunVerdict = {
  runnable: boolean;
  bestVariant: VariantFit | null;
  variants: VariantFit[];
  kvCacheGb: number;
  bottleneck: "none" | "vram" | "ram" | "unified-memory";
};

/**
 * KV-cache overhead for a MoE / 125B-class model (GQA + Q8 KV quantization).
 * Conservative planning allowance: ~1.5 GB at 8K, ~4 GB at 32K, ~7.5 GB at 64K, ~14 GB at 128K.
 */
export function kvCacheMemoryGb(contextK: ContextWindowK): number {
  switch (contextK) {
    case 8:
      return 1.5;
    case 32:
      return 4;
    case 64:
      return 7.5;
    case 128:
      return 14;
  }
}

/**
 * Relative speed multiplier per quantization variant normalized against IQ2_XS (79 tok/s baseline
 * on RTX 5070 in `models.json`).
 */
export function quantSpeedFactor(variant: ModelVariantSpec): number {
  const baseline = 79;
  if (!variant.outputTps5070 || variant.outputTps5070 <= 0) return 1;
  return variant.outputTps5070 / baseline;
}

/**
 * Estimate throughput and local economics for one variant on the given hardware.
 * Uses measured rig figures when present; otherwise scales conservatively from memory bandwidth.
 */
export function evaluateVariant(input: HardwareInput, variant: ModelVariantSpec): VariantFit {
  const kvCacheGb = kvCacheMemoryGb(input.contextK);
  const effectiveVramGb = Math.max(0, Number(input.vramGb) || 0);
  // Apple/AMD unified memory pools reserve ~20% for OS/display at high memory utilization.
  const usableUnifiedGb = Math.floor(effectiveVramGb * 0.82);
  const effectiveRamGb = input.unifiedMemory
    ? usableUnifiedGb
    : Math.max(0, Number(input.ramGb) || 0);

  // At 8K context the catalog floors already include KV headroom; longer contexts add incremental KV.
  const extraKv = Math.max(0, kvCacheGb - kvCacheMemoryGb(8));
  const requiredVramGb = input.unifiedMemory
    ? Math.round(variant.ramGbMin + extraKv)
    : Math.round(variant.vramGbMin + Math.min(extraKv, 6));
  const requiredRamGb = Math.round(variant.ramGbMin + extraKv);

  let status: FitStatus;
  if (input.unifiedMemory) {
    const totalNeeded = variant.ramGbMin + extraKv;
    if (usableUnifiedGb >= totalNeeded + 8) status = "fits";
    else if (usableUnifiedGb >= totalNeeded) status = "tight";
    else status = "needs-ram";
  } else {
    const vramOk = effectiveVramGb >= variant.vramGbMin;
    const ramOk = effectiveRamGb >= requiredRamGb;
    if (!vramOk) status = "needs-vram";
    else if (!ramOk) status = "needs-ram";
    else if (effectiveVramGb >= requiredVramGb + 4 && effectiveRamGb >= requiredRamGb + 8) status = "fits";
    else status = "tight";
  }

  const runnable = status === "fits" || status === "tight";
  const factor = quantSpeedFactor(variant);
  const evidence: "measured" | "estimated" =
    input.measuredWriteTps && input.measuredWriteTps > 0 ? "measured" : "estimated";

  let estimatedWriteTps: number | null = null;
  let estimatedReadTps: number | null = null;

  if (runnable) {
    if (input.measuredWriteTps && input.measuredWriteTps > 0) {
      estimatedWriteTps = round1(input.measuredWriteTps * factor);
      estimatedReadTps =
        input.measuredReadTps && input.measuredReadTps > 0
          ? round1(input.measuredReadTps)
          : round1(input.measuredWriteTps * 22);
    } else if (input.bandwidthGbs && input.bandwidthGbs > 0) {
      // Conservative bandwidth scaling calibrated to consumer GPUs (~0.095 tok/s per GB/s on IQ2_XS).
      const baseWrite = Math.max(4, input.bandwidthGbs * 0.095);
      estimatedWriteTps = round1(baseWrite * factor);
      estimatedReadTps = round1(input.bandwidthGbs * 2.4);
    }
  }

  let localCostPerMM: number | null = null;
  let breakEvenDays: number | null = null;
  const hours = Math.max(1, Math.min(24, Number(input.dailyHours ?? 8) || 8));
  const power = Math.max(0, Number(input.powerWatts ?? 0) || 0);
  const elec = Math.max(0, Number(input.electricityPerKwh ?? 0.15) || 0.15);
  const apiRead = Number(input.apiReadingPerMM ?? 0.1);
  const apiWrite = Number(input.apiWritingPerMM ?? 0.64);
  const rigTotal = input.rigPriceUsd != null && input.rigPriceUsd > 0 ? input.rigPriceUsd : null;

  if (estimatedWriteTps && estimatedReadTps && rigTotal != null) {
    const readShare = 0.9;
    const secPerTok = readShare / estimatedReadTps + (1 - readShare) / estimatedWriteTps;
    const capMTokDay = (hours * 3600) / secPerTok / 1e6;
    const energyDay = (power / 1000) * hours * elec;
    const hwDay = rigTotal / (5 * 365);
    const apiDay = capMTokDay * (readShare * apiRead + (1 - readShare) * apiWrite);
    if (capMTokDay > 0) {
      localCostPerMM = Number(((energyDay + hwDay) / capMTokDay).toFixed(3));
    }
    const net = apiDay - energyDay;
    if (net > 0) {
      breakEvenDays = Math.round(rigTotal / net);
    }
  }

  return {
    variant,
    status,
    effectiveVramGb,
    effectiveRamGb,
    kvCacheGb,
    requiredRamGb,
    requiredVramGb,
    estimatedWriteTps,
    estimatedReadTps,
    evidence,
    localCostPerMM,
    breakEvenDays,
  };
}

/** Preference order when picking the single best runnable quant for a user's machine. */
const QUALITY_RANK: Record<string, number> = {
  "ud-iq4_xs": 6,
  iq3_s: 5,
  iq3_xxs: 4,
  iq2_xs: 3,
  q2_0: 2,
  coder: 1,
};

export function evaluateHardware(
  input: HardwareInput,
  variants: ModelVariantSpec[],
): CanIRunVerdict {
  const evaluated = variants.map((v) => evaluateVariant(input, v));
  const runnableList = evaluated.filter((v) => v.status === "fits" || v.status === "tight");

  // Prefer cleanly fitting ("fits") over "tight", then highest quality quant.
  const best =
    [...runnableList].sort((a, b) => {
      const fitDelta = (a.status === "fits" ? 0 : 1) - (b.status === "fits" ? 0 : 1);
      if (fitDelta !== 0) return fitDelta;
      return (QUALITY_RANK[b.variant.id] ?? 0) - (QUALITY_RANK[a.variant.id] ?? 0);
    })[0] ?? null;

  const finalVariants = evaluated.map((entry) =>
    best && entry.variant.id === best.variant.id ? { ...entry, status: "recommended" as const } : entry,
  );

  let bottleneck: CanIRunVerdict["bottleneck"] = "none";
  if (!best) {
    if (input.unifiedMemory) bottleneck = "unified-memory";
    else if (evaluated.every((e) => e.status === "needs-vram")) bottleneck = "vram";
    else bottleneck = "ram";
  }

  return {
    runnable: Boolean(best),
    bestVariant: best ? { ...best, status: "recommended" } : null,
    variants: finalVariants,
    kvCacheGb: kvCacheMemoryGb(input.contextK),
    bottleneck,
  };
}

export type VramTierRow = {
  id: string;
  vramGb: number;
  ramGb: number;
  unifiedMemory: boolean;
  exampleCards: string;
  bandwidthGbs: number;
};

/**
 * Standard consumer hardware tiers rendered in the server-side quick-reference table so crawlers
 * and AI answer engines can extract "can 8 GB / 12 GB / 16 GB / 24 GB / 32 GB / 64 GB / 128 GB
 * run it?" directly without executing JavaScript.
 */
export const HARDWARE_TIERS: VramTierRow[] = [
  { id: "tier-8gb", vramGb: 8, ramGb: 32, unifiedMemory: false, exampleCards: "RTX 4060 8GB / RTX 3070", bandwidthGbs: 272 },
  { id: "tier-12gb-32", vramGb: 12, ramGb: 32, unifiedMemory: false, exampleCards: "RTX 4070 / RTX 5070 12GB (32 GB RAM)", bandwidthGbs: 504 },
  { id: "tier-12gb-64", vramGb: 12, ramGb: 64, unifiedMemory: false, exampleCards: "RTX 4070 / RTX 5070 12GB (64 GB RAM)", bandwidthGbs: 672 },
  { id: "tier-16gb", vramGb: 16, ramGb: 64, unifiedMemory: false, exampleCards: "RTX 5080 / RTX 5070 Ti / RX 9070 XT 16GB", bandwidthGbs: 960 },
  { id: "tier-24gb", vramGb: 24, ramGb: 64, unifiedMemory: false, exampleCards: "RTX 4090 / RTX 3090 / RX 7900 XTX", bandwidthGbs: 1008 },
  { id: "tier-32gb", vramGb: 32, ramGb: 96, unifiedMemory: false, exampleCards: "RTX 5090 / 2× RTX 5060 Ti 16GB", bandwidthGbs: 1792 },
  { id: "tier-64-unified", vramGb: 64, ramGb: 64, unifiedMemory: true, exampleCards: "Mac Studio M5 Max / Mac mini M5 Pro 64 GB", bandwidthGbs: 546 },
  { id: "tier-96-plus", vramGb: 128, ramGb: 128, unifiedMemory: true, exampleCards: "Ryzen AI Max+ 395 / DGX Spark / Mac Studio 128 GB+", bandwidthGbs: 800 },
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
