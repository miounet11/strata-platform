/**
 * Pure, deterministic multi-GPU planning engine.
 * No React, no DOM, no network: only shared tool type/format/URL helpers.
 */
import type { ToolGpuRecord } from "../types.ts";
import { clamp, fmtGb, fmtWatts } from "../format.ts";
import { decodeQuery, encodeQuery, type UrlParams, type UrlSchema } from "../url-state.ts";

export type PlannerRole = "main" | "helper" | "off";

/** One physical slot. `gpu` is resolved from the bundle slug, or null when empty. */
export type PlannerSlot = { id: string; gpu: ToolGpuRecord | null };

export type PlannerInput = {
  slots: PlannerSlot[];
  systemRamGb: number;
  quantId: string;
};

export type PlannedCard = {
  slotId: string;
  gpu: ToolGpuRecord | null;
  role: PlannerRole;
  available: boolean;
  vramGb: number;
  laneWidth: number;
  layerSharePct: number;
  powerWatts: number;
};

export type PlannerResult = {
  cards: PlannedCard[];
  main: PlannedCard | null;
  helpers: PlannedCard[];
  offCards: PlannedCard[];
  /** Sum of VRAM on Main + Helper cards only. */
  combinedVramGb: number;
  /** `--layer-split` ratio in Main-first order; "auto" for a single active card. */
  layerSplit: string;
  /** Fixed `--layer-split` CLI argument (empty when auto). */
  layerSplitArg: string;
  cliCommand: string;
  pcieTopology: string;
  laneWidths: number[];
  totalTdpWatts: number;
  recommendedPsuWatts: number;
  headroomFactor: number;
  estimateNote: string;
  warnings: string[];
};

export const MAX_SLOTS = 4;
/** Non-GPU system draw included in the planning estimate. */
export const SYSTEM_BASE_WATTS = 80;
export const ESTIMATE_NOTE = "规划估算，非实测承诺";
const HELPER_VRAM_FLOOR_GB = 8;

export const QUANT_IDS = [
  "q2_0", "iq2_xs", "iq3_xxs", "iq3_s", "coder", "ud-iq4_xs",
] as const;

export function emptySlot(index: number): PlannerSlot {
  return { id: `slot-${index + 1}`, gpu: null };
}

/** Clamp to a finite, non-negative number; Infinity/NaN become 0. */
function positive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A card can only take part when it has a supported GPU with usable memory. */
export function isCardAvailable(gpu: ToolGpuRecord | null | undefined): boolean {
  if (!gpu) return false;
  if (typeof gpu.slug !== "string" || gpu.slug === "") return false;
  if (gpu.support === "not-supported") return false;
  if (gpu.isUnifiedOrMobile === true) return false;
  if (positive(gpu.vramGb) === 0) return false;
  return true;
}

function speedKey(gpu: ToolGpuRecord): number {
  return positive(gpu.writingTps) * 100 + positive(gpu.readingTps) * 10 + positive(gpu.bandwidthGbs);
}

/**
 * Assign Main/Helper/Off roles and derive VRAM, PCIe, layer and power plans.
 * Ties on speed are resolved by slot order, so the result is stable.
 */
