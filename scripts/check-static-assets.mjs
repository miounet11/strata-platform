#!/usr/bin/env node
/**
 * Guard for deploy-www.sh. nginx serves /_next/static/ from the swapped build tree's own
 * `static/` directory, not from the standalone copy. On 2026-11-11 the live `.next/static/chunks`
 * held 0 files and the site stayed up only because Cloudflare still had the previous build's
 * JS/CSS cached (age ~12 days). Swapping a tree like that white-screens the site the moment that
 * cache expires, so such a build must never become the live tree.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2] || process.env.NEXT_DIST_DIR || ".next-build";
const chunks = join(dist, "static", "chunks");

if (!existsSync(chunks)) {
  console.error(`[static-guard] ${chunks} does not exist`);
  process.exit(1);
}

// App-router chunks live under chunks/app/[locale]/ as well as at the top level, so walk the
// tree instead of counting only the root. A build with zero JS chunks anywhere is broken.
function jsFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) n += jsFiles(path);
    else if (entry.name.endsWith(".js")) n += 1;
  }
  return n;
}

const count = jsFiles(chunks);
if (count === 0) {
  console.error(`[static-guard] ${chunks} has no .js chunks`);
  process.exit(1);
}

console.log(`[static-guard] ${chunks}: ${count} JS chunks`);
