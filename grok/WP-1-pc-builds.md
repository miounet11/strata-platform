# Work Package WP-1: Complete PC Builds Data Catalog, Pure Engine & Interactive Explorer

You are working in an isolated git worktree at `/Volumes/MobileDrive/devpc/.stratat-wt/wp-1` on branch `wp/1-pc-builds`.

## Strict File Boundaries (Zero Overlap With WP-2 and WP-3)
1. You may ONLY create or edit these exact files:
   - `apps/www/src/data/pc-builds.json` (NEW)
   - `apps/www/src/lib/builds.ts` (NEW)
   - `apps/www/src/components/BuildExplorer.tsx` (NEW)
   - `apps/www/tests/builds.test.ts` (NEW)
   - `grok/WP-1-report.md` (NEW)
2. Do NOT modify ANY other files (do NOT touch `routes.ts`, `sitemap.ts`, `messages/*.json`, `globals.css`, `package.json`, `gpus.ts`, etc. — those belong to Stage-2 WP-4).
3. Do NOT run `git push`, SSH, or external network calls.
4. Both `npm test` (from repo root) and `cd apps/www && npx tsc --noEmit` MUST pass with 0 errors and 0 failures.

---

## Deliverable 1: `apps/www/src/data/pc-builds.json`

Create a rich, authoritative, globally focused catalog of **24 complete assembled PC / workstation build blueprints** for running local LLMs (Qwen3.8-Flash-Next 125B MoE, Qwen3-Coder, DeepSeek-R1 70B, Llama-3.3 70B) with Strata.

### Ground-Truth Constraints (READ `apps/www/src/data/benchmarks.json` AND `apps/www/src/data/gpus.json` FIRST!)
- Every build with a non-null `rigId` MUST match `benchmarks.json` EXACTLY on:
  - `writingToks`, `readingToks`, `powerWatts`, `localCostPerMM`, `breakEvenDays`, `evidence` (`"measured"` when `benchmarks.json` has `"median"`, `"estimated"` when `"estimate"`), and `totalPriceUsd` (within ±5% or equal to `rigTotal` in `benchmarks.json`, and equal to the exact sum of its `bom` items!).
