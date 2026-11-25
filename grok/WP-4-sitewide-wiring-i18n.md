# Work Package WP-4: Sitewide Wiring for PC Builds, Deep GPU Configs, Search, Sitemap & 7-Locale i18n

You are working in an isolated git worktree at `/Volumes/MobileDrive/devpc/.stratat-wt/wp-4` on branch `wp/4-sitewide-wiring-i18n`, branched from `main` AFTER WP-1, WP-2, and WP-3 were merged.

## Context Already Available in This Worktree
- `apps/www/src/data/pc-builds.json` & `apps/www/src/lib/builds.ts` (24 complete PC builds, `allBuilds`, `getBuild`, `buildPath`, `buildsForGpu`, `buildsForRig`, `relatedBuilds`, `annualPowerCostUsd`, `buildText`, `buildListText`, `buildFaq`, `BUILD_TIERS`)
- `apps/www/src/components/BuildExplorer.tsx` (client component accepting `{ builds: BuildExplorerRow[], labels: BuildExplorerLabels }`)
- `apps/www/src/lib/gpu-profiles.ts` & `apps/www/src/components/GpuConfigPanel.tsx` (Server Component accepting `{ gpu: Gpu, labels: GpuConfigPanelLabels }`)
- `apps/www/src/components/EnrichedBlock.tsx` / `EnrichedImage.tsx` (Server Component rendering hero images from `media-manifest.json`; safely renders `null` when an ID is not yet in `media-manifest.json`!)

## Strict Boundaries & Hard Gates
1. **Do NOT modify**: `apps/www/public/media/**`, `apps/www/src/data/media-manifest.json`, `scripts/content/out/**`, `apps/www/src/data/pc-builds.json`, `apps/www/src/data/gpus.json`, `apps/www/src/data/benchmarks.json`. (Media generation & article writing run in parallel outside this worktree.)
2. **HTML Budget Guard**: EVERY page MUST stay well under `180,000` bytes! Keep `BuildExplorerRow` compact, keep `SiteHeader` / `layout.tsx` RSC payload minimal (do NOT add new namespaces to `<NextIntlClientProvider>` in `layout.tsx` — remember `layout.tsx` only passes `nav`, `footer`, `community.labelsTitle`!).
3. **JSON-LD & Audit Guard**: Every new indexable page (`/builds` and `/builds/[slug]`) MUST have:
   - Exactly ONE `<h1>`
   - `<script type="application/ld+json">` using `jsonLdGraph([...])` with `@graph`
   - `siteMetadata(...)` / `seoMetadata(...)` providing `title`, `description` (≥10 chars), `canonical`, `og:image`, and `hreflang` alternates + `x-default`
   - `export const revalidate = 1800;`
4. **7-Locale Key Parity**: ALL 7 files `apps/www/messages/{en,zh,ja,de,fr,es,pt}.json` MUST have 100% identical key paths (0 missing, 0 extra), with natural, idiomatic translations in every language (especially English, Japanese, German, French, Spanish, Portuguese, Chinese — NEVER leave English placeholders in other locales!).
5. **No `git push` or SSH**. Both `npm test` and `cd apps/www && npx tsc --noEmit` MUST pass with 0 errors and 0 failures.

---

## Detailed Deliverables

### 1. New PC Builds Pages
- **`apps/www/src/app/[locale]/builds/page.tsx`** (NEW):
  - `export const revalidate = 1800;`
  - `generateMetadata`: uses `seoMetadata(locale, "builds", "/builds", true, t("title"), t("intro"))`
  - Renders:
    - JSON-LD `@graph`: `siteEntityNodes()` + `pageLd(SITE, locale, "/builds", t("title"), { description: t("intro"), type: "CollectionPage" })` + `ItemList` of all 24 builds (`url`, `name`, `position`)
    - `<Breadcrumbs label={t("title")} />`
    - `<h1>{t("title")}</h1>`, `<p className="page-intro">{t("intro")}</p>`
    - `<EnrichedImage id="builds-hero" locale={locale} className="page-visual" />`
    - `<BuildExplorer builds={rows} labels={...} />` (passes compact `BuildExplorerRow[]` and localized `BuildExplorerLabels`)
    - Server-rendered crawlable directory list of all 24 builds grouped or listed cleanly with links to `/builds/${b.slug}` (or ensure `BuildExplorer` SSRs all 24 `<a href>` cards directly in initial HTML — verify `BuildExplorer` renders all 24 links on initial SSR!)
    - Action links to `/can-i-run`, `/gpus`, `/benchmarks`, `/best`
