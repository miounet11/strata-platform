import { renderIndex, SITEMAP_PARTS } from "@/lib/sitemap";

export const revalidate = 1800;

/**
 * Sitemap index.
 *
 * The `sitemap.ts` file convention can only emit a `<urlset>`, and the site no longer fits in
 * one (42,980 URLs / 42 MB). A route handler is what a `<sitemapindex>` needs, and keeping the
 * URL at `/sitemap.xml` means robots.txt does not change.
 */
export function GET() {
  const body = renderIndex(SITEMAP_PARTS.map((part) => ({ part, lastModified: new Date() })));
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
