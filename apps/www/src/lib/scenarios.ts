import { getRigs, type BenchmarkRig } from "@/lib/benchmarks";

/**
 * Scenario lists: the "which one should I buy for X" pages.
 *
 * Every list is a pure function of `benchmarks.json`. No editor picks the winner, so a list cannot
 * contradict the table it links to, and adding a rig to the data adds it to the lists.
 */
export type Scenario = {
  slug: string;
  /** Translation key under `scenarios.items.<key>`. */
  key: string;
  /** Rigs that qualify, in ranking order. */
  pick: (rigs: BenchmarkRig[]) => BenchmarkRig[];
  /** The rule, as a value the page can render and a crawler can read. */
  rank: "cheapest-cost" | "cheapest-rig" | "lowest-power" | "fastest-write" | "fastest-payback" | "highest-memory";
};

const MEASURED = (rig: BenchmarkRig) => rig.rigTotal != null && rig.breakEvenDays != null;
const IS_MULTI_GPU = (rig: BenchmarkRig) =>
  /^2[×x]\s/i.test(rig.name) || /dual-card/i.test(rig.form);

export const SCENARIOS: Scenario[] = [
  {
    slug: "best-value-local-llm-gpu",
    key: "value",
    rank: "cheapest-cost",
    pick: (rigs) =>
      rigs
        .filter((rig) => MEASURED(rig) && rig.localCostPerMM != null && rig.localCostPerMM > 0)
        .sort((a, b) => (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0))
        .slice(0, 6),
  },
  {
    slug: "local-llm-under-2000",
    key: "under2000",
    rank: "cheapest-rig",
    pick: (rigs) =>
      rigs
        .filter((rig) => MEASURED(rig) && (rig.rigTotal ?? 0) > 0 && (rig.rigTotal ?? 0) <= 2000)
        .sort((a, b) => (a.rigTotal ?? 0) - (b.rigTotal ?? 0)),
  },
  {
    slug: "quiet-low-power-local-llm-rig",
    key: "lowPower",
    rank: "lowest-power",
    pick: (rigs) =>
      rigs
        .filter((rig) => MEASURED(rig) && rig.powerWatts > 0)
        .sort((a, b) => a.powerWatts - b.powerWatts)
        .slice(0, 6),
  },
  {
    slug: "apple-silicon-local-llm",
    key: "apple",
    rank: "cheapest-cost",
    pick: (rigs) =>
      rigs
        .filter((rig) => rig.vendor === "apple" && MEASURED(rig))
        .sort((a, b) => (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0)),
  },
  {
    // Generation speed (writingToks) is what a user actually feels in interactive chat/coding.
    slug: "fastest-local-llm-gpu",
    key: "fastest",
    rank: "fastest-write",
    pick: (rigs) =>
      rigs
        .filter((rig) => rig.writingToks > 0)
        .sort((a, b) => b.writingToks - a.writingToks || b.readingToks - a.readingToks)
        .slice(0, 8),
  },
  {
    // Payback days vs unit cost diverge: RTX 4090 has the lowest $/M tok, but RX 7900 XTX / RTX 5080
    // break even faster because of lower upfront rig cost.
    slug: "fastest-payback-local-llm",
    key: "fastPayback",
    rank: "fastest-payback",
    pick: (rigs) =>
      rigs
        .filter((rig) => MEASURED(rig) && (rig.breakEvenDays ?? 0) > 0)
        .sort((a, b) => (a.breakEvenDays ?? 0) - (b.breakEvenDays ?? 0))
        .slice(0, 8),
  },
  {
    // Dual-GPU rigs: high combined VRAM at lower outlay than workstation cards.
    slug: "best-multi-gpu-local-llm",
    key: "multiGpu",
    rank: "cheapest-cost",
    pick: (rigs) =>
      rigs
        .filter((rig) => IS_MULTI_GPU(rig) && MEASURED(rig))
        .sort((a, b) => (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0)),
  },
  {
    // AMD discrete + Strix Halo unified memory rigs on HIP / ROCm.
    slug: "best-amd-gpu-local-llm",
    key: "amd",
    rank: "cheapest-cost",
    pick: (rigs) =>
      rigs
        .filter((rig) => rig.vendor === "amd" && MEASURED(rig))
        .sort((a, b) => (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0)),
  },
  {
    // High-memory rigs (48 GB–512 GB) for 4-bit weights and 128K context without aggressive offloading.
    slug: "best-high-vram-local-llm",
    key: "highVram",
    rank: "highest-memory",
    pick: (rigs) =>
      rigs
        .filter((rig) => rig.memory >= 48 && MEASURED(rig))
        .sort((a, b) => b.memory - a.memory || (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0)),
  },
];

export function getScenario(slug: string): Scenario | undefined {
  return SCENARIOS.find((entry) => entry.slug === slug);
}

export function scenarioRigs(scenario: Scenario): BenchmarkRig[] {
  return scenario.pick(getRigs());
}

/**
 * Pure data-driven rankings for a single rig across all measured rigs.
 * Used on `/benchmarks/[rig]` to render honest, verifiable "who should / shouldn't buy this"
 * decision blocks and quotable FAQ answers without inventing claims.
 */
export type RigStanding = {
  totalMeasured: number;
  speedRank: number;
  costRank: number | null;
  paybackRank: number | null;
  powerRank: number;
  cheaperAlternative: BenchmarkRig | null;
  fasterAlternative: BenchmarkRig | null;
  bestForTag: "value" | "speed" | "memory" | "efficiency" | "balanced";
};

export function rigStanding(rig: BenchmarkRig, allRigs: BenchmarkRig[] = getRigs()): RigStanding {
  const bySpeed = [...allRigs].sort((a, b) => b.writingToks - a.writingToks);
  const withCost = allRigs
    .filter((r) => r.localCostPerMM != null)
    .sort((a, b) => (a.localCostPerMM ?? 0) - (b.localCostPerMM ?? 0));
  const withPayback = allRigs
    .filter((r) => r.breakEvenDays != null)
    .sort((a, b) => (a.breakEvenDays ?? 0) - (b.breakEvenDays ?? 0));
  const byPower = [...allRigs].sort((a, b) => a.powerWatts - b.powerWatts);

  const speedRank = bySpeed.findIndex((r) => r.id === rig.id) + 1;
  const costIdx = withCost.findIndex((r) => r.id === rig.id);
  const paybackIdx = withPayback.findIndex((r) => r.id === rig.id);
  const powerRank = byPower.findIndex((r) => r.id === rig.id) + 1;

  const cheaperAlternative =
    rig.rigTotal != null
      ? withCost.find((r) => r.id !== rig.id && r.rigTotal != null && r.rigTotal < rig.rigTotal!) ?? null
      : null;
  const fasterAlternative =
    bySpeed.find((r) => r.id !== rig.id && r.writingToks > rig.writingToks) ?? null;

  let bestForTag: RigStanding["bestForTag"] = "balanced";
  if (costIdx >= 0 && costIdx < 5) bestForTag = "value";
  else if (speedRank <= 4) bestForTag = "speed";
  else if (rig.memory >= 96) bestForTag = "memory";
  else if (rig.powerWatts <= 180) bestForTag = "efficiency";

  return {
    totalMeasured: withCost.length,
    speedRank,
    costRank: costIdx >= 0 ? costIdx + 1 : null,
    paybackRank: paybackIdx >= 0 ? paybackIdx + 1 : null,
    powerRank,
    cheaperAlternative,
    fasterAlternative,
    bestForTag,
  };
}
