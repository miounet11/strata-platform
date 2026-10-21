import { NextResponse } from "next/server";
import { SESSION_COOKIE, loadSecret, pathMatches } from "@/lib/dashboard/secret";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const secret = loadSecret();
  if (!secret || !pathMatches(secret, key)) return new NextResponse("Not Found", { status: 404 });

  // Relative Location: behind nginx the server's own bind address would leak into the redirect.
  const response = new NextResponse(null, { status: 303, headers: { Location: `/b/${key}` } });
  // The cookie was scoped to the board path; clearing it without that path leaves a stale
  // cookie in the browser that still looks like a session.
  response.cookies.set(SESSION_COOKIE, "", { path: `/b/${key}`, maxAge: 0 });
  return response;
}
