import type { Gpu, QuantVariant } from "./gpus";

export type CoolingTier = "unified-silent" | "compact-air" | "high-airflow-tower" | "workstation-blower-or-aio";
export type QuantFitStatus = "full-vram" | "hybrid-offload" | "too-small";

export type GpuQuantRow = {
  id: string;
  name: string;
  downloadGb: number;
  vramFloorGb: number;
  ramFloorGb: number;
  fit: QuantFitStatus;
  vramUsedGb: number;
  ramOffloadGb: number;
  estWriteTps: number;
  estReadTps: number;
  maxContextK: number;
};

export type GpuHardwareProfile = {
  tdpWatts: number;
  tdpEstimated: boolean;
  /** Recommended ATX PSU wattage (rounded up to nearest 50W); null for integrated/unified/mobile chips. */
  recommendedPsuWatts: number | null;
  /** Power connector requirement. */
  powerConnector: string;
  /** Physical card slot clearance. */
  slotWidth: string;
  /** PCIe interface / fabric guidance derived from gpu.bus, arch, and year. */
  pcieInterface: string;
  /** Recommended host system RAM in GB for running Strata MoE models smoothly with this GPU. */
  recommendedHostRamGb: number;
  /** Minimum usable host RAM in GB. */
  minHostRamGb: number;
  coolingTier: CoolingTier;
  isUnifiedOrMobile: boolean;
  multiGpuViable: boolean;
  /** Generation throughput efficiency: writing tok/s per 100W TDP (null if not runnable or TDP <= 0). */
  tpsPer100W: number | null;
  /** Estimated annual electricity cost (USD) at 4h/day load ($0.15/kWh). */
  annualPower4hUsd: number;
  /** Per-quantization fit, memory split, and throughput rows for all shipped Strata variants. */
  quantMatrix: GpuQuantRow[];
  /** Best fitting quant id (richest quant that fits cleanly) or null. */
  bestQuantId: string | null;
};

/**
 * Unified/mobile detector. `\d+m\b` matches mobile suffixes like 4090M or 680M without
 * false-matching desktop legacy cards like Millennium or FireStream.
 */
const MOBILE_NAME = /mobile|laptop|max-q|\d+m\b|igpu|integrated|iris|uhd|hd graphics|vega \d+ mobile|radeon \d+m|ryzen/i;

/** Richest → leanest. Coder is a specialist pack, not a quality step above Q2. */
const QUALITY_ORDER = ["ud-iq4_xs", "iq3_s", "iq3_xxs", "iq2_xs", "q2_0", "coder"] as const;

/**
 * Decode tok/s of each pack on an RTX 5070, from the catalogue variants.
 * Catalogue `writingTps` is the Q2_0 baseline, so every other pack scales by `speed / 94`.
 */
const QUANT_WRITE_TPS: Record<string, number> = {
  q2_0: 94,
  iq2_xs: 79,
  iq3_xxs: 62,
  iq3_s: 53,
  coder: 55,
  "ud-iq4_xs": 45,
};
const Q2_BASELINE_TPS = 94;

/** Inlined so this module never loads the catalogue JSON or a Node API. */
const DEFAULT_VARIANTS: readonly QuantVariant[] = [
  {
    id: "q2_0",
    name: "Q2_0",
    description: "Fastest quant; great for 48 GB RAM systems.",
    ramGbMin: 48,
    vramGbMin: 12,
    downloadGb: 70,
  },
  {
    id: "iq2_xs",
    name: "IQ2_XS",
    description: "Recommended default for 64 GB RAM; balance of speed and quality.",
    ramGbMin: 64,
    vramGbMin: 12,
    downloadGb: 72,
  },
  {
    id: "iq3_xxs",
    name: "IQ3_XXS",
    description: "Smarter than IQ2; still fits most 64 GB builds.",
    ramGbMin: 64,
    vramGbMin: 12,
    downloadGb: 74,
  },
  {
    id: "iq3_s",
    name: "IQ3_S",
    description: "Best quality that still runs on 64 GB; slowest of the IQ line.",
    ramGbMin: 64,
    vramGbMin: 12,
    downloadGb: 76,
  },
  {
    id: "coder",
    name: "Coder",
    description: "Coding-focused variant; fits 32 GB RAM (weaker on CJK general text).",
    ramGbMin: 32,
    vramGbMin: 12,
    downloadGb: 68,
  },
  {
    id: "ud-iq4_xs",
    name: "Unsloth UD-IQ4_XS",
    description: "~4-bit Unsloth pack; needs ~80 GB RAM or partial SSD offload.",
    ramGbMin: 80,
    vramGbMin: 12,
    downloadGb: 94,
  },
];

