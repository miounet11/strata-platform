# WP-1 report

Branch: `wp/1-pc-builds`

## Files

Created only:

- `apps/www/src/data/pc-builds.json` (24 builds, 6990 lines)
- `apps/www/src/lib/builds.ts` (browser-safe catalogue engine)
- `apps/www/src/components/BuildExplorer.tsx` (client explorer; not mounted — routes stay with WP-4)
- `apps/www/tests/builds.test.ts` (16 `node:test` cases)
- `grok/WP-1-report.md`

No other paths were edited.

## Catalogue

24 unique URL-safe slugs. Tiers: budget 4, sweet-spot 8, dual-gpu 4, workstation 3, compact-unified 4, flagship 1.

Every non-null `rigId` copies `writingToks`, `readingToks`, `powerWatts` → `loadWatts`, `localCostPerMM`, `breakEvenDays`, and `rigTotal` → `totalPriceUsd` from `benchmarks.json`. Evidence is `measured` for `median` and `estimated` for `estimate`. `rtx-a6000-48gb-ecc-workstation` and `rtx-4080-super-gaming-ai-pc` have `rigId: null` and estimated economics. `gpuSlug` is null for the dual TITAN RTX, Ryzen AI Max+ 395, and DGX Spark. Every other `gpuSlug` is an exact slug in `gpus.json`. Each BOM sums to `totalPriceUsd`. English summary token-set Jaccard peaks at 0.267.

Locales: `en`, `zh`, `ja`, `de`, `fr`, `es`, `pt`. Each build has 4 workloads, 4 assembly notes, and 3 FAQ items per locale.

## Verification

- `node --test apps/www/tests/builds.test.ts`: 16 pass, 0 fail
- `npm test` (repo root): 172 pass, 0 fail
- `cd apps/www && npx tsc --noEmit`: exit 0, 0 errors

`/builds` is not registered in this work package, so the explorer was not exercised in a browser.
