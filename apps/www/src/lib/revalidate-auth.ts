import { createHmac, timingSafeEqual } from "node:crypto";
import { loadSecret } from "./dashboard/secret";

/**
 * Shared token derivation for internal on-demand revalidation (`POST /api/revalidate`).
 *
 * Uses `STRATAT_REVALIDATE_SECRET` when explicitly configured, and otherwise derives a
 * deterministic domain-separated HMAC from the host's root-only dashboard secret file
 * (`/etc/stratat-dashboard.secret`). If neither exists, revalidation is disabled (fail-closed).
 */
export function resolveRevalidateToken(): string | null {
  const explicit = process.env.STRATAT_REVALIDATE_SECRET?.trim();
  if (explicit && explicit.length >= 16) return explicit;
  const secret = loadSecret();
  if (!secret) return null;
  return createHmac("sha256", secret.password)
    .update(`revalidate-v1:${secret.pathKey}`)
    .digest("hex");
}

export function verifyRevalidateToken(candidate: string | null | undefined): boolean {
  const expected = resolveRevalidateToken();
  if (!expected || !candidate) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidate.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
