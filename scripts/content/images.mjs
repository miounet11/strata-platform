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
    if (manifest.assets[id]?.path) { skipped++; continue; }
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
    if (!Buffer.isBuffer(buf) || buf.length < 5000) throw new Error(`bad image (${buf?.length} bytes)`);
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
process.exit(failed > 0 ? 1 : 0);
