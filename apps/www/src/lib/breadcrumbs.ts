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
  trail: Array<{ path?: string; name: string }>,
) {
  if (trail.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: `${site}/${locale}${item.path}` } : {}),
    })),
  };
}
