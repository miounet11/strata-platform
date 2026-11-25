// Editorial hardware WebP photography for PC builds, flagship GPUs, and hub pages.
//
//   node scripts/media/generate-hardware-visuals.mjs --target hubs --dry-run
//   node scripts/media/generate-hardware-visuals.mjs --target gpus --slug rtx-4090 --best-of 2
//
// Pure helpers are importable. The CLI runs only when this file is the process entry.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROMPT_ENDING = "zero text, no labels, no watermark";
const BANNED_FILLER = /\b(?:masterpiece|8k|ultra detailed)\b/i;
const WEBP_MIN_BYTES = 1024;
const FLAGSHIP_LIMIT = 24;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALT_KIND = {
  en: { gpu: "graphics card", build: "PC build", hub: "hardware overview", hardware: "PC hardware" },
  zh: { gpu: "显卡", build: "装机配置", hub: "硬件总览", hardware: "电脑硬件" },
  ja: { gpu: "グラフィックカード", build: "PC構成", hub: "ハードウェア概要", hardware: "PCハードウェア" },
  de: { gpu: "Grafikkarte", build: "PC-Build", hub: "Hardware-Überblick", hardware: "PC-Hardware" },
  fr: { gpu: "carte graphique", build: "configuration PC", hub: "aperçu matériel", hardware: "matériel PC" },
  es: { gpu: "tarjeta gráfica", build: "configuración de PC", hub: "resumen de hardware", hardware: "hardware de PC" },
  pt: { gpu: "placa de vídeo", build: "montagem de PC", hub: "visão geral de hardware", hardware: "hardware de PC" },
};

/** Curated flagship names. Matchers prefer the short catalog slug over CSV dump duplicates. */
const FLAGSHIP_RULES = [
  {
    test: (gpu) => /5070\s*ti/i.test(gpu.name) && !/super/i.test(gpu.name) && !/mobile/i.test(`${gpu.slug} ${gpu.name}`),
  },
  {
    test: (gpu) => /5060\s*ti/i.test(gpu.name) && Number(gpu.vramGb) >= 16 && !/\b8\s*gb\b/i.test(gpu.name),
  },
  { test: (gpu) => /4080\s*super/i.test(gpu.name) },
  { test: (gpu) => /4070\s*ti\s*super/i.test(gpu.name) && !/ad102/i.test(`${gpu.slug} ${gpu.name}`) },
  { test: (gpu) => gpu.slug === "rtx-a6000" || /^rtx a6000$/i.test(gpu.name) },
  { test: (gpu) => gpu.slug === "rtx-6000-ada" || /6000\s*ada/i.test(gpu.name) },
  { test: (gpu) => /7900\s*xt(?!x)/i.test(gpu.name) },
  { test: (gpu) => gpu.slug === "intel-arc-b580" || /arc\s*b580/i.test(gpu.name) },
];

export function isValidWebp(buf) {
  if (!buf) return false;
  const bytes = Buffer.isBuffer(buf) ? buf : buf instanceof Uint8Array ? Buffer.from(buf) : null;
  if (!bytes || bytes.length < WEBP_MIN_BYTES) return false;
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
}

/** A file already on disk is reused unless `--force` asked for a new render. */
export function assetNeedsRender(bytes, { force = false } = {}) {
  if (force) return true;
  return !isValidWebp(bytes);
}

function physicalSubject({ kind, name, formFactor, gpuCount }) {
  const blob = `${name || ""} ${formFactor || ""}`.toLowerCase();
  const count = Number(gpuCount) || 0;
  if (count >= 2 || /\bdual\b/.test(blob)) {
    return "a dual-GPU tower, built as an open-frame matte-black PC workstation with two full-length graphics cards";
  }
  if (blob.includes("mac studio")) {
    return "a compact Mac Studio mini workstation in brushed aluminum";
  }
  if (/\bmini\b/.test(blob)) {
    return "a mini workstation with a compact matte-black chassis and a single low-profile accelerator";
  }
  if (kind === "gpu" || kind === "gpus") {
    return "a brushed aluminum graphics card standing on its edge, fins and shroud facing the lens";
  }
  return "an open-frame matte-black PC workstation with one flagship graphics card seated in the primary slot";
}

