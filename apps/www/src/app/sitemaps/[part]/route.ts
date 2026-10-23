import { notFound } from "next/navigation";
import { buildEntries, renderUrlset, SITEMAP_PARTS, type SitemapPart } from "@/lib/sitemap";

export const revalidate = 1800;

export function generateStaticParams() {
  return SITEMAP_PARTS.map((part) => ({ part: `${part}.xml` }));
}

const XML = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
};

/**
 * One section of the sitemap.
 *
 * Paths end in `.xml` rather than being bare segments, so anything that inspects the extension
 * recognises them, and `/sitemaps/gpus` does not quietly serve XML as a page.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  if (!part.endsWith(".xml")) notFound();

  const name = part.slice(0, -".xml".length) as SitemapPart;
  if (!SITEMAP_PARTS.includes(name)) notFound();

  return new Response(renderUrlset(buildEntries(name)), { headers: XML });
}
