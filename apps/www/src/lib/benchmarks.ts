import benchData from "@/data/benchmarks.json";

export type BenchmarkRig = (typeof benchData.rigs)[number];

export type Workload = {
  readingShare: number;
  activeHours: number;
  electricityPerKwh: number;
  hardwareLifeYears: number;
  apiReadingPerMM: number;
  apiWritingPerMM: number;
};

export type Economics = {
  capacityMTokDay: number | null;
  localCostPerMM: number | null;
  energyPerDay: number | null;
  apiValuePerDay: number | null;
  breakEvenDays: number | null;
};

export function getBenchmarks() {
  return benchData;
}

export function getRigs(): BenchmarkRig[] {
  return benchData.rigs;
}

export function getRig(id: string): BenchmarkRig | undefined {
  return benchData.rigs.find((r) => r.id === id);
}

export function defaultWorkload(): Workload {
  const d = benchData.defaults;
  return {
    readingShare: d.readingShare,
    activeHours: d.activeHours,
    electricityPerKwh: d.electricityPerKwh,
    hardwareLifeYears: d.hardwareLifeYears,
    apiReadingPerMM: d.apiReadingPerMM,
    apiWritingPerMM: d.apiWritingPerMM,
  };
}

/**
 * Sequential single-stream mix: time = readTokens/readRate + writeTokens/writeRate.
 * At 90/10 and 24h this matches the published capacity column (RTX 4090 → 75.8 M tok/day).
 */
export function computeEconomics(rig: BenchmarkRig, workload: Workload): Economics {
  const readShare = clamp(finite(workload.readingShare, 0.9), 0, 1);
  const writeShare = 1 - readShare;
  const hours = Math.max(0, finite(workload.activeHours));
  const readRate = rig.readingToks;
  const writeRate = rig.writingToks;

  let capacityMTokDay: number | null = null;
  if (hours > 0 && readRate > 0 && writeRate > 0) {
    const secondsPerToken =
      (readShare > 0 ? readShare / readRate : 0) + (writeShare > 0 ? writeShare / writeRate : 0);
    if (secondsPerToken > 0) {
      capacityMTokDay = (hours * 3600) / secondsPerToken / 1e6;
    }
  }

  const energyPerDay =
    (rig.powerWatts / 1000) * hours * Math.max(0, finite(workload.electricityPerKwh, 0.15));
  const blend =
    readShare * Math.max(0, finite(workload.apiReadingPerMM, 0.1)) +
    writeShare * Math.max(0, finite(workload.apiWritingPerMM, 0.64));
  const apiValuePerDay = capacityMTokDay == null ? null : capacityMTokDay * Math.max(0, blend);

  const lifeDays =
    Math.max(0.1, finite(workload.hardwareLifeYears, benchData.defaults.hardwareLifeYears)) *
    benchData.defaults.daysPerYear;
  const hardwarePerDay = rig.rigTotal == null ? null : rig.rigTotal / lifeDays;
  const localCostPerMM =
    capacityMTokDay != null && capacityMTokDay > 0 && hardwarePerDay != null
      ? (energyPerDay + hardwarePerDay) / capacityMTokDay
      : null;

  const net = apiValuePerDay == null ? null : apiValuePerDay - energyPerDay;
  const breakEvenDays =
    rig.rigTotal != null && net != null && net > 0 ? Math.round(rig.rigTotal / net) : null;

  return { capacityMTokDay, localCostPerMM, energyPerDay, apiValuePerDay, breakEvenDays };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function finite(n: number, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}
