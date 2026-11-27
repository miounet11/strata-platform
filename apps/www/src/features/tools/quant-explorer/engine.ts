/**
 * Deterministic quant trade-off engine for the quant-explorer tool.
 * All estimates are transparent formulas over the shipped catalogue; no
 * benchmarks, randomness or environment state are invented here.
 */
import type { ToolGpuRecord, ToolVariantRecord } from "../types.ts";
import { clamp } from "../format.ts";
import type { UrlSchema } from "../url-state.ts";

export type ContextK = 8 | 32 | 64 | 128;
export const CONTEXT_OPTIONS: readonly ContextK[] = [8, 32, 64, 128] as const;
export const RAM_MIN = 16;
export const RAM_MAX = 256;

export type FitStatus = "full-vram" | "hybrid-offload" | "needs-ram";

const Q2_BASELINE_TPS = 94;
/** Context cache that must fit alongside weights; ~0.12 GB per 1K tokens at this MoE depth. */
const GB_PER_CONTEXT_K = 0.12;
/** Headroom held back from VRAM for activations and runtime allocations. */
const VRAM_HEADROOM_GB = 2;
/** PCIe/shared-memory penalty applied to layers moved out of VRAM. */
const OFFLOAD_PENALTY = 0.38;
const MIN_OFFLOAD_SCALE = 0.62;
/** Host RAM overhead for runtime, OS and offload bookkeeping. */
const RAM_OVERHEAD_GB = 4;

const QUALITY_ORDER = ["ud-iq4_xs", "iq3_s", "iq3_xxs", "iq2_xs", "q2_0", "coder"] as const;

type QualityLadderEntry = {
  id: string;
  tier: number;
  description: string;
};

/** Ordered 1–5 quality steps. Higher tier = richer quant; never a benchmark score. */
export const QUALITY_LADDER: readonly QualityLadderEntry[] = [
  { id: "coder", tier: 1, description: " specialised code pack; leanest general-text quality" },
  { id: "q2_0", tier: 2, description: " fastest pack; largest quality sacrifice" },
  { id: "iq2_xs", tier: 3, description: " balanced everyday default" },
  { id: "iq3_xxs", tier: 4, description: " stronger reasoning, moderate speed cost" },
  { id: "iq3_s", tier: 5, description: " richest pack that still fits 64 GB RAM" },
  { id: "ud-iq4_xs", tier: 5, description: " ~4-bit Unsloth pack; top fidelity, needs the most RAM" },
];

const QUALITY_BY_ID = new Map(QUALITY_LADDER.map((entry) => [entry.id, entry]));

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function positive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function qualityFor(variant: ToolVariantRecord): QualityLadderEntry {
  const known = QUALITY_BY_ID.get(variant.id) ?? QUALITY_BY_ID.get(variant.name.toLowerCase());
  if (known) return known;
  const rank = QUALITY_ORDER.indexOf(variant.id as (typeof QUALITY_ORDER)[number]);
  const tier = rank === -1 ? 3 : 6 - Math.min(5, rank);
  return { id: variant.id, tier, description: " catalogue quant; tier follows the shipped ordering" };
}

export type QuantEvaluation = {
  id: string;
  name: string;
  description: string;
  tags: readonly string[];
  downloadGb: number;
  ramFloorGb: number;
  vramFloorGb: number;
  contextCacheGb: number;
  estWriteTps: number;
  qualityTier: number;
  qualityNote: string;
  fitStatus: FitStatus;
  fitReason: string;
};

export type QuantEnvironment = {
  gpu: ToolGpuRecord;
  systemRamGb: number;
  contextK: ContextK;
};

/** Normalize external inputs so callers can pass decoded URLs or hand-edited state. */
export function normalizeEnvironment(
  gpu: ToolGpuRecord | undefined,
  systemRamGb: number,
  contextK: number,
): QuantEnvironment | null {
  if (!gpu) return null;
  const ram = clamp(systemRamGb, RAM_MIN, RAM_MAX, RAM_MIN);
  const ctx = (CONTEXT_OPTIONS as readonly number[]).includes(contextK)
    ? (contextK as ContextK)
    : 8;
  return { gpu, systemRamGb: ram, contextK: ctx };
}

/**
 * Evaluate one shipped quant under a GPU/RAM/context combination.
 * Missing or malformed catalogue rows are ignored by evaluatePacks, never guessed.
 */
