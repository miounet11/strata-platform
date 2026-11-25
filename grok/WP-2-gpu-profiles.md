# Work Package WP-2: Deep GPU Hardware Configuration Profiles & Quantization Matrix Component

You are working in an isolated git worktree at `/Volumes/MobileDrive/devpc/.stratat-wt/wp-2` on branch `wp/2-gpu-profiles`.

## Strict File Boundaries (Zero Overlap With WP-1 and WP-3)
1. You may ONLY create or edit these exact files:
   - `apps/www/src/lib/gpu-profiles.ts` (NEW)
   - `apps/www/src/components/GpuConfigPanel.tsx` (NEW)
   - `apps/www/tests/gpu-profiles.test.ts` (NEW)
   - `grok/WP-2-report.md` (NEW)
2. Do NOT modify ANY other files (do NOT touch `gpus/[slug]/page.tsx`, `gpus/page.tsx`, `messages/*.json`, `routes.ts`, `globals.css`, etc. — those belong to Stage-2 WP-4).
3. Do NOT run `git push`, SSH, or external network calls.
4. Both `npm test` (from repo root) and `cd apps/www && npx tsc --noEmit` MUST pass with 0 errors and 0 failures.

---

## Deliverable 1: `apps/www/src/lib/gpu-profiles.ts`

Read `apps/www/src/lib/gpus.ts` and `apps/www/src/data/gpus.json` first to understand the exact `Gpu` and `QuantVariant` types and data distribution across all 3,200+ GPUs.

Create a pure, deterministic, **browser-safe** (NO `node:fs` imports!) module `apps/www/src/lib/gpu-profiles.ts` that enriches ANY `Gpu` record into a detailed real-world PC assembly & inference configuration profile:

### Required Exports & Types
```ts
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
  maxContextK: number; // 0 when too-small; otherwise 8 | 16 | 32 | 64 | 128
};

export type GpuHardwareProfile = {
  tdpWatts: number;
  tdpEstimated: boolean;
  /** Recommended ATX PSU wattage (rounded up to nearest 50W); null for integrated/unified/mobile chips. */
  recommendedPsuWatts: number | null;
  /** Power connector requirement, e.g. "1× 12V-2x6 (600W)", "1× 16-pin 12VHPWR", "2× 8-pin PCIe", "Slot-powered (75W)", "Unified / Internal". */
  powerConnector: string;
  /** Physical card slot clearance, e.g. "3–3.5-slot", "2.5-slot", "2-slot", "Unified / Mobile". */
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

export function gpuHardwareProfile(gpu: Gpu, variants?: readonly QuantVariant[]): GpuHardwareProfile;
```

### Engineering Accuracy Rules for `gpuHardwareProfile`
1. **Detect Unified / Integrated / Mobile GPUs accurately**:
   - `gpu.vendor === "apple"` OR `/mobile|laptop|max-q|m\b|igpu|integrated|iris|uhd|hd graphics|vega \d+ mobile|radeon \d+m|ryzen/i.test(gpu.name)` OR `gpu.bus?.toLowerCase().includes("igp")` OR `gpu.bus?.toLowerCase().includes("integrated")` → `isUnifiedOrMobile = true`, `recommendedPsuWatts = null`, `powerConnector = "Unified / Internal"`, `slotWidth = "Unified / Mobile"`.
