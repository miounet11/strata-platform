/**
 * X API cost controls: cooldown, user-id cache, request counting.
 * Billing is often per post/tweet returned — keep max_results and query count low.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE_DIR = join(ROOT, ".cache/intake");
const STATE_PATH = join(CACHE_DIR, "x-api-state.json");
const USER_IDS_PATH = join(CACHE_DIR, "x-user-ids.json");

export function xApiMode() {
  const m = (process.env.INTAKE_X_API ?? "budget").toLowerCase();
  if (m === "0" || m === "off" || m === "false") return "off";
  if (m === "full" || m === "1") return "full";
  return "budget";
}

export function xMaxResults() {
  const n = Number(process.env.INTAKE_X_MAX_RESULTS ?? (xApiMode() === "full" ? 20 : 10));
  return Math.min(100, Math.max(5, n));
}

export function xApiCooldownMs() {
  const mins = Number(process.env.INTAKE_X_API_COOLDOWN_MINUTES ?? 360);
  return Math.max(30, mins) * 60 * 1000;
}

export function gatewayCooldownMs() {
  const mins = Number(process.env.X_GATEWAY_COOLDOWN_MINUTES ?? 240);
  return Math.max(30, mins) * 60 * 1000;
}

export function shouldSkipGateway() {
  if (process.env.X_GATEWAY_FORCE === "1") return false;
  const { lastXApiAt } = loadXApiState();
  if (!lastXApiAt) return false;
  return Date.now() - new Date(lastXApiAt).getTime() < gatewayCooldownMs();
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function loadXApiState() {
  return readJson(STATE_PATH, { lastXApiAt: null, searchRotation: 0 });
}

export function saveXApiState(patch) {
  const next = { ...loadXApiState(), ...patch };
  writeJson(STATE_PATH, next);
  return next;
}

/** Skip paid X API this tick (still merge existing JSON + free RSS). */
export function shouldSkipXApi() {
  if (xApiMode() === "off") return true;
  if (process.env.INTAKE_X_API_FORCE === "1") return false;
  const { lastXApiAt } = loadXApiState();
  if (!lastXApiAt) return false;
  return Date.now() - new Date(lastXApiAt).getTime() < xApiCooldownMs();
}

export function markXApiRun(requestCount) {
  const state = loadXApiState();
  saveXApiState({
    lastXApiAt: new Date().toISOString(),
    lastRequestCount: requestCount,
    totalRuns: (state.totalRuns ?? 0) + 1,
    searchRotation: (state.searchRotation ?? 0) + 1,
  });
}

export function loadUserIdCache() {
  return readJson(USER_IDS_PATH, {});
}

export function cacheUserId(username, id) {
  const cache = loadUserIdCache();
  cache[username.toLowerCase()] = { id, cachedAt: new Date().toISOString() };
  writeJson(USER_IDS_PATH, cache);
}

export function getCachedUserId(username) {
  const row = loadUserIdCache()[username.toLowerCase()];
  return row?.id ?? null;
}

/** Pick N queries rotating each paid sync (spread cost across days). */
export function pickRotatingQueries(all, count, rotationIndex) {
  if (!all?.length || count <= 0) return [];
  if (count >= all.length) return all;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(all[(rotationIndex + i) % all.length]);
  }
  return out;
}

export function budgetUserHandles(allUsers) {
  const limit = Number(process.env.INTAKE_X_USER_LIMIT ?? 3);
  const override = process.env.INTAKE_X_USERS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (override?.length) return override.slice(0, limit);
  const priority = ["coldniko", "Niko1221", "ZedLLM"];
  const picked = [];
  for (const h of priority) {
    if (allUsers.includes(h) && picked.length < limit) picked.push(h);
  }
  for (const h of allUsers) {
    if (picked.length >= limit) break;
    if (!picked.includes(h)) picked.push(h);
  }
  return picked;
}

export function createRequestCounter() {
  return { requests: 0, tweets: 0, bump(n = 1) { this.requests += n; } };
}