const ELECTRICITY_PER_KWH = 0.15;
const HOURS_PER_DAY = 4;
const DAYS_PER_YEAR = 365;

function finite(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function reportedWatts(gpu: Gpu): number | null {
  if (typeof gpu.powerWatts !== "number" || !Number.isFinite(gpu.powerWatts) || gpu.powerWatts <= 0) {
    return null;
  }
  return gpu.powerWatts;
}

function round1(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function ceil50(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 50 - 1e-9) * 50;
}

function textOf(gpu: Gpu): string {
  return `${gpu.name ?? ""} ${gpu.arch ?? ""} ${gpu.series ?? ""} ${gpu.gpuName ?? ""}`.toLowerCase();
}

export function isUnifiedOrMobileGpu(gpu: Gpu): boolean {
  if (gpu.vendor === "apple") return true;
  if (MOBILE_NAME.test(gpu.name ?? "")) return true;
  const bus = typeof gpu.bus === "string" ? gpu.bus.toLowerCase() : "";
  return bus.includes("igp") || bus.includes("integrated");
}

function isBlackwell(gpu: Gpu): boolean {
  if (gpu.vendor !== "nvidia") return false;
  const text = textOf(gpu);
  return text.includes("blackwell") || /\brtx\s*50\d{2}\b/.test(text) || /\bb[12]00\b/.test(text);
}

function isAda(gpu: Gpu): boolean {
  if (gpu.vendor !== "nvidia") return false;
  const name = (gpu.name ?? "").toLowerCase();
  // A GeForce 10/20/30 name without "Ada" stays on 8-pin even if arch was copied wrong.
  // RTX 2000/3000 Ada and L40 keep the 16-pin path: the name or the arch actually says Ada.
  if (/\brtx\s*[123]0\d{2}\b/.test(name) && !name.includes("ada")) return false;
  if (/\brtx\s*40\d{2}\b/.test(name) || name.includes("ada")) return true;
  const arch = `${gpu.arch ?? ""} ${gpu.series ?? ""}`.toLowerCase();
  return arch.includes("ada");
}

/**
 * Board-power guess used only when the catalogue has no wattage.
 * Curated rows store whole-rig wall draw; TechPowerUp rows store board TDP. Neither is guessed here.
 */
function estimateBoardTdp(gpu: Gpu, unified: boolean): number {
  const vram = Math.max(0, finite(gpu.vramGb));
  const year = finite(gpu.year);
  let watts = 15;
  if (vram >= 80) watts = 400;
  else if (vram >= 48) watts = 300;
  else if (vram >= 32) watts = 280;
  else if (vram >= 24) watts = 250;
  else if (vram >= 16) watts = 200;
  else if (vram >= 12) watts = 170;
  else if (vram >= 8) watts = 130;
  else if (vram >= 4) watts = 90;
  else if (vram >= 2) watts = 60;
  else if (vram >= 1) watts = 40;
  else if (vram >= 0.25) watts = 30;

  if (year >= 2022 && vram >= 16) watts += 40;
  if (year >= 2024 && vram >= 24) watts += 40;
  if (year > 0 && year < 2010) watts = Math.round(watts * 0.75);
  if (year > 0 && year < 2000) watts = Math.min(watts, 40);

  if (gpu.vendor === "apple") {
    watts = 15 + Math.round(Math.sqrt(Math.max(vram, 1)) * 14);
    if (/ultra/i.test(gpu.name ?? "")) watts += 50;
    if (/max/i.test(gpu.name ?? "")) watts += 20;
    if (/pro/i.test(gpu.name ?? "")) watts += 10;
  } else if (unified) {
    watts = Math.min(watts, Math.max(12, Math.round(10 + vram * 6)));
  }

  if (gpu.vendor === "intel" && unified) watts = Math.min(watts, 65);
  if (gpu.vendor === "matrox" || gpu.vendor === "3dfx" || gpu.vendor === "s3" || gpu.vendor === "sis" || gpu.vendor === "via" || gpu.vendor === "xgi") {
    watts = Math.min(watts, 75);
  }

  watts = Math.round(watts);
  if (!Number.isFinite(watts) || watts < 5) return 15;
  return Math.min(watts, 800);
}

type DrawKind = "rig" | "board";

function drawOf(gpu: Gpu, tdpWatts: number, tdpEstimated: boolean, unified: boolean): { kind: DrawKind; watts: number } {
  // Measured, discrete cards publish total system wall draw. Everything else is board TDP.
  if (!unified && !tdpEstimated && gpu.evidence === "measured") {
    return { kind: "rig", watts: tdpWatts };
  }
  return { kind: "board", watts: tdpWatts };
}

function psuWatts(unified: boolean, draw: { kind: DrawKind; watts: number }): number | null {
  if (unified) return null;
  if (draw.kind === "rig") {
    const sized = Math.max(650, ceil50(draw.watts * 1.45));
    return sized > 0 ? sized : 650;
  }
  const sized = Math.max(550, ceil50((draw.watts + 200) * 1.25));
  if (!Number.isFinite(sized) || sized <= 0) return 550;
  return Math.min(1600, sized);
}

function powerConnector(gpu: Gpu, unified: boolean, draw: { kind: DrawKind; watts: number }): string {
  if (unified) return "Unified / Internal";
  const watts = draw.watts;
  if (isBlackwell(gpu) && watts >= 220) return "1× 12V-2x6 (ATX 3.1)";
  if (isAda(gpu) && watts >= 250) return "1× 16-pin 12VHPWR";

  const boardWatts = draw.kind === "board" ? watts : null;
  const rigWatts = draw.kind === "rig" ? watts : null;
  if ((boardWatts != null && boardWatts >= 320) || (rigWatts != null && rigWatts >= 550)) {
    return "3× 8-pin PCIe";
  }
  if ((boardWatts != null && boardWatts >= 175) || (rigWatts != null && rigWatts >= 380)) {
    return "2× 8-pin PCIe";
  }
  const mid = boardWatts ?? Math.max(0, (rigWatts ?? 0) - 180);
  if (mid >= 76 || (rigWatts != null && rigWatts > 75)) return "1× 8-pin PCIe";
  return "PCIe slot powered (≤75W)";
}

function slotWidth(unified: boolean, draw: { kind: DrawKind; watts: number }): string {
  if (unified) return "Unified / Mobile";
  const high = draw.kind === "board" ? draw.watts >= 320 : draw.watts >= 550;
  const mid = draw.kind === "board" ? draw.watts >= 200 : draw.watts >= 400;
  if (high) return "3–3.5-slot";
  if (mid) return "2.5-slot";
  return "2-slot";
}

function coolingTier(unified: boolean, draw: { kind: DrawKind; watts: number }): CoolingTier {
  if (unified) return "unified-silent";
  const hot = draw.kind === "board" ? draw.watts >= 320 : draw.watts >= 600;
  const warm = draw.kind === "board" ? draw.watts >= 160 : draw.watts >= 380;
  if (hot) return "workstation-blower-or-aio";
  if (warm) return "high-airflow-tower";
  return "compact-air";
}

function pcieInterface(gpu: Gpu, unified: boolean): string {
  const bus = typeof gpu.bus === "string" ? gpu.bus.trim() : "";
  if (bus) return bus;
  if (unified || gpu.vendor === "apple") return "Unified memory fabric";
  const year = finite(gpu.year);
  const text = textOf(gpu);
  if (year >= 2024 || text.includes("blackwell") || /\brtx\s*50\d{2}\b/.test(text)) return "PCIe 5.0 x16";
  if (year >= 2019 || text.includes("ampere") || text.includes("rdna") || /\brtx\s*40\d{2}\b/.test(text)) {
    return "PCIe 4.0 x16";
  }
  if (year >= 2012) return "PCIe 3.0 x16";
  if (year >= 2004) return "PCIe 2.0 x16";
  if (year > 0) return "Legacy PCI / AGP";
  return "Bus unspecified";
}

function hostRam(gpu: Gpu, unified: boolean): { recommendedHostRamGb: number; minHostRamGb: number } {
  const vram = Math.max(0, finite(gpu.vramGb));
  if (unified) {
    const recommended = Math.max(8, Math.round(vram) || 8);
    let min = 8;
    if (vram >= 80) min = 64;
    else if (vram >= 32) min = 32;
    else if (vram >= 16) min = 16;
    return { recommendedHostRamGb: recommended, minHostRamGb: Math.max(8, Math.min(recommended, min)) };
  }
  if (gpu.runnable !== true) return { recommendedHostRamGb: 32, minHostRamGb: 16 };
  if (vram >= 24) return { recommendedHostRamGb: 128, minHostRamGb: 64 };
  if (vram >= 16) return { recommendedHostRamGb: 96, minHostRamGb: 64 };
  if (vram >= 12) return { recommendedHostRamGb: 64, minHostRamGb: 32 };
  return { recommendedHostRamGb: 32, minHostRamGb: 16 };
}

function quantFactor(id: string): number {
  const speed = QUANT_WRITE_TPS[id];
  if (!speed || speed <= 0) return 1;
  return speed / Q2_BASELINE_TPS;
}

function contextK(freeGb: number, unifiedGb: number | null): number {
  if (unifiedGb != null && unifiedGb >= 96) return 128;
  if (freeGb >= 16) return 128;
  if (freeGb >= 8) return 64;
  if (freeGb >= 3) return 32;
  return 8;
}

function quantRow(gpu: Gpu, variant: QuantVariant): GpuQuantRow {
  const vram = Math.max(0, finite(gpu.vramGb));
  const download = Math.max(0, finite(variant.downloadGb));
  const vramFloor = Math.max(0, finite(variant.vramGbMin));
  const ramFloor = Math.max(0, finite(variant.ramGbMin));
  const row = {
    id: variant.id,
    name: variant.name,
    downloadGb: round1(download) || 0,
    vramFloorGb: round1(vramFloor) || 0,
    ramFloorGb: round1(ramFloor) || 0,
  };

  if (gpu.runnable !== true || vram < vramFloor) {
    return {
      ...row,
      fit: "too-small",
      vramUsedGb: 0,
      ramOffloadGb: 0,
      estWriteTps: 0,
      estReadTps: 0,
      maxContextK: 0,
    };
  }

  let fit: QuantFitStatus;
  let vramUsed: number;
  let offload: number;

  if (gpu.vendor === "apple") {
    // ramGbMin is the published unified-memory floor and already leaves OS headroom (~18%).
    if (vram >= ramFloor) {
      fit = "full-vram";
      vramUsed = round1(Math.min(download, vram * 0.82));
      offload = 0;
    } else {
      fit = "hybrid-offload";
      const usable = vram * 0.82;
      vramUsed = round1(Math.min(vram, Math.max(vramFloor, Math.min(usable, vram))));
      offload = round1(Math.max(0, download - vramUsed + 2));
    }
  } else if (vram >= download + 4) {
    fit = "full-vram";
    vramUsed = round1(Math.min(vram, download + 2));
    offload = 0;
  } else {
    fit = "hybrid-offload";
    vramUsed = round1(Math.min(vram, Math.max(vramFloor, vram - 1.5)));
    offload = round1(Math.max(0, download - vramUsed + 2));
  }

  const free = vram - vramUsed;
  const factor = quantFactor(variant.id);
  const denom = vramUsed + offload;
  const ratio = fit === "hybrid-offload" && denom > 0 ? offload / denom : 0;
  const offloadScale = fit === "hybrid-offload" ? Math.max(0.62, 1 - 0.38 * ratio) : 1;
  const write = Math.max(0, finite(gpu.writingTps));
  const read = Math.max(0, finite(gpu.readingTps));

  return {
    ...row,
    fit,
    vramUsedGb: vramUsed,
    ramOffloadGb: offload,
    estWriteTps: round1(write * factor * offloadScale),
    estReadTps: round1(read * factor * offloadScale),
    maxContextK: contextK(free, gpu.vendor === "apple" ? vram : null),
  };
}

function qualityRank(id: string): number {
  const index = QUALITY_ORDER.indexOf(id as (typeof QUALITY_ORDER)[number]);
  return index === -1 ? QUALITY_ORDER.length + 1 : index;
}

function bestCleanQuant(rows: readonly GpuQuantRow[]): string | null {
  const clean = rows.filter((row) => row.fit === "full-vram");
  if (clean.length === 0) return null;
  return [...clean].sort((a, b) => qualityRank(a.id) - qualityRank(b.id))[0]?.id ?? null;
}

export function gpuHardwareProfile(gpu: Gpu, variants: readonly QuantVariant[] = DEFAULT_VARIANTS): GpuHardwareProfile {
  const unified = isUnifiedOrMobileGpu(gpu);
  const reported = reportedWatts(gpu);
  const tdpEstimated = reported == null;
  let tdpWatts = reported ?? estimateBoardTdp(gpu, unified);
  if (!(tdpWatts > 0) || !Number.isFinite(tdpWatts)) {
    tdpWatts = estimateBoardTdp(gpu, unified);
  }
  if (!(tdpWatts > 0) || !Number.isFinite(tdpWatts)) tdpWatts = 15;

  const draw = drawOf(gpu, tdpWatts, tdpEstimated, unified);
  const ram = hostRam(gpu, unified);
  const quantMatrix = (variants ?? DEFAULT_VARIANTS).map((variant) => quantRow(gpu, variant));
  const writing = Math.max(0, finite(gpu.writingTps));
  const tpsPer100W = gpu.runnable === true && tdpWatts > 0 ? round1((writing / tdpWatts) * 100) : null;
  const annualPower4hUsd = round2((tdpWatts / 1000) * HOURS_PER_DAY * DAYS_PER_YEAR * ELECTRICITY_PER_KWH);

  return {
    tdpWatts,
    tdpEstimated,
    recommendedPsuWatts: psuWatts(unified, draw),
    powerConnector: powerConnector(gpu, unified, draw),
    slotWidth: slotWidth(unified, draw),
    pcieInterface: pcieInterface(gpu, unified),
    recommendedHostRamGb: ram.recommendedHostRamGb,
    minHostRamGb: ram.minHostRamGb,
    coolingTier: coolingTier(unified, draw),
    isUnifiedOrMobile: unified,
    multiGpuViable: !unified && gpu.runnable === true && finite(gpu.vramGb) >= 24,
    tpsPer100W,
    annualPower4hUsd,
    quantMatrix,
    bestQuantId: bestCleanQuant(quantMatrix),
  };
}