2. **Accurate TDP & PSU Sizing**:
   - Prefer `gpu.powerWatts` when `gpu.powerWatts != null && gpu.powerWatts > 0` (`tdpEstimated: false`).
   - NOTE: For curated `benchmarks.json`-backed cards in `gpus.json`, `gpu.powerWatts` is whole-rig power (e.g., RTX 4090 has `powerWatts: 550`, RTX 5090 `700`, RX 7900 XTX `475`, RTX 3090 `500`), whereas TechPowerUp bulk rows have board TDP (e.g., 350W, 450W). Handle both cleanly:
     - When `gpu.evidence === "measured"` and `!isUnifiedOrMobile` and `gpu.powerWatts != null`, treat `gpu.powerWatts` as measured **total system wall draw**, so PSU recommendation is `Math.max(650, Math.ceil((gpu.powerWatts * 1.45) / 50) * 50)` (e.g., 550W system → 850W PSU; 700W RTX 5090 system → 1050W/1000W+ PSU; 720W RTX PRO 6000 → 1050W+ PSU!).
     - When `gpu.evidence === "estimated"` and `gpu.powerWatts != null`, treat `gpu.powerWatts` as card TDP, so PSU is `Math.max(550, Math.ceil(((gpu.powerWatts + 200) * 1.25) / 50) * 50)` (capped reasonably at 1600W).
     - When `gpu.powerWatts == null`, estimate TDP cleanly from VRAM + vendor + year (`tdpEstimated: true`).
   - Never return `NaN`, `Infinity`, or negative numbers for ANY of the 3,200+ GPUs in `gpus.json`!
3. **Accurate Power Connector Logic (Discrete GPUs)**:
   - NVIDIA Blackwell (RTX 50 / PRO Blackwell) with board/rig power ≥ 220W → `"1× 12V-2x6 (ATX 3.1)"`
   - NVIDIA Ada Lovelace (RTX 40) with ≥ 250W → `"1× 16-pin 12VHPWR"`
   - High-wattage discrete (≥ 320W board or ≥ 550W rig) non-16pin → `"3× 8-pin PCIe"`
   - Mid-high discrete (175W–319W board or 380W–549W rig) → `"2× 8-pin PCIe"`
   - Mid discrete (76W–174W) → `"1× 8-pin PCIe"`
   - Low-power discrete (≤ 75W) → `"PCIe slot powered (≤75W)"`
4. **Honest Multi-Quantization Fit & Throughput Matrix**:
   - Uses `gpuVariants` from `@/lib/gpus` by default (can pass custom `variants` for testing).
   - For each quant variant:
     - If `!gpu.runnable || gpu.vramGb < variant.vramGbMin` → `fit = "too-small"`, `estWriteTps = 0`, `estReadTps = 0`, `maxContextK = 0`.
     - If `gpu.vendor === "apple"` (unified memory): fits cleanly as `"full-vram"` when `gpu.vramGb >= variant.ramGbMin` (leaving ~18% OS headroom), or `"hybrid-offload"` when `gpu.vramGb >= variant.vramGbMin`.
     - For discrete GPUs: if `gpu.vramGb >= variant.downloadGb + 4` → `fit = "full-vram"`, `vramUsedGb = Math.min(gpu.vramGb, round1(variant.downloadGb + 2))`, `ramOffloadGb = 0`; else `fit = "hybrid-offload"`, `vramUsedGb = round1(Math.max(variant.vramGbMin, gpu.vramGb - 1.5))`, `ramOffloadGb = round1(Math.max(0, variant.downloadGb - vramUsedGb + 2))`.
     - Scale `estWriteTps` and `estReadTps` cleanly relative to `gpu.writingTps` / `gpu.readingTps` (smaller quants like `Coder` / `IQ2_XS` are slightly faster; heavier `UD-IQ4_XS` is slightly slower than `IQ3_S`; hybrid offload scales modestly when offload ratio is higher). Always finite, non-negative, rounded to 1 decimal!
     - `maxContextK`: `128` when generous headroom (≥ 16 GB free VRAM or ≥ 96 GB unified), `64` when ≥ 8 GB headroom, `32` when ≥ 3 GB headroom, `8` when tight.

---

## Deliverable 2: `apps/www/src/components/GpuConfigPanel.tsx`

