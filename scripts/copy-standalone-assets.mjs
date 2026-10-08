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
const standalone = [
  join(www, ".next/standalone/apps/www"),
  join(www, ".next/standalone"),
].find((dir) => existsSync(join(dir, "server.js")));

if (!standalone) {
  console.warn("[standalone-assets] server.js not found, skip");
  process.exit(0);
}

function mirror(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[standalone-assets] missing ${src}`);
    return;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

mirror(join(www, ".next/static"), join(standalone, ".next/static"));
mirror(join(www, "public"), join(standalone, "public"));
console.log(`[standalone-assets] copied into ${standalone}`);
