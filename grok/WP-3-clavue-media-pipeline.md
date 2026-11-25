# Work Package WP-3: Clavue Image v3.1 Hardware Visuals & Global Multilingual Guide Pipeline

You are working in an isolated git worktree at `/Volumes/MobileDrive/devpc/.stratat-wt/wp-3` on branch `wp/3-clavue-media-pipeline`.

## Strict File Boundaries (Zero Overlap With WP-1 and WP-2)
1. You may ONLY create or edit these exact files:
   - `scripts/media/generate-hardware-visuals.mjs` (NEW)
   - `scripts/content/generate-build-guides.mjs` (NEW)
   - `scripts/content/images.mjs` (UPGRADE)
   - `scripts/content/hardware-visuals.test.mjs` (NEW)
   - `package.json` (ONLY add `media:hardware` and `content:build-guides` npm scripts)
   - `grok/WP-3-report.md` (NEW)
2. Do NOT modify ANY files under `apps/www/` (except reading `apps/www/src/data/gpus.json`, `benchmarks.json`, `media-manifest.json` at runtime inside scripts).
3. Do NOT run `git push`, SSH, or generate hundreds of live images during this work package — tests MUST run 100% offline using mocks/pure functions!
4. Full `npm test` (from repo root) MUST pass with 0 failures.

---

## Clavue Cluster API Contract (Verified Live from `https://ttqq.inping.com/docs/`)
- **Base URL**: `process.env.CLAVUE_API_BASE || "http://192.168.2.100:11401/v1"` (LAN gateway requires NO API key! When `process.env.CLAVUE_API_KEY` is provided — e.g. for public `https://ttqq.inping.com/v1` — include `Authorization: Bearer ${CLAVUE_API_KEY}`).
- **Text-to-Image (`Image v3.1`)**:
  - Endpoint: `POST ${BASE}/images/generations`
  - JSON body:
    ```json
    {
      "model": "clavue-img",
      "prompt": "<4-part English studio photography prompt >=40 words, ending with zero text, no labels, no watermark>",
      "size": "1344x768",
      "steps": 9,
      "guidance_scale": 0.0,
      "output_format": "webp",
      "response_format": "b64_json",
      "seed": 11
    }
    ```
  - Response: `{ data: [{ b64_json: "..." }] }` → decode base64, verify RIFF/WEBP magic bytes (`buf.subarray(0,4) === "RIFF"` and `buf.subarray(8,12) === "WEBP"`, length >= 1024).
- **Optional Aesthetic Judge (`clavue-taste-image`)**:
  - Endpoint: `POST ${BASE}/taste/image` (only used when `--best-of N` with `N > 1`; if endpoint returns non-200 or times out, gracefully fall back to the first valid WebP image without crashing!).
- **LLM Chat Completions (Zero-Injection Technical Writing)**:
  - Endpoint: `POST ${BASE}/chat/completions`
  - Default model: `process.env.CLAVUE_LLM_MODEL || "qwen3.8:27b"` (supports `clavue-5.5`, `clavue-5.5-fast`, `clavue-3-geo`, etc.).

---

## Deliverable 1: `scripts/media/generate-hardware-visuals.mjs`

Create a reusable CLI + importable module for generating editorial hardware WebP photography for PC builds, flagship GPUs, and hub pages:
- **Exported pure functions** (for unit testing without network calls):
  - `isValidWebp(buf): boolean`
  - `buildHardwarePrompt({ kind, name, subtitle, vendor, formFactor, gpuCount }): string`
    - Follows Clavue Image v3.1 4-part director grammar: medium lock (`Editorial hardware studio photograph`) + concrete physical subject (open-frame matte-black PC workstation / dual-GPU tower / brushed aluminum graphics card / compact Mac Studio / mini workstation) + lighting/materials (controlled rim light, dark anodized aluminum, copper heatpipes, dark slate desk, subtle warm/cool accent) + lens framing (`50mm prime lens, shallow depth of field, 16:9 widescreen composition, zero text, no labels, no watermark`).
    - NEVER uses banned filler tags (`masterpiece`, `8k`, `ultra detailed`).
    - Always >= 40 English words and ends with `zero text, no labels, no watermark`.
  - `buildAltRecord(kind, name): Record<"en"|"zh"|"ja"|"de"|"fr"|"es"|"pt", string>` (localized 7-language image alt descriptions!).
  - `collectVisualTargets({ rootDir, target, slug }): VisualTarget[]`
    - `builds`: reads `apps/www/src/data/pc-builds.json` if present (otherwise empty array cleanly) → asset ID `build-${b.slug}`, file `apps/www/public/media/builds/${b.slug}.webp`, public path `/media/builds/${b.slug}.webp`, page `/builds/${b.slug}`, slot `"hero"`. Uses `b.imagePrompt` if present and valid, else `buildHardwarePrompt(...)`.
    - `gpus`: selects top 24 flagship/measured GPUs from `apps/www/src/data/gpus.json` (all `measured` discrete/Apple cards + RTX 5070 Ti, RTX 5060 Ti 16GB, RTX 4080 SUPER, RTX 4070 Ti SUPER, RTX A6000, RTX 6000 Ada, RX 7900 XT, Intel Arc B580) → asset ID `gpu-${g.slug}`, file `apps/www/public/media/gpus/${g.slug}.webp`, public path `/media/gpus/${g.slug}.webp`, page `/gpus/${g.slug}`, slot `"hero"`.
    - `hubs`: generates `builds-hero` (`/media/builds-hero.webp`, page `/builds`, slot `"hero"`) and `gpus-hero` (`/media/gpus-hero.webp`, page `/gpus`, slot `"hero"`).
