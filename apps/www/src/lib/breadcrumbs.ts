/**
 * `BreadcrumbList` for pages that emit structured data from a server component.
 *
 * Kept out of `components/Breadcrumbs.tsx` on purpose: that file is a client component, and an
 * exported plain function from it is still a client boundary — calling it while rendering on the
 * server fails the build. The trail is passed verbatim so the JSON-LD cannot drift from the
 * visible breadcrumbs; the last item carries no `item` URL because it is the page itself.
 */
export function breadcrumbJsonLd(
  site: string,
  locale: string,
  trail: Array<{ path?: string; name: string; id?: string }>,
) {
  if (trail.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      // The last item is the page itself: point at its node instead of restating the URL, so the
      // trail and the page node are visibly one thing inside the `@graph`.
      //
      // `path` is tested against `undefined`, not for truthiness: the home crumb is `path: ""`,
      // which is falsy but must still resolve to `/en`. Testing truthiness silently dropped the
      // item URL from the first crumb on all five trails that start at the home page, and Google
      // requires `item` on every entry but the last.
      ...(item.id
        ? { item: { "@id": item.id } }
        : item.path !== undefined
          ? { item: `${site}/${locale}${item.path}` }
          : {}),
    })),
  };
}