Create a clean, lightweight **Server Component** (NO `"use client"`, zero client JS!) that renders a GPU's complete host PC configuration requirements and multi-quantization performance matrix:
- Props:
  ```ts
  export type GpuConfigPanelLabels = {
    configHeading: string;
    configIntro: string;
    psuLabel: string;
    connectorLabel: string;
    hostRamLabel: string;
    pcieLabel: string;
    slotCoolingLabel: string;
    multiGpuLabel: string;
    efficiencyLabel: string;
    annualPowerLabel: string;
    quantHeading: string;
    quantColModel: string;
    quantColFit: string;
    quantColSplit: string;
    quantColSpeed: string;
    quantColContext: string;
    fitFullVram: string;
    fitHybrid: string;
    fitTooSmall: string;
    yes: string;
    no: string;
    unifiedSystem: string;
    coolingLabels: Record<CoolingTier, string>;
    ramUnit: string;
    wattsUnit: string;
    perYear4h: string;
    tpsPer100WUnit: string;
  };
  ```
- Keep rendered HTML ultra-clean and compact (< 3.5 KB per GPU page!) so every `/[locale]/gpus/[slug]` page stays well below the 180 KB HTML audit budget AND keeps distinct numeric rows per card!
- Use clean semantic HTML (`<section className="gpu-config-panel">`, `<dl className="gpu-config-grid">`, `<table className="gpu-quant-table">`) with subtle badges (`badge-ok`, `badge-warn`, `badge-muted`).
- When `gpu.support === "not-supported"` (legacy/small VRAM cards), render ONLY a concise host-spec card (PCIe, TDP, power connector, slot width) and skip the 5-row quant matrix (since all 5 are `too-small`) — this keeps legacy GPU pages ultra-compact and prevents similarity spikes across 2,800 legacy cards!

---

## Deliverable 3: `apps/www/tests/gpu-profiles.test.ts`

Write at least **12 comprehensive `node:test` cases** covering:
1. All 3,200+ GPUs in `gpus.json` compute cleanly with ZERO throws, ZERO `NaN`, ZERO `Infinity`, and valid `tdpWatts > 0`.
2. RTX 5090 (`rtx-5090`): `12V-2x6`, `recommendedPsuWatts >= 1000`, `multiGpuViable === true`, `UD-IQ4_XS` fits, `tpsPer100W > 0`.
3. RTX 4090 (`rtx-4090`): `16-pin 12VHPWR`, `recommendedPsuWatts >= 800`, `recommendedHostRamGb >= 64`.
4. RTX 3090 (`rtx-3090`): `3× 8-pin` or `2× 8-pin`, `recommendedPsuWatts >= 750`, `multiGpuViable === true`.
5. AMD RX 7900 XTX (`amd-radeon-rx-7900-xtx`): `ROCm` card, `recommendedPsuWatts >= 700`, runnable quants fit.
6. Mac Studio M5 Ultra 256 GB (`mac-studio-m5-ultra-256-gb`): `isUnifiedOrMobile === true`, `recommendedPsuWatts === null`, `coolingTier === "unified-silent"`, `maxContextK === 128`.
7. Budget 12 GB card (`rtx-3060-12gb` or `rtx-5070`): Coder / smaller quants fit cleanly while huge quants report accurate `ramOffloadGb > 0` or `too-small`.
8. Legacy unsupported card (e.g. 4 GB or 8 GB `not-supported`): all quant rows are `"too-small"` with `estWriteTps === 0` and `bestQuantId === null`.
9. PSU sizing is always a multiple of 50W when non-null.
10. `gpu-profiles.ts` has zero `node:fs` imports (browser-safe).
11. `GpuConfigPanel.tsx` does NOT contain `"use client"` (Server Component).
12. Efficiency and annual power cost calculations are deterministic and strictly ordered (lower-wattage card costs less electricity than high-wattage card).

---

## Verification & Delivery Steps
1. Run `node --test apps/www/tests/gpu-profiles.test.ts` and full `npm test` — ALL MUST PASS (0 fail).
2. Run `cd apps/www && npx tsc --noEmit` — MUST PASS (0 errors).
3. Run `git status` and verify ONLY allowed files were created/modified.
4. Write a concise summary in `grok/WP-2-report.md`.
5. Commit cleanly on branch `wp/2-gpu-profiles`: `git add -A && git commit -m "feat(wp-2): add GPU hardware configuration profile engine, quant matrix panel and tests"`.