- **CLI behavior** (only runs when executed as main entry `import.meta.url === pathToFileURL(process.argv[1]).href`):
  - Flags: `--target builds|gpus|hubs|all` (default `all`), `--slug <slug>`, `--limit <N>`, `--concurrency <N>` (default `3`), `--best-of <1|2|3>` (default `1`), `--force`, `--dry-run`.
  - Skips assets that already exist on disk as valid WebP unless `--force`.
  - Writes files atomically (`tmp` + `renameSync`) and updates `apps/www/src/data/media-manifest.json` atomically after each completed batch with `source: "clavue-img-webp"`.

---

## Deliverable 2: Upgrade `scripts/content/images.mjs`

Read `scripts/content/images.mjs` carefully first!
- Add first-class support for Clavue Image v3.1 gateway when `process.env.CLAVUE_API_BASE` is set (or `--clavue` flag is passed, defaulting `CLAVUE_API_BASE` to `http://192.168.2.100:11401/v1` when `--clavue` is passed!):
  - Sends `{ model: process.env.CLAVUE_IMAGE_MODEL || "clavue-img", prompt, size: "1344x768", steps: 9, guidance_scale: 0.0, output_format: "webp", response_format: "b64_json" }` to `${CLAVUE_API_BASE}/images/generations` (with optional `Authorization: Bearer ${CLAVUE_API_KEY}` header if set).
  - Appends `, zero text, no labels, no watermark` if missing from `prompt`.
  - Sets `source: "clavue-img-webp"` in `media-manifest.json`.
  - Preserves 100% existing behavior for `CLUSTER_HOST`, `CONTENT_LLM_API_KEY`, `--fallback-svg`, `--upgrade-svg`, `--svg-only`, `--dry-run`, `--locale`, `--limit`!

---

## Deliverable 3: `scripts/content/generate-build-guides.mjs`

Create a global multilingual PC-building & GPU-configuration guide generator targeting English & global searchers (`en`, `ja`, `de`, `fr`, `es`, `pt`, `zh`) using the Clavue LLM cluster (`http://192.168.2.100:11401/v1/chat/completions`, default `qwen3.8:27b`):
- **Exported `BUILD_GUIDE_TOPICS`** (16 high-intent hardware/PC-assembly topics grounded in real numbers from `benchmarks.json` & `gpus.json`):
  1. `best-2000-local-llm-pc-build` (`kind: "hardware"`)
  2. `rtx-4090-pc-build-parts-list` (`kind: "hardware"`)
  3. `dual-rtx-3090-48gb-build-guide` (`kind: "hardware"`)
  4. `rtx-5090-psu-cooling-airflow-guide` (`kind: "hardware"`)
  5. `amd-rx-7900-xtx-rocm-linux-build` (`kind: "hardware"`)
  6. `dual-gpu-motherboard-pcie-bifurcation` (`kind: "hardware"`)
  7. `ddr5-ram-bandwidth-moe-offload-guide` (`kind: "concept"`)
  8. `rtx-5080-vs-rtx-4090-full-build-cost` (`kind: "compare"`)
  9. `rtx-5070-ti-vs-rx-9070-xt-local-llm` (`kind: "compare"`)
  10. `dual-rtx-5060-ti-32gb-build-guide` (`kind: "hardware"`)
  11. `quiet-home-ai-workstation-acoustics` (`kind: "task"`)
  12. `used-rtx-3090-buying-stress-test-guide` (`kind: "task"`)
  13. `mac-studio-m5-ultra-vs-custom-rtx-build` (`kind: "compare"`)
  14. `psu-sizing-12v2x6-local-ai-rigs` (`kind: "hardware"`)
  15. `budget-24gb-vram-local-ai-pc-build` (`kind: "hardware"`)
  16. `rtx-pro-6000-96gb-workstation-build` (`kind: "hardware"`)
