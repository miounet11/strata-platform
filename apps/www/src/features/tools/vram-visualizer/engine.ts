/**
 * Pure, deterministic VRAM / RAM / KV-cache / SSD-offload allocation simulator.
 *
 * The engine intentionally keeps value semantics (plain numbers/strings only), so it
 * runs identically in the browser, in `node --test`, and during SSR. It imports only
 * the shared tool format/URL helpers and the bundle type; no React, no browser globals.
 */
import type { ToolsBundle } from "../types.ts";
import { clamp, fmtGb, fmtTps } from "../format.ts";
import { decodeQuery, encodeQuery, type UrlParams, type UrlSchema } from "../url-state.ts";

export type ContextWindowK = 8 | 32 | 64 | 128;
export type KvPrecision = "q8_0" | "fp16" | "q4_0";
export type EngineFamily = "strata-engine" | "strata-hy4" | "strata-inkling";
export type OverflowTier = "none" | "ram-offload" | "ssd-offload" | "insufficient";

export type VramSimInput = {
  gpuSlug: string;
  vramGb: number;
  ramGb: number;
  unifiedMemory: boolean;
  quantId: string;
  contextK: ContextWindowK;
  kvPrecision: KvPrecision;
  engineFamily: EngineFamily;
};

export type VramSimResult = {
  vramWeightsGb: number;
  vramKvGb: number;
  ramOffloadGb: number;
  ssdOffloadGb: number;
  vramCapacityGb: number;
  ramCapacityGb: number;
  vramHeadroomGb: number;
  ramHeadroomGb: number;
  overflowTier: OverflowTier;
  estWriteTps: number;
  recommendedFlags: string[];
  cliCommand: string;
  warnings: string[];
};

export type QuantSpec = {
  id: string;
  label: string;
  /** Footprint (GB) of the model weights alone; the six real catalog packs. */
  weightsGb: number;
  /** Relative memory bandwidth efficiency; 1.0 = IQ2_XS baseline (~79 tok/s on RTX 5070). */
  speedFactor: number;
  kvFactor: number;
};

export const QUANT_SPECS: readonly QuantSpec[] = [
  { id: "q2_0", label: "Q2_0", weightsGb: 58, speedFactor: 94 / 79, kvFactor: 1 },
  { id: "iq2_xs", label: "IQ2_XS", weightsGb: 58, speedFactor: 1, kvFactor: 1 },
  { id: "iq3_xxs", label: "IQ3_XXS", weightsGb: 72, speedFactor: 62 / 79, kvFactor: 1 },
  { id: "iq3_s", label: "IQ3_S", weightsGb: 78, speedFactor: 53 / 79, kvFactor: 1 },
  { id: "coder", label: "Coder", weightsGb: 68, speedFactor: 55 / 79, kvFactor: 1 },
  { id: "ud-iq4_xs", label: "UD-IQ4_XS", weightsGb: 94, speedFactor: 45 / 79, kvFactor: 1 },
] as const;

export type EngineSpec = {
  id: EngineFamily;
  label: string;
  /** Peak usable fraction of dedicated VRAM (driver/CUDA context reserve). */
  vramFactor: number;
  /** Peak usable fraction of system RAM (OS + browser reserve). */
  ramFactor: number;
  /** Native throughput multiplier for the engine family. */
  speedFactor: number;
  /** Reserved pool for unified-memory systems (OS/display). */
  unifiedReserve: number;
};

export const ENGINE_SPECS: readonly EngineSpec[] = [
  { id: "strata-engine", label: "Strata Engine", vramFactor: 0.92, ramFactor: 0.86, speedFactor: 1, unifiedReserve: 0.18 },
  { id: "strata-hy4", label: "Strata HY4", vramFactor: 0.9, ramFactor: 0.88, speedFactor: 1.12, unifiedReserve: 0.16 },
  { id: "strata-inkling", label: "Strata Inkling", vramFactor: 0.94, ramFactor: 0.82, speedFactor: 0.82, unifiedReserve: 0.2 },
] as const;

