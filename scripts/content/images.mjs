// Generate one hero image per article and register it in the site's media manifest.
//
//   node scripts/content/images.mjs --locale en --limit 2
//   node scripts/content/images.mjs --dry-run
//
// Images go to apps/www/public/media/guides/<locale>/<slug>.webp so Next serves them as static
// files. The page looks the asset up as `guide-<slug>` in media-manifest.json, which is why the
// manifest write below is part of this step and not a separate one.
//
// Two backends exist. The gateway (CONTENT_LLM_BASE_URL) works from anywhere over HTTPS, which
// is what the scheduled job on the production host uses. The LAN cluster needs SSH into a
// private network and only the workstation can reach it; `CLUSTER_HOST` selects it explicitly.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateImage, generateImageViaGateway } from "../enrichment/cluster-client.mjs";

const useCluster = Boolean(process.env.CLUSTER_HOST);
const illustrateWith = useCluster ? generateImage : generateImageViaGateway;

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "scripts/content/out");
const PUBLIC = join(ROOT, "apps/www/public/media/guides");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");

const args = process.argv.slice(2);
const onlyLocale = args.includes("--locale") ? args[args.indexOf("--locale") + 1] : null;
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const dryRun = args.includes("--dry-run");

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
let done = 0, skipped = 0, failed = 0;
/** Per-article failures, so the alert names what actually broke instead of only a count. */
const failures = [];
const queue = [];

for (const entry of readdirSync(OUT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (onlyLocale && entry.name !== onlyLocale) continue;
  const dir = join(OUT, entry.name);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    const item = JSON.parse(readFileSync(path, "utf8"));
    const id = `guide-${item.slug}`;
    // A manifest entry alone does not mean the image exists. The manifest is a registry that is
    // written after every file, and it is shared across the checkout — so a path can be recorded
    // here while the file was never written (or was lost when public/media was pruned). Trusting
    // the entry alone made this step skip articles whose page would then render a broken hero.
    const recorded = manifest.assets[id]?.path;
    if (recorded && existsSync(join(ROOT, "apps/www/public", recorded.replace(/^\//, "")))) {
      skipped++;
      continue;
    }
    queue.push({ item, path, id });
  }
}

console.log(`→ ${Math.min(queue.length, limit)} of ${queue.length} article(s) need an image`);
if (dryRun) {
  for (const q of queue.slice(0, limit)) console.log("  ", q.item.locale, q.item.slug);
  process.exit(0);
}

async function illustrate({ item, path, id }) {
  const dir = join(PUBLIC, item.locale);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `${item.slug}.webp`);
  try {
    const prompt = item.article.imagePrompt ||
      "abstract editorial illustration, dark navy background, teal accent, geometric shapes, no text";
    const buf = await illustrateWith(prompt, { size: "1024x576" });
    // Same mistake as the gateway check: a small but complete WebP is a normal result for these
    // low-detail illustrations, so the container signature is what decides, not the byte count.
    if (
      !Buffer.isBuffer(buf) ||
      buf.length < 64 ||
      buf.subarray(0, 4).toString("latin1") !== "RIFF" ||
      buf.subarray(8, 12).toString("latin1") !== "WEBP"
    ) {
      throw new Error(`bad image (${buf?.length} bytes)`);
    }
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, target);

    manifest.assets[id] = {
      type: "image",
      path: `/media/guides/${item.locale}/${item.slug}.webp`,
      page: `/guides/${item.slug}`,
      slot: "hero",
      locale: item.locale,
      alt: { [item.locale]: item.article.title },
    };
    // Persist after every image: a run that dies halfway must not lose the finished ones.
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

    item.imagePath = `/media/guides/${item.locale}/${item.slug}.webp`;
    writeFileSync(path, `${JSON.stringify(item, null, 2)}\n`);
    done++;
    console.log(`   ok ${item.locale}/${item.slug} (${(buf.length / 1024).toFixed(0)} KiB)`);
  } catch (err) {
    failed++;
    console.error(`   fail ${item.locale}/${item.slug}: ${String(err.message).slice(0, 120)}`);
    failures.push(`${item.locale}/${item.slug}: ${String(err.message).slice(0, 160)}`);
  }
}

// The worker runs six replicas and each image takes ~30s, so a serial loop leaves five GPUs idle.
// Concurrency is capped low by default because one render is already heavy on the cluster.
const CONCURRENCY = Math.max(1, Number(process.env.IMAGE_CONCURRENCY ?? 4));
const todo = queue.slice(0, limit);
console.log(`→ generating with concurrency ${CONCURRENCY}`);
const workers = Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async (_, w) => {
  for (let i = w; i < todo.length; i += CONCURRENCY) await illustrate(todo[i]);
});
await Promise.all(workers);

console.log(`✓ generated=${done} skipped=${skipped} failed=${failed}`);

if (failed > 0) {
  // Until now this exited 1 with the detail only in stdout. In the scheduled run that stream goes
  // to a log on the host, so a broken image backend meant articles silently piled up in
  // "waiting for image" with nobody told why. Name the backend, the count and a sample.
  const { notifyFeishu } = await import("../notify.mjs");
  await notifyFeishu({
    stage: "content/images",
    reason: `配图生成失败 ${failed} 张（后端：${useCluster ? `cluster ${process.env.CLUSTER_HOST}` : "gateway"}）`,
    raw:
      `未生成的文章会一直被 publish.mjs 拦在 waiting for image，不会自动重试成功。\n` +
      `失败的 ${failed} 篇：\n${failures.slice(0, 5).join("\n")}` +
      (failures.length > 5 ? `\n… 另有 ${failures.length - 5} 篇` : ""),
  });
}
process.exit(failed > 0 ? 1 : 0);