/**
 * Clavue Image v3.1 4-part director grammar:
 * medium lock, physical subject, lighting/materials, lens framing.
 */
export function buildHardwarePrompt({ kind, name, subtitle, vendor, formFactor, gpuCount } = {}) {
  const label = [name, subtitle].filter((part) => String(part || "").trim()).join(", ") || "flagship local AI hardware";
  const maker = String(vendor || "consumer").trim();
  const subject = physicalSubject({ kind, name, formFactor, gpuCount });
  const prompt = [
    `Editorial hardware studio photograph of ${label}.`,
    `The concrete physical subject is ${subject}.`,
    `It is a real ${maker} machine a buyer can compare, with visible power connectors, braided leads, and a quiet airflow path across the chassis.`,
    "Lighting and materials use controlled rim light, dark anodized aluminum, copper heatpipes, a dark slate desk, and a subtle warm accent balanced by a cool accent.",
    `Lens framing is a 50mm prime lens, shallow depth of field, 16:9 widescreen composition, ${PROMPT_ENDING}`,
  ].join(" ");
  if (BANNED_FILLER.test(prompt)) {
    throw new Error("hardware prompt contained a banned filler tag");
  }
  return prompt;
}

export function isAcceptableHardwarePrompt(text) {
  if (typeof text !== "string") return false;
  const prompt = text.trim();
  const words = prompt.split(/\s+/).filter(Boolean);
  if (words.length < 40) return false;
  if (!prompt.endsWith(PROMPT_ENDING)) return false;
  if (BANNED_FILLER.test(prompt)) return false;
  return true;
}

function kindPhrase(locale, kind) {
  const table = ALT_KIND[locale];
  return table[kind] || table.hardware;
}

export function buildAltRecord(kind, name) {
  const safeName = String(name || "").trim() || "hardware";
  const k = String(kind || "hardware");
  return {
    en: `Editorial studio photograph of ${safeName}, a ${kindPhrase("en", k)} on a dark slate desk`,
    zh: `${safeName} 的编辑级棚拍照片，画面主体是${kindPhrase("zh", k)}，置于深色石板桌面`,
    ja: `${safeName} の編集スタジオ写真。被写体は${kindPhrase("ja", k)}で、暗いスレート机の上に置かれている`,
    de: `Redaktionelles Studiofoto von ${safeName}, ${kindPhrase("de", k)} auf einem dunklen Schiefer-Schreibtisch`,
    fr: `Photographie de studio éditoriale de ${safeName}, ${kindPhrase("fr", k)} sur un bureau en ardoise sombre`,
    es: `Fotografía editorial de estudio de ${safeName}, ${kindPhrase("es", k)} sobre un escritorio de pizarra oscura`,
    pt: `Fotografia editorial de estúdio de ${safeName}, ${kindPhrase("pt", k)} sobre uma mesa de ardósia escura`,
  };
}

function catalogScore(gpu) {
  let score = 0;
  if (gpu.evidence === "measured") score += 100;
  if (!/20\d{2}/.test(gpu.slug || "")) score += 50;
  if (!/mobile/i.test(`${gpu.slug} ${gpu.name}`)) score += 20;
  const dashes = (String(gpu.slug || "").match(/-/g) || []).length;
  if (dashes <= 5) score += 10;
  score += Math.min(Number(gpu.vramGb) || 0, 128) / 1000;
  return score;
}