- Every build with a non-null `gpuSlug` MUST match an EXACT `slug` present in `apps/www/src/data/gpus.json`! (Check `gpus.json` before writing; use `null` if no single card entry exists, e.g. DGX Spark or Ryzen AI Max+ 395 or TITAN RTX if absent.)
- Cover these **24 builds** across 6 tiers (`"budget" | "sweet-spot" | "dual-gpu" | "workstation" | "compact-unified" | "flagship"`):
  1. `rtx-4090-workstation` (`rigId: "rtx4090"`, `gpuSlug: "rtx-4090"`, `gpuCount: 1`, `totalVramGb: 24`, `tier: "sweet-spot"`)
  2. `rtx-5090-flagship-build` (`rigId: "rtx5090"`, `gpuSlug: "rtx-5090"`, `gpuCount: 1`, `totalVramGb: 32`, `tier: "flagship"`)
  3. `rtx-5080-balanced-ai-pc` (`rigId: "rtx5080"`, `gpuSlug: "rtx-5080"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "sweet-spot"`)
  4. `rtx-5070-ti-creator-rig` (`rigId: "rtx5070"`, `gpuSlug: "rtx-5070-ti"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "sweet-spot"`)
  5. `rtx-5070-12gb-entry-blackwell` (`rigId: "rtx5070_12gb"`, `gpuSlug: "rtx-5070"`, `gpuCount: 1`, `totalVramGb: 12`, `tier: "budget"`)
  6. `rtx-4070-ti-super-silent-build` (`rigId: "rtx4070ti_super"`, `gpuSlug: "rtx-4070-ti-super-16gb"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "sweet-spot"`)
  7. `rtx-3090-used-value-build` (`rigId: "rtx3090"`, `gpuSlug: "rtx-3090"`, `gpuCount: 1`, `totalVramGb: 24`, `tier: "sweet-spot"`)
  8. `rtx-3090-ti-high-bandwidth` (`rigId: "rtx3090ti"`, `gpuSlug: "rtx-3090-ti"`, `gpuCount: 1`, `totalVramGb: 24`, `tier: "sweet-spot"`)
  9. `dual-rtx-3090-48gb-workstation` (`rigId: "dual_rtx3090_24gb"`, `gpuSlug: "rtx-3090"`, `gpuCount: 2`, `totalVramGb: 48`, `tier: "dual-gpu"`)
  10. `dual-rtx-5060-ti-32gb-build` (`rigId: "dual5060"`, `gpuSlug: "rtx-5060-ti-16gb"`, `gpuCount: 2`, `totalVramGb: 32`, `tier: "dual-gpu"`)
  11. `dual-rtx-3060-24gb-budget-split` (`rigId: "dual_rtx3060_12gb"`, `gpuSlug: "rtx-3060-12gb"`, `gpuCount: 2`, `totalVramGb: 24`, `tier: "budget"`)
  12. `dual-titan-rtx-48gb-workstation` (`rigId: "dual_titan_rtx_24gb"`, `gpuSlug` verified from `gpus.json` or `null`, `gpuCount: 2`, `totalVramGb: 48`, `tier: "dual-gpu"`)
  13. `rx-7900-xtx-rocm-linux-rig` (`rigId: "rx7900xtx"`, `gpuSlug: "amd-radeon-rx-7900-xtx"`, `gpuCount: 1`, `totalVramGb: 24`, `tier: "sweet-spot"`)
  14. `rx-9070-xt-rdna4-build` (`rigId: "rx9070xt_16gb"`, `gpuSlug: "amd-radeon-rx-9070-xt-16gb"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "budget"`)
  15. `rx-6900-xt-budget-rocm` (`rigId: "rx6900xt_16gb"`, `gpuSlug: "amd-radeon-rx-6900-xt-16gb"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "budget"`)
  16. `dual-rx-6900-xt-32gb-rocm` (`rigId: "dual_rx6900xt_16gb"`, `gpuSlug: "amd-radeon-rx-6900-xt-16gb"`, `gpuCount: 2`, `totalVramGb: 32`, `tier: "dual-gpu"`)
  17. `rtx-pro-6000-blackwell-96gb-tower` (`rigId: "rtxpro6000"`, `gpuSlug: "rtx-pro-6000-blackwell"`, `gpuCount: 1`, `totalVramGb: 96`, `tier: "workstation"`)
  18. `rtx-a6000-48gb-ecc-workstation` (`rigId: null`, `gpuSlug: "rtx-a6000"`, `gpuCount: 1`, `totalVramGb: 48`, `tier: "workstation"`, `evidence: "estimated"`)
  19. `rtx-4080-super-gaming-ai-pc` (`rigId: null`, `gpuSlug: "rtx-4080-super"`, `gpuCount: 1`, `totalVramGb: 16`, `tier: "sweet-spot"`, `evidence: "estimated"`)
  20. `ryzen-ai-max-395-128gb-mini` (`rigId: "ryzen_ai_max_395_128"`, `gpuSlug: null`, `gpuCount: 1`, `totalVramGb: 128`, `tier: "compact-unified"`)
  21. `dgx-spark-128gb-desktop` (`rigId: "dgx"`, `gpuSlug: null`, `gpuCount: 1`, `totalVramGb: 128`, `tier: "compact-unified"`)
  22. `mac-studio-m5-ultra-96gb` (`rigId: "macstudio_m5ultra_96"`, `gpuSlug: "mac-studio-m5-ultra-96-gb"`, `gpuCount: 1`, `totalVramGb: 96`, `tier: "compact-unified"`)
  23. `mac-studio-m5-ultra-256gb` (`rigId: "macstudio_m5ultra_256"`, `gpuSlug: "mac-studio-m5-ultra-256-gb"`, `gpuCount: 1`, `totalVramGb: 256`, `tier: "workstation"`)
  24. `mac-mini-m5-pro-64gb-silent` (`rigId: "mac_mini_m5pro_64"`, `gpuSlug: "mac-mini-m5-pro-64-gb"`, `gpuCount: 1`, `totalVramGb: 64`, `tier: "compact-unified"`)