export function planMultiGpu(input: PlannerInput): PlannerResult {
  const slots = (Array.isArray(input.slots) ? input.slots : [])
    .slice(0, MAX_SLOTS)
    .map((slot, index) => ({
      id: typeof slot?.id === "string" && slot.id ? slot.id : `slot-${index + 1}`,
      gpu: slot?.gpu ?? null,
    }));

  const availableIndexes = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isCardAvailable(slot.gpu));

  let mainIndex = -1;
  for (const { slot, index } of availableIndexes) {
    const gpu = slot.gpu as ToolGpuRecord;
    if (mainIndex < 0 || speedKey(gpu) > speedKey(slots[mainIndex]!.gpu as ToolGpuRecord)) {
      mainIndex = index;
    }
  }

  const activeIndexes = availableIndexes
    .filter(({ index }) => index === mainIndex || positive(slots[index]!.gpu!.vramGb) > HELPER_VRAM_FLOOR_GB)
    .map(({ index }) => index);

  const laneWidthsByCount: Record<number, number[]> = {
    0: [],
    1: [16],
    2: [8, 8],
    3: [8, 4, 4],
    4: [8, 4, 4, 4],
  };
  const laneWidths = laneWidthsByCount[availableIndexes.length] ?? [];
  // Only active cards receive lanes; Off cards are physically present but excluded from the split.
  const laneByIndex = new Map(activeIndexes.map((index, order) => [index, laneWidths[order] ?? 0]));

  const activeVrams = activeIndexes.map((index) => Math.max(1, Math.round(positive(slots[index]!.gpu!.vramGb))));
  const vramTotal = activeVrams.reduce((sum, value) => sum + value, 0);
  const layerSplit = activeIndexes.length <= 1 ? "auto" : activeVrams.join(":");
  // Keep the readable ratio (e.g. 24:16) rather than reducing it to 3:2.
  const layerSplitArg = activeIndexes.length > 1 ? `--layer-split ${layerSplit}` : "";
  const cliCommand = `strata run ${layerSplitArg || "--layer-split auto"}`.trim();

  const cards: PlannedCard[] = slots.map((slot, index) => {
    const gpu = slot.gpu;
    const available = isCardAvailable(gpu);
    const active = activeIndexes.includes(index);
    const vramGb = gpu ? positive(gpu.vramGb) : 0;
    return {
      slotId: slot.id,
      gpu,
      role: index === mainIndex ? "main" : active ? "helper" : "off",
      available,
      vramGb,
      laneWidth: laneByIndex.get(index) ?? 0,
      layerSharePct: vramTotal > 0 && active ? round1((vramGb / vramTotal) * 100) : 0,
      powerWatts: available ? positive(gpu?.powerWatts) : 0,
    };
  });

  const activeCards = cards.filter((card) => card.role !== "off");
  const main = cards.find((card) => card.role === "main") ?? null;
  const helpers = cards.filter((card) => card.role === "helper");
  const offCards = cards.filter((card) => card.role === "off");
  const combinedVramGb = round1(activeCards.reduce((sum, card) => sum + card.vramGb, 0));
  const totalTdpWatts = Math.round(activeCards.reduce((sum, card) => sum + card.powerWatts, 0) + SYSTEM_BASE_WATTS);
  const recommendedPsuWatts = Math.ceil((totalTdpWatts * 1.35) / 50) * 50;
  const headroomFactor = 1.35;

  const pcieTopology =
    availableIndexes.length === 0 ? "none" :
    availableIndexes.length === 1 ? "x16" :
    availableIndexes.length === 2 ? "x8+x8" :
    availableIndexes.length === 3 ? "x8+x4+x4" : "x8x4";

  const warnings: string[] = [ESTIMATE_NOTE];
  if (availableIndexes.length === 0) warnings.push("没有可用 GPU；请先在上方槽位选择显卡。");
  if (offCards.some((card) => card.gpu && isCardAvailable(card.gpu))) {
    warnings.push("VRAM ≤ 8 GB 的可用卡已设为 Off；layer-split 不为其分配层数。");
  }
  if (activeCards.length > 1 && activeCards.some((card) => card.gpu?.runtime !== main?.gpu?.runtime)) {
    warnings.push("混插不同运行时的显卡可能需要额外驱动配置。");
  }

  return {
    cards,
    main,
    helpers,
    offCards,
    combinedVramGb,
    layerSplit,
    layerSplitArg,
    cliCommand,
    pcieTopology,
    laneWidths,
    totalTdpWatts,
    recommendedPsuWatts,
    headroomFactor,
    estimateNote: ESTIMATE_NOTE,
    warnings,
  };
}

/** URL state: four GPU slugs, system RAM and quant id. */
export const URL_SCHEMA: UrlSchema = {
  g0: { kind: "string", default: "", alias: "g0" },
  g1: { kind: "string", default: "", alias: "g1" },
  g2: { kind: "string", default: "", alias: "g2" },
  g3: { kind: "string", default: "", alias: "g3" },
  ram: { kind: "number", default: 64, min: 0, max: 2048, alias: "ram" },
  quant: { kind: "enum", default: "iq2_xs", values: QUANT_IDS, alias: "quant" },
} as const;

export type PlannerUrlState = {
  slugs: string[];
  systemRamGb: number;
  quantId: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Only well-formed, distinct GPU slugs are kept; at most MAX_SLOTS. */
export function sanitizeSlugs(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slug of slugs) {
    if (typeof slug !== "string" || !SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length === MAX_SLOTS) break;
  }
  return out;
}

export function decodePlannerUrl(search: string): PlannerUrlState {
  const state = decodeQuery(search, URL_SCHEMA);
  const slugs = sanitizeSlugs([state.g0, state.g1, state.g2, state.g3]);
  const ram = Number(state.ram);
  const quantId = (QUANT_IDS as readonly string[]).includes(String(state.quant))
    ? String(state.quant)
    : "iq2_xs";
  return {
    slugs,
    systemRamGb: Math.round(clamp(Number.isFinite(ram) ? ram : 64, 0, 2048, 64)),
    quantId,
  };
}

export function encodePlannerUrl(input: PlannerInput): string {
  const slugs = sanitizeSlugs(
    input.slots.map((slot) => (slot?.gpu && typeof slot.gpu.slug === "string" ? slot.gpu.slug : "")),
  );
  const params: UrlParams = {
    g0: slugs[0] ?? "",
    g1: slugs[1] ?? "",
    g2: slugs[2] ?? "",
    g3: slugs[3] ?? "",
    ram: clamp(input.systemRamGb, 0, 2048, 64),
    quant: (QUANT_IDS as readonly string[]).includes(input.quantId) ? input.quantId : "iq2_xs",
  };
  return encodeQuery(params, URL_SCHEMA);
}

/** Resolve URL slugs against the bundle, preserving empty slots. */
export function slotsFromUrl(state: PlannerUrlState, bundle: { gpus: ToolGpuRecord[] }): PlannerSlot[] {
  const bySlug = new Map(bundle.gpus.map((gpu) => [gpu.slug, gpu]));
  const slots = Array.from({ length: MAX_SLOTS }, (_, index) => {
    const slug = state.slugs[index] ?? "";
    return { id: `slot-${index + 1}`, gpu: bySlug.get(slug) ?? null };
  });
  const compact = slots.filter((slot) => slot.gpu !== null);
  return compact.length > 0 ? compact : [emptySlot(0)];
}

export function formatPlanSummary(result: PlannerResult): string {
  return `${fmtGb(result.combinedVramGb)} pooled · ${result.pcieTopology} · ${fmtWatts(result.recommendedPsuWatts)} PSU · ${result.estimateNote}`;
}