- **Strict Quality Gate Matching `scripts/content/verify.mjs` & `scripts/content/generate.mjs`**:
  - Read `scripts/content/verify.mjs` first so every generated article passes `verify.mjs` on the first try!
  - Export `buildGuidePrompt(topic, locale, groundingFacts)` and `validateGeneratedGuide(article, locale)`:
    - Title: concise, natural in target language, no slug labels, ≤ 95 chars.
    - Description: 60–160 chars.
    - Body: opens with a direct answer-first paragraph (≥ 140 Latin chars / ≥ 60 CJK chars BEFORE the first `##` heading!), contains a Markdown fact table with header + delimiter + ≥ 3 data rows, total length ≥ 1,200 Latin chars / ≥ 750 CJK chars, includes concrete internal links (`/builds/...`, `/gpus/...`, `/can-i-run`, `/benchmarks/...`), NEVER uses `"Strata Platform"` incorrectly or placeholder tokens.
    - FAQ: 3–4 direct-answer Q&As with no hedging openers (`"It depends"`, `"Well,"`, etc.).
    - `imagePrompt`: 4-part English hardware photography prompt (≥ 40 words, ending with `zero text, no labels, no watermark`).
  - CLI flags: `--locales en,ja,de,fr,es,pt,zh` (default `en,ja,de,fr,es,pt,zh`), `--slug <slug>`, `--limit <N>` (default `16`), `--concurrency <N>` (default `3`), `--publish-now` (sets `publishedAt` & `status: "live"` if passed, else `"scheduled"`), `--overwrite`, `--dry-run`.
  - Writes articles cleanly to `scripts/content/out/<locale>/<slug>.json` in the exact same JSON schema used by `apps/www/src/lib/articles.ts` and `scripts/content/verify.mjs`!
  - Only runs CLI when executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`).

---

## Deliverable 4: `package.json` & `scripts/content/hardware-visuals.test.mjs`

1. In `package.json`, add ONLY these two scripts:
   - `"media:hardware": "node scripts/media/generate-hardware-visuals.mjs"`
   - `"content:build-guides": "node scripts/content/generate-build-guides.mjs"`
2. Create `scripts/content/hardware-visuals.test.mjs` with ≥ 12 offline unit tests:
   - `isValidWebp` accepts valid `RIFF....WEBP` ≥ 1024 bytes and rejects PNG/empty/short buffers.
   - `buildHardwarePrompt` produces ≥ 40 words, ends with `zero text, no labels, no watermark`, contains no banned filler words (`masterpiece`, `8k`, `ultra detailed`).
   - `buildAltRecord` returns all 7 locales with non-empty localized alt text.
   - `collectVisualTargets` collects hub + GPU targets from `gpus.json` without crashing when `pc-builds.json` is absent.
   - `BUILD_GUIDE_TOPICS` has 16 unique URL-safe slugs with valid kinds.
   - `validateGeneratedGuide` accepts a valid English & Japanese & Chinese guide, rejects heading-first body, rejects missing Markdown table, rejects hedging FAQ answer, rejects too-short body.
   - `scripts/content/images.mjs` supports `--clavue` and `CLAVUE_API_BASE` (verified via `--dry-run` or source assertion).

---

## Verification & Delivery Steps
1. Run `node --test scripts/content/hardware-visuals.test.mjs` and full `npm test` — ALL MUST PASS (0 fail).
2. Run `node scripts/media/generate-hardware-visuals.mjs --target hubs --dry-run` and `node scripts/content/generate-build-guides.mjs --locales en,ja --limit 2 --dry-run` — MUST EXIT 0.
3. Run `git status` and verify ONLY allowed files were created/modified.
4. Write a concise summary in `grok/WP-3-report.md`.
5. Commit cleanly on branch `wp/3-clavue-media-pipeline`: `git add -A && git commit -m "feat(wp-3): add Clavue Image v3.1 hardware visuals and multilingual build-guide pipeline"`.