/** Baseline KV-cache allowance (Q8_0) for the 125B-class MoE model. */
export const KV_BYTES_PER_TOKEN_GB = 0.0001103515625; // 14 GB / 128K tokens

export const KV_PRECISION_LABELS: Record<KvPrecision, string> = {
  q8_0: "Q8_0",
  fp16: "FP16",
  q4_0: "Q4_0",
};

const KV_PRECISION_FACTORS: Record<KvPrecision, number> = {
  q8_0: 1,
  fp16: 2,
  q4_0: 0.5,
};

const CONTEXT_VALUES: readonly ContextWindowK[] = [8, 32, 64, 128];
const QUANT_IDS: readonly string[] = QUANT_SPECS.map((spec) => spec.id);
const ENGINE_IDS: readonly string[] = ENGINE_SPECS.map((spec) => spec.id);
const KV_PRECISIONS: readonly KvPrecision[] = ["q8_0", "fp16", "q4_0"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Clamp to a finite, non-negative GB value (Infinity → 0, NaN → 0). */
function gb(value: number, ceiling = 4096): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return round2(clamp(value, 0, ceiling, 0));
}

export function quantSpec(id: string): QuantSpec {
  return QUANT_SPECS.find((spec) => spec.id === id) ?? QUANT_SPECS[1]!;
}

export function engineSpec(id: string): EngineSpec {
  return ENGINE_SPECS.find((spec) => spec.id === id) ?? ENGINE_SPECS[0]!;
}

export function kvCacheGb(contextK: ContextWindowK, precision: KvPrecision, quantId?: string): number {
  const context = CONTEXT_VALUES.includes(contextK) ? contextK : 8;
  const factor = KV_PRECISION_FACTORS[precision] ?? 1;
  const quant = quantId ? quantSpec(quantId) : null;
  return round2(context * 1024 * KV_BYTES_PER_TOKEN_GB * factor * (quant?.kvFactor ?? 1));
}

/** Pick a GPU preset from the server-provided bundle by GPU slug. */
export function findGpu(bundle: ToolsBundle, slug: string) {
  return bundle.gpus.find((gpu) => gpu.slug === slug) ?? bundle.gpus[0] ?? null;
}

/**
 * Allocate a 125B-class MoE model across four tiers:
 *   1. GPU VRAM: weights first, then KV-cache while headroom allows.
 *   2. System RAM: weights that do not fit in VRAM; KV spills here when VRAM is full.
 *   3. SSD: whatever still cannot fit in RAM (partial PLE offload).
 *   4. Insufficient: even RAM + SSD cannot cover the working set (warning only).
 */
