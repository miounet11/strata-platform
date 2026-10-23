/**
 * One description of the public site, shared by the header, the footer, breadcrumbs, the
 * sitemap and robots.
 *
 * The site is crawled from the outside in, so every public page has to be reachable from
 * another public page — not only from the sitemap. Keeping the navigation here means a page
 * cannot be added to one place and forgotten in the others, which is how `/gpus` ended up
 * listed in the sitemap with no link pointing at it.
 */

export type NavItem = {
  href: string;
  /** Key in `nav.*` of `messages/*.json`. */
  key: string;
};

export type NavGroup = {
  /** Key in `nav.*`; used as the group caption where the layout shows one. */
  key: string;
  items: NavItem[];
};

/**
 * The header's primary row: the jobs a visitor arrives to do, in the order they arrive.
 * Everything here is a plain link so crawlers see the whole set without running JavaScript.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/download", key: "download" },
  { href: "/install", key: "install" },
  { href: "/models", key: "models" },
  { href: "/gpus", key: "gpus" },
  { href: "/benchmarks", key: "benchmarks" },
  { href: "/guides", key: "guides" },
];

/**
 * The secondary row, grouped by what the page is. The header renders it as a menu; the footer
 * renders the same groups expanded, so the links exist in the HTML of every page.
 */
export const SECONDARY_NAV: NavGroup[] = [
  {
    key: "learn",
    items: [
      { href: "/topics", key: "topics" },
      { href: "/gpus", key: "gpus" },
      { href: "/gpus/vendor", key: "gpuBrands" },
      { href: "/benchmarks", key: "benchmarks" },
    ],
  },
  {
    key: "updates",
    items: [
      { href: "/releases", key: "releases" },
      { href: "/changelog", key: "changelog" },
      { href: "/pulse", key: "pulse" },
      { href: "/creator", key: "creator" },
    ],
  },
  {
    key: "community",
    items: [
      { href: "/community", key: "community" },
      { href: "/issues", key: "issues" },
      { href: "/pulls", key: "pulls" },
    ],
  },
  {
    key: "site",
    // Account pages (`/login`, `/dashboard`, `/register`) are deliberately absent: they are
    // `noindex`, so linking them from every page would only spend crawl budget on pages that
    // can never rank.
    items: [{ href: "/links", key: "links" }],
  },
];

/** Pages that belong in the sitemap and in breadcrumbs' top level. */
export const STATIC_PATHS = [
  "",
  "/download",
  "/install",
  "/models",
  "/gpus",
  "/gpus/vendor",
  "/benchmarks",
  "/guides",
  "/topics",
  "/releases",
  "/changelog",
  "/community",
  "/issues",
  "/pulls",
  "/community/labels",
  "/pulse",
  "/creator",
  "/links",
] as const;

/**
 * Guide categories, in the order the index lists them. `key` matches `guides.kinds.*`; the
 * order runs from "what does this mean" to "why is it broken", which is also roughly the order
 * a reader needs them.
 */
export const GUIDE_KINDS = ["concept", "compare", "hardware", "local", "task", "troubleshoot"] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

export function guideKindOrder(kind: string): number {
  const index = GUIDE_KINDS.indexOf(kind as GuideKind);
  return index === -1 ? GUIDE_KINDS.length : index;
}

/** Paths whose first segment is a hub worth naming in the trail. */
const HUB_LABELS: Record<string, string> = {
  gpus: "gpus",
  benchmarks: "benchmarks",
  guides: "guides",
  topics: "topics",
  releases: "releases",
  changelog: "changelog",
  community: "community",
  issues: "issues",
  pulls: "pulls",
  pulse: "pulse",
  creator: "creator",
  links: "links",
};

export function hubKeyFor(pathname: string): string | undefined {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? HUB_LABELS[first] : undefined;
}

/**
 * Path builders for detail pages.
 *
 * Defined in `lib/internal-links`, which also emits these URLs, so the index, a detail page and
 * an in-prose link cannot disagree about a segment. Re-exported here because pages import their
 * route model from one module.
 */
export { guidePath, gpuPath, gpuSeriesPath, gpuVendorPath, rigPath, releasePath } from "./internal-links";
