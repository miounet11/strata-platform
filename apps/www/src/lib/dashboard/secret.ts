import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The board is not a logged-in feature: there is one operator and one password, and neither
 * the password nor the path may appear in the public repository. Both therefore live in a
 * server-only file written by `scripts/dashboard-secret.mjs`:
 *
 *   { "pathKey": "<48 hex>", "password": "scrypt$N$r$p$<salt>$<hash>" }
 *
 * If the file is absent the board simply does not exist — every request 404s, which is also
 * what a wrong path gets. A missing secret must never fall back to a default password.
 */
export type DashboardSecret = { pathKey: string; password: string };

export const SESSION_COOKIE = "strata_board";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function candidateFiles(): string[] {
  return [
    process.env.STRATAT_DASHBOARD_SECRET_FILE,
    "/etc/stratat-dashboard.secret",
    join(process.cwd(), ".dashboard-secret"),
  ].filter((file): file is string => Boolean(file));
}

let cached: { file: string; mtimeMs: number; secret: DashboardSecret } | null = null;

export function loadSecret(): DashboardSecret | null {
  for (const file of candidateFiles()) {
    if (!existsSync(file)) continue;
    try {
      const mtimeMs = statSync(file).mtimeMs;
      if (cached && cached.file === file && cached.mtimeMs === mtimeMs) return cached.secret;
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<DashboardSecret>;
      if (typeof parsed.pathKey !== "string" || typeof parsed.password !== "string") continue;
      if (parsed.pathKey.length < 24 || !parsed.password.startsWith("scrypt$")) continue;
      cached = { file, mtimeMs, secret: { pathKey: parsed.pathKey, password: parsed.password } };
      return cached.secret;
    } catch {
      /* unreadable or half-written: try the next location */
    }
  }
  return null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Equal-length comparison, so a probe cannot learn the key from response timing. */
export function pathMatches(secret: DashboardSecret, key: string): boolean {
  return timingSafeEqual(digest(secret.pathKey), digest(key));
}

export function passwordMatches(secret: DashboardSecret, password: string): boolean {
  const parts = secret.password.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, stored] = parts;
  const expected = Buffer.from(stored, "base64url");
  if (!expected.length) return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Sessions are stateless: an expiry plus an HMAC keyed by the secret itself. Rotating the
 * password file therefore invalidates every outstanding cookie, which is the behaviour you
 * want when the reason for rotating is that someone else learned the password.
 */
function sessionSignature(secret: DashboardSecret, expires: string): string {
  return createHmac("sha256", secret.password).update(`v1:${expires}`).digest("base64url");
}

export function issueSession(secret: DashboardSecret, now = Date.now()): string {
  const expires = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  return `${expires}.${sessionSignature(secret, expires)}`;
}

export function verifySession(secret: DashboardSecret, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const index = token.indexOf(".");
  if (index <= 0) return false;
  const expires = token.slice(0, index);
  const given = token.slice(index + 1);
  if (!/^\d{1,12}$/.test(expires)) return false;
  if (Number(expires) * 1000 <= now) return false;
  const expected = sessionSignature(secret, expires);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