export function simulateVram(input: VramSimInput): VramSimResult {
  const quant = quantSpec(input.quantId);
  const engine = engineSpec(input.engineFamily);
  const precision = KV_PRECISIONS.includes(input.kvPrecision) ? input.kvPrecision : "q8_0";
  const context = CONTEXT_VALUES.includes(input.contextK) ? input.contextK : 8;
  const unified = input.unifiedMemory === true;

  const rawVram = gb(input.vramGb);
  const rawRam = gb(input.ramGb);
  const vramCapacityGb = gb(rawVram * engine.vramFactor);
  const reservedGb = unified ? round2(rawVram * engine.unifiedReserve) : 0;
  const ramCapacityGb = unified
    ? gb((rawVram - reservedGb) * engine.ramFactor)
    : gb(rawRam * engine.ramFactor);

  const weightsGb = gb(quant.weightsGb);
  const kvGb = kvCacheGb(context, precision, quant.id);

  // Weights first; KV may also live in VRAM while any usable headroom remains.
  const vramWeightsGb = gb(Math.min(weightsGb, vramCapacityGb));
  const vramKvGb = gb(Math.min(kvGb, Math.max(0, vramCapacityGb - vramWeightsGb)));
  const ramOffloadGb = gb(Math.min(weightsGb - vramWeightsGb, ramCapacityGb));
  // When VRAM is saturated by weights, KV competes with the remaining RAM allowance.
  const kvToRam = gb(kvGb - vramKvGb);
  const ramLeftAfterWeights = gb(Math.max(0, ramCapacityGb - ramOffloadGb));
  const ramKvGb = gb(Math.min(kvToRam, ramLeftAfterWeights));
  const ssdOffloadGb = gb(
    Math.max(0, weightsGb - vramWeightsGb - ramOffloadGb) + Math.max(0, kvToRam - ramKvGb),
  );

  const vramHeadroomGb = gb(Math.max(0, vramCapacityGb - vramWeightsGb - vramKvGb));
  const ramHeadroomGb = gb(Math.max(0, ramCapacityGb - ramOffloadGb - ramKvGb));
  const unfittedGb = gb(Math.max(0, weightsGb + kvGb - vramCapacityGb - ramCapacityGb - 1000));

  let overflowTier: OverflowTier = "none";
  if (unfittedGb > 0) overflowTier = "insufficient";
  else if (ssdOffloadGb > 0) overflowTier = "ssd-offload";
  else if (ramOffloadGb > 0 || ramKvGb > 0) overflowTier = "ram-offload";

  // Throughput: bandwidth-bound generation scales with the fraction of weights that
  // stay in VRAM; RAM/SSD offload incurs a further latency penalty.
  const effectiveVramGb = unified ? rawVram - reservedGb : rawVram;
  const bandwidth = Math.max(0, effectiveVramGb) * 42; // GB/s, typical consumer-class floor
  const baseTps = bandwidth * 0.095 * quant.speedFactor * engine.speedFactor;
  const vramShare = weightsGb > 0 ? (vramWeightsGb + Math.min(vramKvGb, Math.max(0, vramCapacityGb - vramWeightsGb))) / (weightsGb + kvGb) : 1;
  const offloadPenalty =
    overflowTier === "ssd-offload" ? 0.22 : overflowTier === "ram-offload" ? 0.65 : overflowTier === "insufficient" ? 0.1 : 1;
  const estWriteTps = round2(Math.max(0, baseTps * clamp(vramShare, 0, 1, 1) * offloadPenalty));

  const recommendedFlags: string[] = [
    `--quant ${quant.id}`,
    `--kv ${precision}`,
    `--ctx ${context}k`,
    `--engine ${engine.id}`,
  ];
  if (ramKvGb > 0 || ramOffloadGb > 0) recommendedFlags.push("--ram-offload");
  if (ssdOffloadGb > 0) recommendedFlags.push("--ple-io");
  if (unified) recommendedFlags.push("--unified-memory");
  if (precision === "fp16" && overflowTier !== "none") recommendedFlags.push("--kv q8_0");

  const cliCommand = `strata run ${input.gpuSlug || "auto"} ${recommendedFlags.join(" ")}`;

  const warnings: string[] = [];
  if (unified) warnings.push(`Unified memory reserves ${fmtGb(reservedGb)} for OS/display; usable pool is ${fmtGb(ramCapacityGb)}.`);
  if (overflowTier === "ram-offload") {
    warnings.push(`Partial RAM offload of ${fmtGb(ramOffloadGb + ramKvGb)}; expect reduced throughput.`);
  }
  if (overflowTier === "ssd-offload") {
    warnings.push(`SSD PLE offload of ${fmtGb(ssdOffloadGb)} is active; generation will be latency-bound.`);
  }
  if (overflowTier === "insufficient") {
    warnings.push(`Working set exceeds all tiers by ${fmtGb(unfittedGb)}; reduce context or use a smaller quant.`);
  }
  if (vramHeadroomGb < 1 && overflowTier === "none") {
    warnings.push("VRAM headroom below 1 GB; longer context may spill to RAM.");
  }
  if (precision === "fp16") warnings.push("FP16 KV doubles cache; Q8_0 halves it with minimal quality loss.");
  if (estWriteTps < 5) warnings.push(`Estimated throughput ${fmtTps(estWriteTps)} is below interactive threshold.`);

  return {
    vramWeightsGb,
    vramKvGb,
    ramOffloadGb,
    ssdOffloadGb,
    vramCapacityGb,
    ramCapacityGb,
    vramHeadroomGb,
    ramHeadroomGb,
    overflowTier,
    estWriteTps,
    recommendedFlags,
    cliCommand,
    warnings,
  };
}

