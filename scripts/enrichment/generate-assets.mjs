#!/usr/bin/env node
/**
 * Batch-generate images (cluster qwen-image-21 via SSH), TTS, code entries → media manifest.
 * Requires CLUSTER_SSH_PASS (or key auth) for images. TTS uses LAN NodePort.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clusterConfig,
  generateImageB64,
  generateTtsBuffer,
} from "./cluster-client.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BRIEFS = join(ROOT, "scripts/enrichment/briefs.json");
const OUT_DIR = join(ROOT, "apps/www/public/media/enriched");
const MANIFEST = join(ROOT, "apps/www/src/data/media-manifest.json");

const limit = Number(process.env.ENRICH_LIMIT ?? "999");
const only = process.env.ENRICH_ONLY?.split(",").filter(Boolean);

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadManifest() {
  try {
    return loadJson(MANIFEST);
  } catch {
    return { syncedAt: null, cluster: clusterConfig().host, assets: {} };
  }
}

function saveManifest(m) {
  m.syncedAt = new Date().toISOString();
  m.cluster = clusterConfig().host;
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

const briefs = loadJson(BRIEFS);
const manifest = loadManifest();
mkdirSync(OUT_DIR, { recursive: true });

let done = 0;
for (const item of briefs.items) {
  if (done >= limit) break;
  if (only?.length && !only.includes(item.id)) continue;

  const existing = manifest.assets[item.id];
  if (existing?.type === "code") continue;
  if (
    existing?.path &&
    existsSync(join(ROOT, "apps/www/public", existing.path.replace(/^\//, "")))
  ) {
    continue;
  }

  console.log(`[enrich] ${item.id} (${item.type})`);
  try {
    if (item.type === "image") {
      if (!clusterConfig().sshPass && !process.env.CLUSTER_SSH_KEY) {
        console.warn("[enrich] skip image — set CLUSTER_SSH_PASS or SSH key");
        continue;
      }
      const b64 = await generateImageB64(item.prompt, {
        size: briefs.defaults?.imageSize,
        model: briefs.defaults?.imageModel,
      });
      const pngPath = join(OUT_DIR, `${item.id}.png`);
      writeFileSync(pngPath, Buffer.from(b64, "base64"));
      manifest.assets[item.id] = {
        type: "image",
        path: `/media/enriched/${item.id}.png`,
        page: item.page,
        slot: item.slot,
        alt: item.alt ?? {},
        prompt: item.prompt.slice(0, 200),
      };
    } else if (item.type === "tts") {
      const locale = Object.keys(item.text)[0];
      const text = item.text[locale];
      const buf = await generateTtsBuffer(text, {
        model: briefs.defaults?.ttsModel,
        voice: briefs.defaults?.ttsVoice,
      });
      const ext = buf[0] === 0x49 && buf[1] === 0x44 ? "mp3" : "wav";
      const rel = `/media/enriched/${item.id}.${ext}`;
      writeFileSync(join(OUT_DIR, `${item.id}.${ext}`), buf);
      manifest.assets[item.id] = {
        type: "tts",
        path: rel,
        page: item.page,
        slot: item.slot,
        locale,
        text,
      };
    } else if (item.type === "code") {
      manifest.assets[item.id] = {
        type: "code",
        page: item.page,
        slot: item.slot,
        language: item.language,
        title: item.title,
        body: item.body,
      };
    }
    done += 1;
    saveManifest(manifest);
  } catch (e) {
    console.error(`[enrich] ${item.id} failed:`, e.message);
  }
}

console.log(`[enrich] manifest ${Object.keys(manifest.assets).length} assets`);