export function evaluateVariant(variant: ToolVariantRecord, env: QuantEnvironment): QuantEvaluation {
  const downloadGb = round1(positive(variant.downloadGb));
  const vramFloorGb = round1(positive(variant.vramGbMin));
  const ramFloorGb = round1(positive(variant.ramGbMin));
  const contextCacheGb = round1(env.contextK * GB_PER_CONTEXT_K);
  const effectiveVramFloor = round1(vramFloorGb + contextCacheGb);
  const effectiveRamFloor = round1(ramFloorGb + RAM_OVERHEAD_GB + contextCacheGb);
  const vram = positive(env.gpu.vramGb);
  const ram = clamp(env.systemRamGb, RAM_MIN, RAM_MAX, RAM_MIN);
  const quality = qualityFor(variant);

  let fitStatus: FitStatus;
  let fitReason: string;
  if (ram < effectiveRamFloor) {
    fitStatus = "needs-ram";
    fitReason = `needs ~${round1(effectiveRamFloor)} GB system RAM at ${env.contextK}K context`;
  } else if (vram < effectiveVramFloor) {
    fitStatus = "needs-ram";
    fitReason = `GPU needs ~${round1(effectiveVramFloor)} GB VRAM; only ${round1(vram)} GB available`;
  } else if (vram >= round1(downloadGb + contextCacheGb + VRAM_HEADROOM_GB)) {
    fitStatus = "full-vram";
    fitReason = "weights and context cache fit entirely in VRAM";
  } else {
    fitStatus = "hybrid-offload";
    fitReason = "partial CPU offload; host RAM covers the remainder";
  }

  const baseline = positive(variant.outputTps5070);
  const speedFactor = baseline > 0 ? baseline / Q2_BASELINE_TPS : 1;
  const gpuWrite = positive(env.gpu.writingTps);
  let estWriteTps = round1(gpuWrite * speedFactor);
  if (fitStatus === "hybrid-offload") {
    const usableVram = Math.max(0, vram - VRAM_HEADROOM_GB);
    const workingSet = downloadGb + contextCacheGb;
    const offloadGb = Math.max(0, workingSet - usableVram);
    const ratio = workingSet > 0 ? offloadGb / workingSet : 0;
    const scale = Math.max(MIN_OFFLOAD_SCALE, 1 - OFFLOAD_PENALTY * ratio);
    estWriteTps = round1(estWriteTps * scale);
  } else if (fitStatus === "needs-ram") {
    estWriteTps = 0;
  }

  return {
    id: variant.id,
    name: variant.name,
    description: variant.description,
    tags: variant.tags,
    downloadGb,
    ramFloorGb: effectiveRamFloor,
    vramFloorGb: effectiveVramFloor,
    contextCacheGb,
    estWriteTps,
    qualityTier: quality.tier,
    qualityNote: quality.description,
    fitStatus,
    fitReason,
  };
}

/** Evaluate every shipped variant in stable catalogue order. */
export function evaluatePacks(variants: readonly ToolVariantRecord[], env: QuantEnvironment): QuantEvaluation[] {
  return variants.map((variant) => evaluateVariant(variant, env));
}

export type PackComparison = {
  a: QuantEvaluation | null;
  b: QuantEvaluation | null;
  speedDeltaPct: number;
  /** B minus A in GB. Positive means B is larger. */
  sizeDeltaGb: number;
  /** B minus A in GB. Positive means B needs more RAM. */
  ramDeltaGb: number;
  recommendedChoice: "a" | "b" | null;
  reason: string;
};

/** Compare two evaluated packs; missing ids yield a null side and a neutral comparison. */
export function comparePacks(
  evaluations: readonly QuantEvaluation[],
  idA: string | null | undefined,
  idB: string | null | undefined,
): PackComparison {
  const a = evaluations.find((row) => row.id === idA) ?? null;
  const b = evaluations.find((row) => row.id === idB) ?? null;
  const base: PackComparison = {
    a,
    b,
    speedDeltaPct: 0,
    sizeDeltaGb: 0,
    ramDeltaGb: 0,
    recommendedChoice: null,
    reason: "Select two different quant packs to see a comparison.",
  };
  if (!a || !b) return base;
  if (a.id === b.id) {
    return { ...base, reason: "Both slots hold the same pack; pick a different quant to compare." };
  }

  const speedDeltaPct = a.estWriteTps > 0 ? round1(((b.estWriteTps - a.estWriteTps) / a.estWriteTps) * 100) : 0;
  const sizeDeltaGb = round1(b.downloadGb - a.downloadGb);
  const ramDeltaGb = round1(b.ramFloorGb - a.ramFloorGb);

  let recommendedChoice: "a" | "b";
  let reason: string;
  if (a.fitStatus !== b.fitStatus) {
    const rank: Record<FitStatus, number> = { "full-vram": 3, "hybrid-offload": 2, "needs-ram": 1 };
    recommendedChoice = rank[a.fitStatus] >= rank[b.fitStatus] ? "a" : "b";
    reason = `The recommended pack has the better fit status (${a.fitStatus} vs ${b.fitStatus}); the other needs more offload or extra memory.`;
  } else if (speedDeltaPct !== 0) {
    recommendedChoice = speedDeltaPct > 0 ? "b" : "a";
    reason = `${Math.abs(speedDeltaPct)}% estimated generation speed difference at equal fit status.`;
  } else if (sizeDeltaGb !== 0) {
    recommendedChoice = sizeDeltaGb < 0 ? "b" : "a";
    reason = `Same speed; the recommended pack downloads ${Math.abs(sizeDeltaGb)} GB less.`;
  } else if (b.qualityTier !== a.qualityTier) {
    recommendedChoice = b.qualityTier > a.qualityTier ? "b" : "a";
    reason = "Same speed and size; the higher quality tier wins.";
  } else {
    recommendedChoice = "a";
    reason = "Both packs are effectively tied on these inputs.";
  }

  return { a, b, speedDeltaPct, sizeDeltaGb, ramDeltaGb, recommendedChoice, reason };
}

/** URL state keys for the quant-explorer share link. */
export const URL_SCHEMA = {
  gpu: { kind: "string", default: "" },
  ram: { kind: "number", default: 64, min: RAM_MIN, max: RAM_MAX },
  ctx: { kind: "enum", default: "32", values: ["8", "32", "64", "128"] },
  a: { kind: "string", default: "" },
  b: { kind: "string", default: "" },
} as const satisfies UrlSchema;