/** URL query schema; aliases keep shared links short and readable. */
export const URL_SCHEMA: UrlSchema = {
  gpu: { kind: "string", default: "auto", alias: "gpu" },
  vram: { kind: "number", default: 24, alias: "vram", min: 0, max: 1024 },
  ram: { kind: "number", default: 64, alias: "ram", min: 0, max: 2048 },
  unified: { kind: "boolean", default: false, alias: "unified" },
  quant: { kind: "enum", default: "iq2_xs", alias: "quant", values: QUANT_IDS },
  context: { kind: "enum", default: "32", alias: "ctx", values: CONTEXT_VALUES.map(String) },
  kv: { kind: "enum", default: "q8_0", alias: "kv", values: KV_PRECISIONS },
  engine: { kind: "enum", default: "strata-engine", alias: "engine", values: ENGINE_IDS },
} as const;

export type VramUrlState = {
  gpu: string;
  vram: number;
  ram: number;
  unified: boolean;
  quant: string;
  context: string;
  kv: string;
  engine: string;
};

/** Decode with per-key fallbacks; unknown enums, negative numbers and NaN never escape. */
export function decodeVramUrl(search: string): VramUrlState {
  const state = decodeQuery(search, URL_SCHEMA);
  return {
    gpu: typeof state.gpu === "string" && state.gpu !== "auto" ? state.gpu : "auto",
    vram: clamp(Number(state.vram), 0, 1024, 24),
    ram: clamp(Number(state.ram), 0, 2048, 64),
    unified: Boolean(state.unified) && String(state.unified) !== "false" && String(state.unified) !== "0",
    quant: quantSpec(String(state.quant)).id,
    context: CONTEXT_VALUES.map(String).includes(String(state.context)) ? String(state.context) : "32",
    kv: KV_PRECISIONS.includes(state.kv as KvPrecision) ? state.kv : "q8_0",
    engine: engineSpec(String(state.engine)).id,
  };
}

/** Encode only values differing from defaults; stable key order via the shared schema. */
export function encodeVramUrl(input: VramSimInput): string {
  const params: UrlParams = {
    gpu: input.gpuSlug,
    vram: input.vramGb,
    ram: input.ramGb,
    unified: input.unifiedMemory,
    quant: input.quantId,
    context: String(input.contextK),
    kv: input.kvPrecision,
    engine: input.engineFamily,
  };
  return encodeQuery(params, URL_SCHEMA);
}

/** Build a full VramSimInput from decoded URL state and a known GPU catalog. */
export function inputFromUrlState(state: VramUrlState, bundle: ToolsBundle): VramSimInput {
  const gpu = findGpu(bundle, state.gpu);
  return {
    gpuSlug: gpu?.slug ?? "auto",
    vramGb: gpu && !state.gpu.startsWith("custom") ? gpu.vramGb : state.vram,
    ramGb: state.ram,
    unifiedMemory: state.unified || gpu?.isUnifiedOrMobile === true,
    quantId: quantSpec(state.quant).id,
    contextK: (CONTEXT_VALUES.map(String).includes(state.context) ? Number(state.context) : 32) as ContextWindowK,
    kvPrecision: KV_PRECISIONS.includes(state.kv as KvPrecision) ? (state.kv as KvPrecision) : "q8_0",
    engineFamily: engineSpec(state.engine).id,
  };
}
