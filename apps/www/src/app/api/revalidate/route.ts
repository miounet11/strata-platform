import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { resetArticleCache } from "@/lib/articles";
import { verifyRevalidateToken } from "@/lib/revalidate-auth";
import { GUIDE_KINDS } from "@/lib/routes";

export const dynamic = "force-dynamic";

type Scope = "releases" | "guides" | "community" | "topics" | "vps" | "all";

const SCOPE_PATHS: Record<Exclude<Scope, "all">, string[]> = {
  releases: ["", "/releases", "/changelog", "/download", "/install"],
  guides: ["", "/guides", ...GUIDE_KINDS.map((k) => `/guides/category/${k}`)],
  community: ["", "/community", "/issues", "/pulls", "/pulse", "/creator"],
  topics: ["", "/topics", "/best", "/method", "/can-i-run"],
  vps: ["/vps"],
};

const ROOT_ENDPOINTS = ["/sitemap.xml", "/sitemaps/core.xml", "/llms.txt", "/changelog/rss.xml"];

/**
 * Authenticated internal endpoint for zero-rebuild content freshness.
 *
 * When `freshness-watch.mjs`, `content-grow.mjs`, or `daily-guides.sh` writes updated JSON or
 * flips guides to `live`, posting here invalidates the affected Next ISR cache entries in
 * milliseconds instead of running a 13-40 minute full `next build`.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const token = bearer ?? request.headers.get("x-revalidate-token");
  if (!verifyRevalidateToken(token)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { paths?: unknown; scopes?: unknown } = {};
  try {
    body = (await request.json()) as { paths?: unknown; scopes?: unknown };
  } catch {
    body = {};
  }

  // Always drop the in-memory guide corpus cache so newly published articles read immediately.
  resetArticleCache();

  const targets = new Set<string>(ROOT_ENDPOINTS);
  const rawScopes = Array.isArray(body.scopes) ? (body.scopes as Scope[]) : [];
  const scopes: Exclude<Scope, "all">[] = rawScopes.includes("all")
    ? ["releases", "guides", "community", "topics", "vps"]
    : rawScopes.filter((s): s is Exclude<Scope, "all"> => s in SCOPE_PATHS);

  for (const scope of scopes) {
    for (const rel of SCOPE_PATHS[scope]) {
      for (const locale of routing.locales) {
        targets.add(`/${locale}${rel}`);
      }
    }
  }

  const rawPaths = Array.isArray(body.paths) ? body.paths : [];
  for (const entry of rawPaths) {
    if (typeof entry !== "string" || !entry.startsWith("/")) continue;
    if (entry.length > 200 || entry.includes("..")) continue;
    targets.add(entry);
  }

  // Always revalidate dynamic guide/release route templates when their scope is requested so
  // brand-new slugs/tags pick up fresh data without needing every URL enumerated.
  if (scopes.includes("guides")) {
    revalidatePath("/[locale]/guides/[slug]", "page");
  }
  if (scopes.includes("releases")) {
    revalidatePath("/[locale]/releases/[tag]", "page");
  }
  if (scopes.includes("topics")) {
    revalidatePath("/[locale]/topics/[slug]", "page");
  }

  for (const path of targets) {
    revalidatePath(path);
  }

  return NextResponse.json(
    {
      ok: true,
      revalidated: targets.size,
      scopes,
      sample: [...targets].slice(0, 12),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
