#!/usr/bin/env node
/**
 * Next standalone does not include `.next/static` or `public`.
 * Copy them next to server.js after every www build (see deploy/Dockerfile.www).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(repoRoot, "apps/www");
// Keep in step with `distDir` in next.config.ts: deploys build into a staging directory.
const dist = join(www, process.env.NEXT_DIST_DIR || ".next");
const standalone = [
  join(dist, "standalone/apps/www"),
  join(dist, "standalone"),
].find((dir) => existsSync(join(dir, "server.js")));

if (!standalone) {
  console.warn("[standalone-assets] server.js not found, skip");
  process.exit(0);
}

function mirror(src, dest, skip = []) {
  if (!existsSync(src)) {
    console.warn(`[standalone-assets] missing ${src}`);
    return;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (path) => !skip.some((name) => path === join(src, name)),
  });
}

mirror(join(dist, "static"), join(standalone, ".next/static"));

// When media are served from the CDN, `public/media` is dead weight in the standalone tree —
// 21 MB duplicated on every deploy, and two retained builds make it 42 MB. The paths stay in the
// manifest; only the copy is skipped, so unsetting NEXT_PUBLIC_MEDIA_BASE restores local serving.
const mediaOnCdn = Boolean(process.env.NEXT_PUBLIC_MEDIA_BASE);
mirror(join(www, "public"), join(standalone, "public"), mediaOnCdn ? ["media"] : []);
if (mediaOnCdn) console.log("[standalone-assets] media served from CDN, skipping public/media");
console.log(`[standalone-assets] copied into ${standalone}`);
