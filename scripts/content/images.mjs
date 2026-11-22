// Generate one hero image per article and register it in the site's media manifest.
//
//   node scripts/content/images.mjs --locale en --limit 2
//   node scripts/content/images.mjs --fallback-svg   # deterministic SVG cover when AI worker unavailable
//   node scripts/content/images.mjs --upgrade-svg    # replace procedural SVG covers with AI WebP
//   node scripts/content/images.mjs --dry-run
//
// Keys are locale-scoped (`guide-<locale>-<slug>`) so two locales sharing a slug never overwrite
// each other's cover or alt text; legacy `guide-<slug>` entries remain recognised.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateImage, generateImageViaGateway } from "../enrichment/cluster-client.mjs";
import { renderCoverSvg } from "./cover-svg.mjs";

const useCluster = Boolean(process.env.CLUSTER_HOST);
const hasGateway = Boolean(process.env.CONTENT_LLM_API_KEY?.trim());
const canUseAi = useCluster || hasGateway;
const illustrateWith = useCluster ? generateImage : generateImageViaGateway;

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "scripts/content/out");
const PUBLIC = join(ROOT, "apps/www/public/media/guides");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");

const args = process.argv.slice(2);
const onlyLocale = args.includes("--locale") ? args[args.indexOf("--locale") + 1] : null;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const dryRun = args.includes("--dry-run");
const fallbackSvg = args.includes("--fallback-svg") || !canUseAi;
const upgradeSvg = args.includes("--upgrade-svg");
const svgOnly = args.includes("--svg-only") || !canUseAi;

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
manifest.assets ??= {};

let done = 0;
let svgDone = 0;
let skipped = 0;
let failed = 0;
const failures = [];
const queue = [];

function existingAssetFor(item) {
  const scoped = manifest.assets[`guide-${item.locale}-${item.slug}`];
  if (scoped?.path) return { key: `guide-${item.locale}-${item.slug}`, asset: scoped };
  const shared = manifest.assets[`guide-${item.slug}`];
  if (shared?.path) return { key: `guide-${item.slug}`, asset: shared };
  return null;
}

if (existsSync(OUT)) {
  for (const entry of readdirSync(OUT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (onlyLocale && entry.name !== onlyLocale) continue;
    const dir = join(OUT, entry.name);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const path = join(dir, file);
      const item = JSON.parse(readFileSync(path, "utf8"));
      const id = `guide-${item.locale}-${item.slug}`;
      const existing = existingAssetFor(item);
      const onDisk =
        existing?.asset?.path &&
        existsSync(join(ROOT, "apps/www/public", existing.asset.path.replace(/^\//, "")));
      const isProcedural = existing?.asset?.source === "procedural-svg";

      if (onDisk && !(upgradeSvg && isProcedural && canUseAi)) {
        skipped++;
        continue;
      }
      queue.push({ item, path, id });
    }
  }
}

console.log(
  `→ ${Math.min(queue.length, limit)} of ${queue.length} article(s) need a cover ` +
    `(mode=${svgOnly ? "procedural-svg" : useCluster ? "cluster" : "gateway"}, fallbackSvg=${fallbackSvg})`,
);
if (dryRun) {
  for (const q of queue.slice(0, limit)) console.log("  ", q.item.locale, q.item.slug);
  process.exit(0);
}

function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

function writeProceduralCover({ item, path, id }) {
  const dir = join(PUBLIC, item.locale);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${item.slug}.svg`);
  const svg = renderCoverSvg({ slug: item.slug, locale: item.locale, kind: item.kind });
  writeAtomic(target, svg);

  const relPath = `/media/guides/${item.locale}/${item.slug}.svg`;
  manifest.assets[id] = {
    type: "image",
    path: relPath,
    page: `/guides/${item.slug}`,
    slot: "hero",
    locale: item.locale,
    source: "procedural-svg",
    alt: { [item.locale]: item.article.title },
  };
  item.imagePath = relPath;
  writeAtomic(path, `${JSON.stringify(item, null, 2)}\n`);
  svgDone++;
}

async function illustrate({ item, path, id }) {
  if (svgOnly) {
    writeProceduralCover({ item, path, id });
    return;
  }

  const dir = join(PUBLIC, item.locale);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${item.slug}.webp`);
  try {
    const prompt =
      item.article.imagePrompt ||
      "abstract editorial illustration, dark navy background, teal accent, geometric shapes, no text";
    const buf = await illustrateWith(prompt, { size: "1024x576" });
    if (
      !Buffer.isBuffer(buf) ||
      buf.length < 64 ||
      buf.subarray(0, 4).toString("latin1") !== "RIFF" ||
      buf.subarray(8, 12).toString("latin1") !== "WEBP"
    ) {
      throw new Error(`bad image (${buf?.length} bytes)`);
    }
    writeAtomic(target, buf);

    const relPath = `/media/guides/${item.locale}/${item.slug}.webp`;
    manifest.assets[id] = {
      type: "image",
      path: relPath,
      page: `/guides/${item.slug}`,
      slot: "hero",
      locale: item.locale,
      source: useCluster ? "cluster-webp" : "gateway-webp",
      alt: { [item.locale]: item.article.title },
    };
    writeAtomic(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    item.imagePath = relPath;
    writeAtomic(path, `${JSON.stringify(item, null, 2)}\n`);
    done++;
    console.log(`   ok ${item.locale}/${item.slug} (${(buf.length / 1024).toFixed(0)} KiB)`);
  } catch (err) {
    if (fallbackSvg) {
      writeProceduralCover({ item, path, id });
      console.log(`   svg-fallback ${item.locale}/${item.slug} (${String(err.message).slice(0, 80)})`);
      return;
    }
    failed++;
    console.error(`   fail ${item.locale}/${item.slug}: ${String(err.message).slice(0, 120)}`);
    failures.push(`${item.locale}/${item.slug}: ${String(err.message).slice(0, 160)}`);
  }
}

const CONCURRENCY = svgOnly ? 1 : Math.max(1, Number(process.env.IMAGE_CONCURRENCY ?? 4));
const todo = queue.slice(0, limit);
const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, async (_, w) => {
  for (let i = w; i < todo.length; i += CONCURRENCY) await illustrate(todo[i]);
});
await Promise.all(workers);

if (svgDone > 0 || done > 0) {
  writeAtomic(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`✓ generated=${done} svg=${svgDone} skipped=${skipped} failed=${failed}`);

if (failed > 0) {
  const { notifyFeishu } = await import("../notify.mjs");
  await notifyFeishu({
    stage: "content/images",
    reason: `配图生成失败 ${failed} 张（后端：${useCluster ? `cluster ${process.env.CLUSTER_HOST}` : "gateway"}）`,
    raw:
      `失败的 ${failed} 篇：\n${failures.slice(0, 5).join("\n")}` +
      (failures.length > 5 ? `\n… 另有 ${failures.length - 5} 篇` : ""),
  });
}
process.exit(failed > 0 ? 1 : 0);
