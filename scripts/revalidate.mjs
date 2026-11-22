#!/usr/bin/env node
/**
 * Trigger zero-rebuild ISR revalidation on the running strata-www server.
 *
 *   node scripts/revalidate.mjs --scope releases
 *   node scripts/revalidate.mjs --scope guides --paths /en/guides/foo,/zh/guides/bar
 *   node scripts/revalidate.mjs --scope all
 *
 * Exits 0 when the live server confirms HTTP 200 `{ ok: true }`.
 * Exits non-zero when unauthorized, unreachable, or endpoint absent (so callers can fall back
 * to a full `deploy-www.sh` build when appropriate).
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveToken() {
  const explicit = process.env.STRATAT_REVALIDATE_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const candidates = [
    process.env.STRATAT_DASHBOARD_SECRET_FILE,
    "/etc/stratat-dashboard.secret",
    join(ROOT, ".dashboard-secret"),
  ].filter(Boolean);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (typeof parsed.pathKey === "string" && typeof parsed.password === "string") {
        return createHmac("sha256", parsed.password)
          .update(`revalidate-v1:${parsed.pathKey}`)
          .digest("hex");
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function parseArgs(argv) {
  const scopes = [];
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scope" && argv[i + 1]) {
      scopes.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    } else if (argv[i] === "--paths" && argv[i + 1]) {
      paths.push(...argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    }
  }
  return { scopes: scopes.length ? scopes : ["all"], paths };
}

async function main() {
  const token = resolveToken();
  if (!token) {
    console.error("revalidate: no STRATAT_REVALIDATE_SECRET or dashboard secret file found");
    process.exit(2);
  }
  const { scopes, paths } = parseArgs(process.argv.slice(2));
  const baseUrl = (process.env.STRATAT_INTERNAL_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/revalidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scopes, paths }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`revalidate: HTTP ${res.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }
  const json = JSON.parse(text);
  if (!json?.ok) {
    console.error(`revalidate: unexpected payload ${text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`revalidate: ok (${json.revalidated} paths, scopes=${(json.scopes ?? []).join(",")})`);
}

main().catch((err) => {
  console.error(`revalidate: ${err.message}`);
  process.exit(1);
});
