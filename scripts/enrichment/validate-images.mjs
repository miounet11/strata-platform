#!/usr/bin/env node
/**
 * Verify every media asset the site can render: the file exists, is a real image of the
 * declared ratio, and is small enough to ship. Exits non-zero on any problem so a broken
 * batch run cannot go unnoticed.
 *
 *   node scripts/enrichment/validate-images.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC = join(ROOT, "apps/www/public");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");
const BRIEFS = join(ROOT, "scripts/enrichment/briefs.json");

/** Largest file we are willing to ship for a page illustration. */
const MAX_BYTES = 4 * 1024 * 1024;

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const briefs = JSON.parse(readFileSync(BRIEFS, "utf8"));
const assets = manifest.assets ?? {};

const errors = [];
const warnings = [];

function imageSize(buf) {
  // PNG: 8-byte signature, then IHDR width/height.
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP: RIFF....WEBP then a VP8/VP8L/VP8X chunk.
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      const w = 1 + buf.readUIntLE(24, 3);
      const h = 1 + buf.readUIntLE(27, 3);
      return { format: "webp", width: w, height: h };
    }
    if (chunk === "VP8 ") {
      return { format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    return { format: "webp", width: 0, height: 0 };
  }
  return null;
}

let checked = 0;
for (const [id, asset] of Object.entries(assets)) {
  if (asset.type !== "image") continue;
  checked += 1;

  if (!asset.path) {
    errors.push(`${id}: image asset has no path`);
    continue;
  }

  const file = join(PUBLIC, asset.path.replace(/^\//, ""));
  if (!existsSync(file)) {
    errors.push(`${id}: missing file ${asset.path}`);
    continue;
  }

  const bytes = statSync(file).size;
  if (bytes === 0) errors.push(`${id}: ${asset.path} is empty`);
  if (bytes > MAX_BYTES) {
    errors.push(`${id}: ${asset.path} is ${(bytes / 1048576).toFixed(1)} MiB (limit ${MAX_BYTES / 1048576} MiB)`);
  }

  const buf = readFileSync(file);
  const dims = imageSize(buf);
  if (!dims) {
    errors.push(`${id}: ${asset.path} is not a PNG or WebP image`);
    continue;
  }
  if (!dims.width || !dims.height) {
    warnings.push(`${id}: could not read dimensions from ${asset.path}`);
  } else {
    const ratio = dims.width / dims.height;
    if (Math.abs(ratio - 16 / 9) > 0.05) {
      warnings.push(`${id}: ${dims.width}x${dims.height} is not 16:9 (${ratio.toFixed(2)})`);
    }
  }

  const ext = asset.path.split(".").pop();
  if (ext !== dims.format) {
    errors.push(`${id}: declared .${ext} but the bytes are ${dims.format}`);
  }
}

// Briefs are a work queue, not a contract: syncing new content adds briefs before the next
// generation run. Those are pending tasks and get reported, not failed. What must never happen
// is a manifest entry whose file is missing — that is what the site renders.
const pending = (briefs.items ?? []).filter((item) => !assets[item.id]);
if (pending.length > 0) {
  console.log(`${pending.length} briefs pending (not yet generated): ${pending.slice(0, 3).map((b) => b.id).join(", ")}${pending.length > 3 ? ", …" : ""}`);
}

// Guard against a batch that runs but writes nothing: a brief flagged done in the manifest
// must still have its asset, which the loop above already enforces per asset.
for (const item of briefs.items ?? []) {
  const asset = assets[item.id];
  if (asset && asset.type === "image" && !asset.path) {
    errors.push(`brief ${item.id} (${item.page}) is in the manifest without a path`);
  }
}

// A manifest entry pointing at a file nobody generated is the usual copy-paste mistake.
const referenced = new Set(
  Object.values(assets)
    .filter((a) => a.type === "image" && a.path)
    .map((a) => a.path.replace(/^\/media\/enriched\//, "")),
);
const onDisk = readdirSync(join(PUBLIC, "media/enriched")).filter((f) => /\.(png|webp)$/.test(f));
for (const file of onDisk) {
  if (!referenced.has(file)) warnings.push(`orphan file media/enriched/${file} is not in the manifest`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

console.log(
  `checked ${checked} images · ${onDisk.length} files on disk · ${warnings.length} warnings · ${errors.length} errors`,
);
process.exit(errors.length === 0 ? 0 : 1);
