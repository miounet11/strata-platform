import pulse from "@/data/intelligence-pulse.json";
import { readDataJson } from "@/lib/data-file";

export type IntelligenceSignal = (typeof pulse.signals)[number];

export type GpuQuote = {
  id: string;
  model: string;
  amount: number;
  currency: string;
  asOf: string;
  sourceUrl: string;
  sourceAuthor: string;
  snippet: string;
  confidence: string;
};

type PulseData = typeof pulse & {
  xLatest?: IntelligenceSignal[];
  comparisons?: IntelligenceSignal[];
  upgradeNotes?: IntelligenceSignal[];
  meta: typeof pulse.meta & {
    intake?: {
      plan?: string;
      provider?: string;
      fresh?: number;
      jobs?: number;
      gatewaySkipped?: boolean;
    };
  };
};

function load(): PulseData {
  return readDataJson("intelligence-pulse.json", pulse) as PulseData;
}

export function getIntelligencePulse() {
  return load();
}

export function latestSignals(limit = 40) {
  return load().signals.slice(0, limit);
}

export function latestXSignals(limit = 35) {
  const data = load();
  if (data.xLatest?.length) return data.xLatest.slice(0, limit);
  return data.signals.filter((s) => s.source !== "github-community").slice(0, limit);
}

export function comparisonSignals(limit = 25) {
  const data = load();
  if (data.comparisons?.length) return data.comparisons.slice(0, limit);
  return data.signals
    .filter((s) => s.tags?.includes("comparison") || s.topics?.includes("comparison"))
    .slice(0, limit);
}

export function upgradeSignals(limit = 25) {
  const data = load();
  if (data.upgradeNotes?.length) return data.upgradeNotes.slice(0, limit);
  return data.signals
    .filter((s) => s.tags?.includes("upgrade") || s.topics?.includes("upgrade"))
    .slice(0, limit);
}

export function latestGpuQuotes(limit = 30): GpuQuote[] {
  return (load().gpuQuotes as GpuQuote[]).slice(0, limit);
}

const OFFICIAL = new Set(["coldniko", "niko1221"]);

export function isXSignal(signal: { id: string }) {
  return signal.id.startsWith("x-") || signal.id.startsWith("gw-");
}

/** Short @replies carry almost no deploy or benchmark information. */
export function isThinReply(signal: { title?: string }) {
  const title = (signal.title ?? "").replace(/\s+/g, " ").trim();
  if (!title.startsWith("@")) return false;
  if (title.length >= 120) return false;
  if (/tok\/s|v0\.|benchmark|intel arc|gpu|rtx|qwen/i.test(title)) return false;
  return true;
}

export function presentSignals<T extends { title?: string }>(items: T[]) {
  return items.filter((item) => !isThinReply(item));
}

export function newestXAt() {
  let newest = "";
  for (const signal of load().signals) {
    if (!isXSignal(signal)) continue;
    if (signal.publishedAt > newest) newest = signal.publishedAt;
  }
  return newest || null;
}

function readScore(signal: IntelligenceSignal) {
  const ageH = (Date.now() - new Date(signal.publishedAt).getTime()) / 36e5;
  let score = ageH <= 6 ? 12 : ageH <= 18 ? 8 : ageH <= 48 ? 3 : -2;
  const author = (signal.author ?? "").toLowerCase();
  if (OFFICIAL.has(author)) score += 3;
  if (signal.tags?.includes("upgrade")) score += 2;
  if (signal.tags?.includes("benchmark") || signal.tags?.includes("comparison")) score += 2;
  const title = signal.title ?? "";
  if (title.startsWith("@")) score -= 2;
  if (title.length < 50) score -= 2;
  return score;
}

/** Recent posts with a concrete claim, official notes first. */
export function worthReading(limit = 4) {
  return load().signals
    .filter((signal) => isXSignal(signal) && !isThinReply(signal))
    .map((signal) => ({ signal, score: readScore(signal) }))
    .sort((a, b) => b.score - a.score || b.signal.publishedAt.localeCompare(a.signal.publishedAt))
    .slice(0, limit)
    .map((row) => row.signal);
}
