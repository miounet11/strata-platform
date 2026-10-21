import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, issueSession, loadSecret, passwordMatches, pathMatches } from "@/lib/dashboard/secret";

export const dynamic = "force-dynamic";

/**
 * Failures are counted per client so a guessed path cannot be paired with a dictionary attack
 * at machine speed. The window is short and in-memory: this is one operator's board, not an
 * account system, and a restart clearing the tally is acceptable.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; first: number }>();

function clientOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}

function tooMany(client: string, now: number): boolean {
  const entry = failures.get(client);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    failures.delete(client);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(client: string, now: number) {
  const entry = failures.get(client);
  if (!entry || now - entry.first > WINDOW_MS) failures.set(client, { count: 1, first: now });
  else entry.count += 1;
}

/**
 * Behind nginx the standalone server sees its own bind address as the request host, so an
 * absolute redirect would send the browser to `https://0.0.0.0:3000/...`. A relative Location
 * keeps the public scheme and host, which is also what the browser expects from a form POST.
 */
function redirectTo(path: string, extra?: HeadersInit) {
  return new NextResponse(null, { status: 303, headers: { Location: path, ...extra } });
}

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const secret = loadSecret();
  // Same 404 as any other unknown path: a wrong key must not reveal that a board exists.
  if (!secret || !pathMatches(secret, key)) return new NextResponse("Not Found", { status: 404 });

  const now = Date.now();
  const client = clientOf(request);
  if (tooMany(client, now)) return new NextResponse("Too Many Requests", { status: 429 });

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (!password || !passwordMatches(secret, password)) {
    recordFailure(client, now);
    return redirectTo(`/b/${key}?e=1`);
  }

  failures.delete(client);
  const response = redirectTo(`/b/${key}`);
  response.cookies.set(SESSION_COOKIE, issueSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/b/${key}`,
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