- **`apps/www/src/app/[locale]/builds/[slug]/page.tsx`** (NEW):
  - `export const revalidate = 1800;`
  - `generateStaticParams()` returning `allBuilds().map((b) => ({ slug: b.slug }))`
  - `generateMetadata`: uses `siteMetadata(locale, `${title} — ${t("title")}`, summary, buildPath(build.slug))`
  - Renders:
    - JSON-LD `@graph`: `siteEntityNodes()` + `Product` (`name`, `description`, `category: "Local AI Workstation PC Build"`, `brand`, `additionalProperty` for VRAM, System RAM, Total Price USD, Load Power W, Write tok/s, Read tok/s) + `BreadcrumbList` (`Home → PC Builds → title`) + `FAQPage` (from `buildFaq(build, locale)`)
    - `<Breadcrumbs label={title} parents={[{ href: "/builds", text: t("title") }]} />`
    - `<h1>{title}</h1>`, `<p className="page-intro">{tagline}</p>`
    - `<EnrichedImage id={build.heroImageId} locale={locale} className="page-visual" />`
    - Key Metrics Summary Grid (`.build-stats-grid`): Total Price, VRAM + System RAM, Write tok/s, Read tok/s, Load / Idle Power (W), Noise (dBA), Cost/M tok & Break-even Days (when available), Annual Electricity @ 4h/day & 24h/day (`annualPowerCostUsd`), Recommended Quant & Max Context, Runtime (`CUDA`/`ROCm`/`Metal`), Evidence badge (`measured` vs `estimated`)
    - Overview paragraph (`summary`) + **Best For** (`bestFor`) & **Tradeoffs** (`tradeoffs`) cards
    - **Complete Bill of Materials (BOM) Table** (`.build-bom-table`): Role (localized), Model, Specification, Est. Street Price (USD), plus Total row matching `build.totalPriceUsd`
    - **Multi-Model Performance Profile Table**: all 4 `build.workloads` rows (Model, Quant, Memory Fit badge, Est. Write tok/s, Max Context)
    - **Assembly, BIOS & Driver Tuning Checklist**: ordered list of `buildListText(build.assemblyNotes, locale)`
    - **FAQ Section**: all 3 build-specific Q&As from `buildFaq(build, locale)`
    - **Direct Cross-Links**:
      - If `build.gpuSlug`: link to `gpuPath(build.gpuSlug)`
      - If `build.rigId`: link to `rigPath(build.rigId)`
      - Link to `/can-i-run` and `/builds`
      - `<RelatedContent title={t("relatedBuilds")} items={relatedBuilds(build, 4).map(...)} />`

### 2. Upgrade Existing GPU Pages & Homepage
- **`apps/www/src/app/[locale]/gpus/[slug]/page.tsx`**:
  - Add `<EnrichedImage id={`gpu-${gpu.slug}`} locale={locale} className="page-visual" />` below the title/meta header (if no manifest entry exists for legacy cards, `EnrichedImage` cleanly renders nothing!).
  - Mount `<GpuConfigPanel gpu={gpu} labels={...} />` right after the specs table!
  - Call `buildsForGpu(gpu.slug)`. When non-empty, render a clean **"Assembled PC Builds Using This GPU"** section linking to `/builds/${b.slug}` showing total price, VRAM, write tok/s, and load watts!
  - Also link to `/can-i-run` and `/builds` right beside the benchmarks link!
- **`apps/www/src/app/[locale]/gpus/page.tsx`**:
  - Add `<EnrichedImage id="gpus-hero" locale={locale} className="page-visual" />` and a concise callout row linking to `/builds` and `/can-i-run`.
- **`apps/www/src/app/[locale]/page.tsx`**:
  - Add a compact **"Featured Local-AI PC Builds"** section (4 builds: `rtx-4090-workstation`, `rx-7900-xtx-rocm-linux-rig`, `dual-rtx-3090-48gb-workstation`, `rtx-5090-flagship-build`) showing title, total price, VRAM, write tok/s, and link to `/builds/[slug]`, plus a CTA link to `/builds`!
  - Also add `/builds` to `.hero-links`!

### 3. Routes, Sitemap, Search, `llms.txt`, Revalidate & IndexNow
- **`apps/www/src/lib/internal-links.ts`**:
  - Add `export function buildPath(slug: string): string { return `/builds/${encodeURIComponent(slug)}`; }`
- **`apps/www/src/lib/routes.ts`**:
  - Re-export `buildPath` from `./internal-links`.
  - Add `{ href: "/builds", key: "builds" }` to `PRIMARY_NAV` (right after `gpus`), `SECONDARY_NAV` (`learn` group), `STATIC_PATHS`, and `HUB_LABELS` (`builds: "builds"`).
- **`apps/www/src/lib/sitemap.ts`**:
  - Import `allBuilds` from `@/lib/builds` and `buildPath` from `@/lib/routes`.
  - Add `...allBuilds().map((b) => buildPath(b.slug))` to `sharedPaths`.
  - Treat `path === "/builds"` as `freshHub` (`priority: 0.9`) and `path.startsWith("/builds/")` as high-intent (`priority: 0.8`, `changeFrequency: "weekly"`).
