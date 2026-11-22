import { buildEntries, renderIndex, SITEMAP_PARTS } from "@/lib/sitemap";

export const revalidate = 1800;

/**
 * Sitemap index.
 *
 * The `sitemap.ts` file convention can only emit a `<urlset>`, and the site no longer fits in
 * one (42,980 URLs / 42 MB). A route handler is what a `<sitemapindex>` needs, and keeping the
 * URL at `/sitemap.xml` means robots.txt does not change.
 *
 * Each part's `lastmod` is the newest `lastmod` inside that part, not the time this handler ran.
 * `new Date()` here told crawlers all three sitemaps had changed on every revalidation — and with
 * `revalidate = 1800` that is 48 times a day — which makes `lastmod` worthless: a crawler that
 * learns the date always moves stops using it to decide what to re-fetch.
 */
export function GET() {
  const parts = SITEMAP_PARTS.map((part) => {
    const entries = buildEntries(part);
    const newest = entries.reduce<Date | null>((max, entry) => {
      const at = entry.lastModified;
      if (!at) return max;
      return !max || at > max ? at : max;
    }, null);
    // Keep every part in the index. When nothing in a part has a real date, emit its `<loc>`
    // without `<lastmod>`; filtering the part out would remove all its URLs from discovery.
    return { part, lastModified: newest };
  });
  const body = renderIndex(parts);
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
