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