- **`apps/www/src/app/api/search/route.ts`** & **`apps/www/src/components/SearchClient.tsx`**:
  - Add `"build"` to `SearchHit["type"]`.
  - Search `allBuilds()` across localized title, tagline, `gpuModel`, `tier`, `vendor`, `${totalVramGb}gb`, and BOM part models (`score + 11`).
  - Inspect `SearchClient.tsx` and add `"build"` to the type filter options with clean localized label (pass `filterBuild` from `apps/www/src/app/[locale]/search/page.tsx` if `SearchClient` receives labels, or check how `SearchClient.tsx` currently gets labels!).
- **`apps/www/src/app/llms.txt/route.ts`**:
  - Add a **"Complete Local-AI PC Builds"** section listing `/en/builds` and the top 8 featured builds with VRAM, price, write tok/s, and URL!
- **`apps/www/src/app/api/revalidate/route.ts`**:
  - Add `"/builds"` to `topics` scope, add `"builds"` scope (`["", "/builds", "/gpus"]`), and revalidate `"/[locale]/builds/[slug]"` + `"/[locale]/gpus/[slug]"` when `builds` or `all` is requested.
- **`scripts/indexnow-submit.mjs`**:
  - Include `/builds` and all `/builds/<slug>` URLs (from `apps/www/src/data/pc-builds.json`) in the high-priority static/hub submission list!

### 4. Styling & Full 7-Locale i18n
- **`apps/www/src/app/globals.css`**:
  - Add clean, cohesive styles for `.build-explorer`, `.build-controls`, `.build-filter-row`, `.build-grid`, `.build-card`, `.build-compare-tray`, `.build-stats-grid`, `.build-bom-table`, `.gpu-config-panel`, `.gpu-config-grid`, `.gpu-quant-table`, `.badge-ok`, `.badge-warn`, `.badge-muted`. Match existing CSS custom properties (`--bg`, `--surface`, `--border`, `--text`, `--muted`, `--accent`, etc. — read `globals.css` first!).
- **`apps/www/messages/{en,zh,ja,de,fr,es,pt}.json`**:
  - Add all required keys across ALL 7 files with **100% exact key parity**:
    - `nav.builds`
    - `seo.builds.title`, `seo.builds.description`
    - `builds.*` (all explorer & detail UI strings)
    - `gpus.config.*` (all `GpuConfigPanelLabels` strings + matching builds headings)
    - `home.buildsTitle`, `home.buildsIntro`, `home.buildsCta`
    - `search.*` (if a build filter label is added)
  - Verify programmatically that all 7 locale JSON files have the EXACT same flattened key list (0 missing, 0 extra)!

### 5. Tests (`apps/www/tests/builds-wiring.test.ts` & existing test updates)
- Update `apps/www/tests/internal-links.test.ts` if any test asserts exact `PRIMARY_NAV` / `STATIC_PATHS` list.
- Create **`apps/www/tests/builds-wiring.test.ts`** with ≥ 10 tests asserting:
  1. All 7 `messages/*.json` files have 100% identical key paths (0 missing, 0 extra) and non-empty values for `nav.builds`, `builds.*`, `gpus.config.*`.
  2. `buildPath("rtx-4090-workstation") === "/builds/rtx-4090-workstation"` and `isInternalHref("/builds/rtx-4090-workstation") === true`.
  3. `PRIMARY_NAV`, `SECONDARY_NAV`, `STATIC_PATHS`, and `hubKeyFor("/builds/rtx-4090-workstation")` all include `/builds`.
  4. `sitemap.ts` source wires `allBuilds()` and `buildPath`.
  5. `api/search/route.ts` wires `allBuilds()` and `"build"` type.
  6. `llms.txt/route.ts` includes `/builds`.
  7. `gpus/[slug]/page.tsx` mounts `GpuConfigPanel` and `buildsForGpu`.
  8. `builds/page.tsx` and `builds/[slug]/page.tsx` both export `revalidate` and use `jsonLdGraph`.

---

## Verification & Delivery Steps
1. Run `npm test` (from repo root) — ALL tests MUST PASS (0 fail).
2. Run `cd apps/www && npx tsc --noEmit` — MUST PASS (0 errors).
3. Run a quick node check verifying all 7 `messages/*.json` files have identical key counts & 0 missing/extra keys.
4. Write `grok/WP-4-report.md` summarizing modified files, key counts, and test/tsc results.
5. Commit cleanly on branch `wp/4-sitewide-wiring-i18n`: `git add -A && git commit -m "feat(wp-4): wire /builds vertical, GPU config panels, search, sitemap, llms.txt and 7-locale i18n"`.