function isMeasuredDiscreteOrApple(gpu) {
  if (gpu?.evidence !== "measured") return false;
  const blob = `${gpu.vendor || ""} ${gpu.name || ""} ${gpu.slug || ""} ${gpu.bus || ""}`.toLowerCase();
  if (/system-shared|integrated/.test(blob)) return false;
  if (gpu.vendor === "apple" || /apple|mac studio|macbook|mac mini/.test(blob)) return true;
  const vendor = String(gpu.vendor || "").toLowerCase();
  if (!["nvidia", "amd", "intel"].includes(vendor)) return false;
  if (vendor === "intel" && !/\barc\b/.test(blob)) return false;
  return true;
}

function pickBest(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => catalogScore(b) - catalogScore(a))[0];
}

/** Measured discrete/Apple cards, plus the named flagship list, deduped, capped at 24. */
export function selectFlagshipGpus(gpus) {
  const list = Array.isArray(gpus) ? gpus : [];
  const measured = list
    .filter(isMeasuredDiscreteOrApple)
    .sort((a, b) => (Number(b.vramGb) || 0) - (Number(a.vramGb) || 0) || (Number(b.writingTps) || 0) - (Number(a.writingTps) || 0));
  const chosen = [];
  const seen = new Set();
  const push = (gpu) => {
    if (!gpu?.slug || seen.has(gpu.slug)) return;
    seen.add(gpu.slug);
    chosen.push(gpu);
  };
  for (const gpu of measured) push(gpu);
  for (const rule of FLAGSHIP_RULES) push(pickBest(list.filter(rule.test)));
  return chosen.slice(0, FLAGSHIP_LIMIT);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readBuilds(rootDir) {
  const file = join(rootDir, "apps/www/src/data/pc-builds.json");
  if (!existsSync(file)) return [];
  const data = readJson(file);
  if (Array.isArray(data)) return data;
  const list = data?.builds ?? data?.items ?? [];
  return Array.isArray(list) ? list : [];
}

function readGpuList(rootDir) {
  const file = join(rootDir, "apps/www/src/data/gpus.json");
  if (!existsSync(file)) return [];
  const data = readJson(file);
  return Array.isArray(data) ? data : data?.gpus ?? [];
}

function visualTarget({ id, kind, slug, name, file, path, page, prompt, vendor }) {
  return {
    id,
    kind,
    slug,
    name,
    file,
    path,
    page,
    slot: "hero",
    prompt,
    alt: buildAltRecord(kind, name),
    vendor: vendor || null,
  };
}

function buildTargets(rootDir) {
  return readBuilds(rootDir).filter((build) => build?.slug).map((build) => {
    const name = build.name || build.title || build.slug;
    const custom = typeof build.imagePrompt === "string" ? build.imagePrompt.trim() : "";
    const prompt = isAcceptableHardwarePrompt(custom)
      ? custom
      : buildHardwarePrompt({
          kind: "build",
          name,
          subtitle: build.subtitle,
          vendor: build.vendor,
          formFactor: build.formFactor,
          gpuCount: build.gpuCount,
        });
    return visualTarget({
      id: `build-${build.slug}`,
      kind: "build",
      slug: build.slug,
      name,
      file: join(rootDir, "apps/www/public/media/builds", `${build.slug}.webp`),
      path: `/media/builds/${build.slug}.webp`,
      page: `/builds/${build.slug}`,
      prompt,
      vendor: build.vendor,
    });
  });
}

function gpuTargets(rootDir) {
  return selectFlagshipGpus(readGpuList(rootDir)).map((gpu) =>
    visualTarget({
      id: `gpu-${gpu.slug}`,
      kind: "gpu",
      slug: gpu.slug,
      name: gpu.name || gpu.slug,
      file: join(rootDir, "apps/www/public/media/gpus", `${gpu.slug}.webp`),
      path: `/media/gpus/${gpu.slug}.webp`,
      page: `/gpus/${gpu.slug}`,
      prompt: buildHardwarePrompt({
        kind: "gpu",
        name: gpu.name || gpu.slug,
        vendor: gpu.vendor,
        subtitle: gpu.vramGb ? `${gpu.vramGb} GB` : undefined,
      }),
      vendor: gpu.vendor,
    }),
  );
}

function hubTargets(rootDir) {
  return [
    visualTarget({
      id: "builds-hero",
      kind: "hub",
      slug: "builds-hero",
      name: "PC builds",
      file: join(rootDir, "apps/www/public/media/builds-hero.webp"),
      path: "/media/builds-hero.webp",
      page: "/builds",
      prompt: buildHardwarePrompt({
        kind: "hub",
        name: "PC builds",
        subtitle: "open-frame workstations",
        formFactor: "workstation",
      }),
    }),
    visualTarget({
      id: "gpus-hero",
      kind: "hub",
      slug: "gpus-hero",
      name: "Flagship graphics cards",
      file: join(rootDir, "apps/www/public/media/gpus-hero.webp"),
      path: "/media/gpus-hero.webp",
      page: "/gpus",
      prompt: buildHardwarePrompt({
        kind: "gpu",
        name: "flagship graphics cards",
        subtitle: "brushed aluminum",
      }),
    }),
  ];
}

export function collectVisualTargets({ rootDir, target = "all", slug } = {}) {
  const root = rootDir || ROOT;
  const want = target || "all";
  let targets = [];
  if (want === "builds" || want === "all") targets = targets.concat(buildTargets(root));
  if (want === "gpus" || want === "all") targets = targets.concat(gpuTargets(root));
  if (want === "hubs" || want === "all") targets = targets.concat(hubTargets(root));
  if (slug) targets = targets.filter((item) => item.slug === slug || item.id === slug);
  return targets;
}

export function parseTasteJudgment(status, body) {
  if (status !== 200 || !body || typeof body !== "object") return { ok: false };
  if (Number.isInteger(body.best)) return { ok: true, index: body.best };
  if (Number.isInteger(body.index)) return { ok: true, index: body.index };
  if (Number.isInteger(body.winner)) return { ok: true, index: body.winner };
  const scores = Array.isArray(body.scores)
    ? body.scores
    : Array.isArray(body.data)
      ? body.data.map((entry) => entry?.score)
      : null;
  if (!scores || !scores.length || scores.every((score) => !Number.isFinite(Number(score)))) return { ok: false };
  let best = 0;
  for (let i = 1; i < scores.length; i++) {
    if (Number(scores[i]) > Number(scores[best])) best = i;
  }
  return { ok: true, index: best };
}

/** Taste failures and timeouts keep the first valid WebP instead of aborting the batch. */
export function pickJudgedWebp(buffers, judgment) {
  const valid = (buffers || []).map((buf, index) => ({ buf, index })).filter((item) => isValidWebp(item.buf));
  if (!valid.length) return null;
  if (!judgment || judgment.ok !== true || !Number.isInteger(judgment.index)) return valid[0].buf;
  return (valid.find((item) => item.index === judgment.index) ?? valid[0]).buf;
}

function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function optionValue(args, name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parseHardwareArgs(argv) {
  const args = argv.slice(2);
  const limitRaw = optionValue(args, "limit");
  const bestRaw = optionValue(args, "best-of");
  return {
    target: optionValue(args, "target") || "all",
    slug: optionValue(args, "slug"),
    limit: limitRaw != null ? Number(limitRaw) : Infinity,
    concurrency: Math.max(1, Number(optionValue(args, "concurrency") ?? 3)),
    bestOf: Math.min(3, Math.max(1, Number(bestRaw ?? 1) || 1)),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  };
}

function clavueConfig() {
  const base = (process.env.CLAVUE_API_BASE || "http://192.168.2.100:11401/v1").replace(/\/$/, "");
  const headers = { "Content-Type": "application/json" };
  const key = process.env.CLAVUE_API_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return { base, headers, model: process.env.CLAVUE_IMAGE_MODEL || "clavue-img" };
}

async function generateOneImage(prompt, seed) {
  const { base, headers, model } = clavueConfig();
  const response = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      prompt,
      size: "1344x768",
      steps: 9,
      guidance_scale: 0.0,
      output_format: "webp",
      response_format: "b64_json",
      seed,
    }),
    signal: AbortSignal.timeout(240000),
  });
  if (!response.ok) {
    throw new Error(`clavue image ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }
  const json = await response.json();
  const inline = json?.data?.[0]?.b64_json;
  if (!inline) throw new Error("clavue image response missing b64_json");
  return Buffer.from(inline, "base64");
}

async function judgeCandidates(buffers) {
  const { base, headers } = clavueConfig();
  try {
    const response = await fetch(`${base}/taste/image`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "clavue-taste-image",
        images: buffers.map((buf) => buf.toString("base64")),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return parseTasteJudgment(response.status, body);
  } catch {
    return { ok: false };
  }
}

async function renderTarget(target, bestOf) {
  const prompt = isAcceptableHardwarePrompt(target.prompt) ? target.prompt.trim() : buildHardwarePrompt(target);
  const buffers = [];
  for (let index = 0; index < bestOf; index++) {
    try {
      buffers.push(await generateOneImage(prompt, 11 + index));
    } catch (error) {
      if (bestOf === 1) throw error;
      buffers.push(Buffer.alloc(0));
    }
  }
  const judgment = bestOf > 1 ? await judgeCandidates(buffers) : null;
  const chosen = pickJudgedWebp(buffers, judgment);
  if (!chosen) throw new Error("no valid WebP in clavue response");
  return chosen;
}

function rememberAssets(rootDir, done) {
  if (!done.length) return;
  const manifestPath = join(rootDir, "apps/www/src/data/media-manifest.json");
  const manifest = readJson(manifestPath);
  manifest.assets ??= {};
  for (const item of done) {
    manifest.assets[item.id] = {
      type: "image",
      path: item.path,
      page: item.page,
      slot: item.slot,
      source: "clavue-img-webp",
      alt: item.alt,
      prompt: item.prompt,
    };
  }
  manifest.syncedAt = new Date().toISOString();
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const width = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: items.length ? width : 0 }, () => worker()));
  return results;
}

export async function runHardwareCli(argv = process.argv, rootDir = ROOT) {
  const options = parseHardwareArgs(argv);
  if (!["builds", "gpus", "hubs", "all"].includes(options.target)) {
    console.error(`unknown --target ${options.target}`);
    return 2;
  }
  let targets = collectVisualTargets({ rootDir, target: options.target, slug: options.slug });
  if (Number.isFinite(options.limit)) targets = targets.slice(0, Math.max(0, options.limit));

  const pending = [];
  let skipped = 0;
  for (const target of targets) {
    const bytes = existsSync(target.file) ? readFileSync(target.file) : null;
    if (!assetNeedsRender(bytes, { force: options.force })) {
      skipped++;
      continue;
    }
    pending.push(target);
  }

  console.log(
    `→ ${pending.length} hardware visual(s), skipped=${skipped}, target=${options.target}, best-of=${options.bestOf}` +
      (options.dryRun ? ", dry-run" : ""),
  );
  for (const target of (options.dryRun ? targets : pending)) {
    console.log(`  ${target.id} ${target.path} ${target.page}`);
  }
  if (options.dryRun) return 0;
  if (!pending.length) return 0;

  const done = [];
  let failed = 0;
  await mapPool(pending, options.concurrency, async (target) => {
    try {
      const bytes = await renderTarget(target, options.bestOf);
      writeAtomic(target.file, bytes);
      done.push(target);
      console.log(`   ok ${target.id} (${(bytes.length / 1024).toFixed(0)} KiB)`);
    } catch (error) {
      failed++;
      console.error(`   fail ${target.id}: ${String(error.message || error).slice(0, 160)}`);
    }
  });
  rememberAssets(rootDir, done);
  console.log(`✓ wrote=${done.length} skipped=${skipped} failed=${failed}`);
  return failed > 0 ? 1 : 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  runHardwareCli().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