### Exact JSON Schema for Each Build in `apps/www/src/data/pc-builds.json`
```ts
type LocaleRecord = Record<"en" | "zh" | "ja" | "de" | "fr" | "es" | "pt", string>;
type LocaleListRecord = Record<"en" | "zh" | "ja" | "de" | "fr" | "es" | "pt", string[]>;
type FaqItem = { q: string; a: string };
type LocaleFaqRecord = Record<"en" | "zh" | "ja" | "de" | "fr" | "es" | "pt", FaqItem[]>;

type BomPart = {
  role: "gpu" | "cpu" | "motherboard" | "ram" | "psu" | "cooling" | "chassis" | "storage" | "system";
  model: string;
  spec: string;
  priceUsd: number;
};

type ModelWorkloadProfile = {
  model: string;        // e.g. "Qwen3.8-Flash-Next (125B MoE)" | "Qwen3-Coder (32B)" | "DeepSeek-R1 (70B Q4)" | "Llama-3.3 (70B Q4)"
  quant: string;        // e.g. "UD-IQ4_XS", "IQ3_S", "IQ2_XS", "Q4_K_M"
  fit: "full-vram" | "hybrid-offload" | "unified";
  estWriteTps: number;
  maxContextK: number;
};

type PcBuild = {
  slug: string;
  tier: "budget" | "sweet-spot" | "dual-gpu" | "workstation" | "compact-unified" | "flagship";
  vendor: "nvidia" | "amd" | "apple";
  formFactor: "atx-mid" | "atx-full" | "workstation-tower" | "compact-desktop" | "mini-pc";
  rigId: string | null;
  gpuSlug: string | null;
  gpuModel: string;
  gpuCount: number;
  totalVramGb: number;
  systemRamGb: number;
  memoryType: string;
  recommendedQuant: string;
  maxContextK: number;
  readingToks: number;
  writingToks: number;
  evidence: "measured" | "estimated";
  idleWatts: number;
  loadWatts: number;
  noiseDbA: number;
  totalPriceUsd: number;
  localCostPerMM: number | null;
  breakEvenDays: number | null;
  runtime: "CUDA" | "ROCm" | "Metal";
  osSupport: ("linux" | "windows" | "macos")[];
  heroImageId: string; // e.g. "build-rtx-4090-workstation"
  imagePrompt: string; // >= 40 words natural English studio hardware photography prompt ending with "zero text, no labels, no watermark"
  bom: BomPart[];      // sum of bom[].priceUsd MUST equal totalPriceUsd!
  workloads: ModelWorkloadProfile[]; // 4 distinct model workloads
  title: LocaleRecord;
  tagline: LocaleRecord;
  summary: LocaleRecord;
  bestFor: LocaleRecord;
  tradeoffs: LocaleRecord;
  assemblyNotes: LocaleListRecord; // 4 concrete, build-specific assembly/BIOS/driver tips per locale
  faq: LocaleFaqRecord;            // 3 distinct build-specific Q&As per locale (direct first-sentence answer, NO boilerplate!)
};
```

**Global Multi-Locale Quality Rule**:
- English (`en`) is the primary international audience — write crisp, natural, hardware-engineer-grade English copy (specific part numbers, PCIe slot spacing, 12V-2x6 cable clearance, Above 4G Decoding, power-limit sweet spots, exact tok/s and watt figures).
- All 6 other locales (`zh`, `ja`, `de`, `fr`, `es`, `pt`) MUST be natural, accurate, idiomatic translations/adaptations — NEVER leave English placeholders inside `ja`/`de`/`fr`/`es`/`pt`/`zh`, and vary phrasing/facts per build so each build page has distinct, high-value content!

---

## Deliverable 2: `apps/www/src/lib/builds.ts`

Create a **browser-safe** (NO `node:fs` imports!) TypeScript module exporting:
- Types: `BuildTier`, `BuildVendor`, `BomPart`, `ModelWorkloadProfile`, `PcBuild`, `LocaleKey`
- Constants: `BUILD_TIERS: readonly BuildTier[]`
- Functions:
  - `allBuilds(): PcBuild[]`
  - `getBuild(slug: string): PcBuild | undefined`
  - `buildPath(slug: string): string` → `/builds/${encodeURIComponent(slug)}`
  - `buildsForGpu(gpuSlug: string): PcBuild[]` (matches `b.gpuSlug === gpuSlug`, sorted by `localCostPerMM ?? 999` then `totalPriceUsd`)
  - `buildsForRig(rigId: string): PcBuild[]`
  - `filterBuilds(opts: { tier?: string; vendor?: string; minVram?: number; maxPrice?: number; query?: string; locale?: string }): PcBuild[]`
  - `sortBuilds(list: PcBuild[], by?: "cost" | "speed" | "price" | "vram" | "power"): PcBuild[]`
  - `relatedBuilds(build: PcBuild, limit?: number): PcBuild[]` (picks closest alternatives: 1 cheaper, 1 faster, 1 higher-VRAM, plus same-tier peers, excluding self!)
  - `annualPowerCostUsd(loadWatts: number, idleWatts: number, activeHoursPerDay: number, kwhUsd?: number): number`
  - `buildText(record: Record<string, string>, locale: string): string`
  - `buildListText(record: Record<string, string[]>, locale: string): string[]`
  - `buildFaq(build: PcBuild, locale: string): { q: string; a: string }[]`

