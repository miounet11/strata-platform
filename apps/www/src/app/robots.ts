import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

/**
 * Robots and the sitemap are the two places a crawler reads the boundary of the site, so they
 * are written from the same route model the navigation uses. `/b/` is the internal board: it is
 * never linked publicly, and naming it here would publish its prefix to anyone who reads
 * robots.txt, so private areas are expressed as a catch-all rather than an enumeration.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Query strings the board uses for state (?e=1 after a failed sign-in) are not pages.
        disallow: ["/b/", "/api/"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
