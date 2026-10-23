/**
 * One `@graph` instead of several sibling blocks.
 *
 * Pages used to emit 2–3 separate `<script type="application/ld+json">` blocks, each carrying its
 * own `@context`. Nothing in that shape lets a BreadcrumbList name the same node as the Article it
 * describes, so a crawler sees unrelated islands and cannot tell that `…/guides/x#article` and the
 * visible page are one thing. A single graph with `@id` values fixes that: nodes reference each
 * other by id, and the trail's last item points at the page node rather than repeating its URL.
 *
 * `@context` is stripped from the members because it belongs on the graph root; repeating it
 * inside `@graph` is invalid and some parsers reject the whole document.
 */
export type JsonLdNode = Record<string, unknown> | null | undefined;

export function jsonLdGraph(nodes: JsonLdNode[], context: Record<string, unknown> = {}) {
  const graph = nodes
    .filter((node): node is Record<string, unknown> => Boolean(node))
    .map((node) => {
      const { "@context": _context, ...rest } = node;
      return rest;
    });
  return { "@context": "https://schema.org", ...context, "@graph": graph };
}

/** A page-scoped id so nodes on different pages never collide. */
export function nodeId(pageUrl: string, fragment: string) {
  return `${pageUrl}#${fragment}`;
}

/**
 * The WebPage node every index and list page needs.
 *
 * These pages are a filter or a table, not an article, so they have nothing to describe beyond
 * themselves. Without a node they carried no structured data at all, and the audit reported 2,780
 * of them — most of the site by count, since every locale multiplies each index.
 *
 * `type` defaults to WebPage but a collection can say `CollectionPage`, which is what a crawler
 * expects for a list of links rather than a single document.
 */
export function pageLd(
  site: string,
  locale: string,
  path: string,
  name: string,
  options: { description?: string; type?: string } = {},
) {
  const url = `${site}/${locale}${path}`;
  return {
    "@type": options.type ?? "WebPage",
    "@id": nodeId(url, "webpage"),
    url,
    name,
    ...(options.description ? { description: options.description } : {}),
    inLanguage: locale,
    isPartOf: { "@type": "WebSite", name: "Strata", url: site },
  };
}