---

## Deliverable 3: `apps/www/src/components/BuildExplorer.tsx`

Create a clean `"use client"` interactive explorer component for `/[locale]/builds`:
- Props: `builds: BuildExplorerRow[]` (compact serializable summary array so SSR HTML stays well under 180 KB!), `labels: BuildExplorerLabels` (all UI strings passed from Server Component — ZERO `useTranslations` or big JSON bundled on client!).
- Features:
  - Search input (matches title, GPU model, tagline, tier, vendor)
  - Tier filter buttons (`all`, `budget`, `sweet-spot`, `dual-gpu`, `workstation`, `compact-unified`, `flagship`)
  - Vendor filter (`all`, `nvidia`, `amd`, `apple`)
  - Min VRAM select (`0`, `16`, `24`, `32`, `48`, `96`)
  - Max Budget select (`0` = any, `2500`, `4000`, `6500`)
  - Sort select (`cost`, `speed`, `price`, `vram`, `power`)
  - Interactive **Compare up to 3 builds** checkbox toggle + inline side-by-side comparison table showing Total Price, VRAM, System RAM, Write tok/s, Read tok/s, Load Watts, Noise dBA, Cost/M tok, Break-even Days, Recommended Quant!
  - Uses `@/i18n/navigation` `Link` pointing to `/builds/${row.slug}`, and clean CSS class names (`build-explorer`, `build-controls`, `build-grid`, `build-card`, `build-compare-tray`, `pill`, `badge`, `card`, `meta` matching existing site aesthetic).

---

## Deliverable 4: `apps/www/tests/builds.test.ts`

Write at least **15 comprehensive `node:test` cases** covering:
1. Exactly 24 builds with unique URL-safe slugs.
2. Every non-null `rigId` exists in `benchmarks.json` AND matches exact `writingToks`, `readingToks`, `powerWatts`, `localCostPerMM`, `breakEvenDays`.
3. Every non-null `gpuSlug` exists in `gpus.json`.
4. Every build's `bom` prices sum cleanly to `totalPriceUsd` (`sum === totalPriceUsd`).
5. Every build has 4 `workloads`, 4+ `assemblyNotes` per locale, 3 `faq` items per locale across all 7 locales (`en, zh, ja, de, fr, es, pt`), with non-empty localized text.
6. Every `imagePrompt` has ≥35 words and includes `zero text`.
7. `buildsForGpu("rtx-4090")`, `buildsForGpu("rtx-3090")` (returns both single & dual!), `buildsForRig("rx7900xtx")` work accurately.
8. `filterBuilds` by tier, vendor, minVram, maxPrice, and text query.
9. `sortBuilds` for all 5 sort modes (`cost`, `speed`, `price`, `vram`, `power`).
10. `relatedBuilds` never includes self and respects limit.
11. `annualPowerCostUsd` returns deterministic positive figures.
12. Cross-build English summary uniqueness check (max Jaccard similarity across pairs < 0.55 so `similarity.mjs` won't flag duplicates!).
13. `builds.ts` has zero `node:fs` imports (browser-safe).

---

## Verification & Delivery Steps
1. Run `node --test apps/www/tests/builds.test.ts` and full `npm test` — ALL MUST PASS (0 fail).
2. Run `cd apps/www && npx tsc --noEmit` — MUST PASS (0 errors).
3. Run `git status` and verify ONLY allowed files were created/modified.
4. Write a concise summary in `grok/WP-1-report.md` (files created, build count, test counts, `tsc` result).
5. Commit cleanly on branch `wp/1-pc-builds`: `git add -A && git commit -m "feat(wp-1): add 24 local-AI PC build blueprints, pure engine, explorer UI and tests"`.
