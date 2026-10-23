import { routing } from "@/i18n/routing";
import { getRigs } from "@/lib/benchmarks";
import { getChangelog } from "@/lib/changelog";
import { getCommunity } from "@/lib/community";
import { getCreatorPulse } from "@/lib/creator";
import { getDownloads } from "@/lib/downloads";
import { newestXAt } from "@/lib/intelligence";
import { getReleases } from "@/lib/releases";
import { getLiveTopics, getTopic } from "@/lib/topics";
import { getLiveArticles, localesForSlug } from "@/lib/articles";
import { allGpus, allSeries, vendorSlug, vendorSummaries } from "@/lib/gpus";
import {
  guidePath,
  gpuPath,
  gpuSeriesPath,
  gpuVendorPath,
  releasePath,
  rigPath,
  STATIC_PATHS,
} from "@/lib/routes";

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

function stamp(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * The sitemap is split into parts, and the split is by section rather than by count.
 *
 * The catalogue alone is 3,209 cards × 7 locales = 22,463 URLs; the whole site is 42,980. One
 * file at that size is 42 MB of XML, which is past the 50,000-URL / 50 MB limit a crawler will
 * read in one go, and it makes every re-crawl of a single new guide re-download the entire
 * GPU catalogue. Sections change for different reasons, so they are separate files:
 *
 *  - `core`      hubs, releases, issues, pulls, guides — changes constantly
 *  - `gpus`      the 3,209 detail pages — changes only when the catalogue does
 *  - `gpu-index` brands and series — the crawl path into `gpus`, tiny and rarely changed
 *
 * `/sitemap.xml` remains the index, so the URL in robots.txt does not change.
 */
export type SitemapPart = "core" | "gpus" | "gpu-index";

export const SITEMAP_PARTS: SitemapPart[] = ["core", "gpus", "gpu-index"];

export type Entry = {
  url: string;
  lastModified: Date;
  changeFrequency: "daily" | "weekly";
  priority: number;
  languages?: Record<string, string>;
};

export function buildEntries(part: SitemapPart): Entry[] {
  const community = getCommunity();
  const creator = getCreatorPulse();
  const releases = getReleases();
  const releaseAtByTag = new Map(releases.releases.map((release) => [release.tag, release.publishedAt]));
  const latestReleaseTag = releases.releases[0]?.tag;
  const downloads = getDownloads();
  const changelog = getChangelog();
  const releaseAt = releases.syncedAt ?? releases.releases[0]?.publishedAt;
  const pulseAt = newestXAt();
  const issueAt = new Map(community.issues.map((issue) => [issue.number, issue.updatedAt]));
  const pullAt = new Map(community.pulls.map((pull) => [pull.number, pull.updatedAt]));
  const postAt = new Map(creator.posts.map((post) => [post.id, post.publishedAt]));

  if (part === "gpu-index") {
    // Brand and series indexes exist in every locale: they are navigation, not prose.
    const paths = [
      ...vendorSummaries().map((vendor) => gpuVendorPath(vendor.slug)),
      ...allSeries().map((entry) => gpuSeriesPath(vendorSlug(entry.vendor), entry.slug)),
    ];
    return routing.locales.flatMap((locale) =>
      paths.map((path) => ({
        url: `${SITE}/${locale}${path}`,
        lastModified: stamp(releaseAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
        languages: alternates(path),
      })),
    );
  }

  if (part === "gpus") {
    const cards = allGpus();
    return routing.locales.flatMap((locale) =>
      cards.map((gpu) => {
        const path = gpuPath(gpu.slug);
        return {
          url: `${SITE}/${locale}${path}`,
          lastModified: stamp(releaseAt),
          changeFrequency: "weekly" as const,
          priority: 0.55,
          languages: alternates(path),
        };
      }),
    );
  }

  // Hub pages come from the shared route model rather than a local list, so a route added to
  // the navigation cannot be missing here (and `/b/` can never leak in: it is not a route).
  const sharedPaths = [
    ...STATIC_PATHS,
    ...community.issues.map((issue) => `/issues/${issue.number}`),
    ...community.pulls.map((pull) => `/pulls/${pull.number}`),
    ...community.labels.map((label) => `/community/labels/${label.slug}`),
    ...creator.posts.map((post) => `/creator/updates/${post.id}`),
    ...getRigs().map((rig) => rigPath(rig.id)),
    ...releases.releases.map((release) => releasePath(release.tag)),
  ];

  const entries: Entry[] = [];
  for (const locale of routing.locales) {
    // Topics and guides are written per locale, not translated, so each locale lists only its own.
    // `/guides` is a hub in the shared list, but a locale with no articles would spend crawl
    // budget on a page that says "no guides yet". Its detail pages are already per-locale below.
    const published = getLiveArticles(locale).length > 0;
    const paths = [
      ...sharedPaths.filter((path) => path !== "/guides" || published),
      ...getLiveTopics(locale).map((topic) => `/topics/${topic.slug}`),
      ...getLiveArticles(locale).map((article) => guidePath(article.slug)),
    ];
    for (const path of paths) {
      const issue = path.match(/^\/issues\/(\d+)$/);
      const pull = path.match(/^\/pulls\/(\d+)$/);
      const post = path.match(/^\/creator\/updates\/(.+)$/);
      const releaseTag = path.match(/^\/releases\/([^/]+)$/);
      const guide = path.match(/^\/guides\/([^/]+)$/);
      const topic = path.match(/^\/topics\/([^/]+)$/);

      // hreflang: a crawler that finds one URL must be told the equivalents, otherwise the six
      // translations compete as duplicates. Only pages that exist in a locale are listed, so a
      // guide written in English does not advertise seven alternates that 404.
      const siblings = guide
        ? localesForSlug(decodeURIComponent(guide[1]))
        : path === "/guides"
          ? [...new Set(getLiveArticles().map((article) => article.locale))]
          : topic
            ? (getTopic(decodeURIComponent(topic[1]))?.locales ?? [...routing.locales])
            : [...routing.locales];
      const known = siblings.filter((code) =>
        routing.locales.includes(code as (typeof routing.locales)[number]),
      );
      // `> 0`, matching `siteMetadata`: a page that exists in one locale still names that
      // locale, so a crawler can tell "English only" from "alternates not declared". When the
      // two sides used different thresholds, `/en/guides` had hreflang in the sitemap but no
      // x-default in its own HTML.
      const languages =
        known.length > 0
          ? {
              ...Object.fromEntries(known.map((code) => [code, `${SITE}/${code}${path}`])),
              // x-default is the fallback for a visitor whose language has no version yet.
              "x-default": `${SITE}/${known.includes(routing.defaultLocale) ? routing.defaultLocale : known[0]}${path}`,
            }
          : undefined;

      const freshHub = path === "" || path === "/pulse" || path === "/creator" || path === "/changelog";
      let modified = releaseAt;
      if (path === "/pulse") modified = pulseAt ?? releaseAt;
      else if (path === "/changelog") modified = changelog.syncedAt;
      else if (path === "/download") modified = downloads.syncedAt;
      else if (path === "/releases" || path === "") modified = releaseAt;
      else if (releaseTag) modified = releaseAtByTag.get(decodeURIComponent(releaseTag[1])) ?? releaseAt;
      else if (issue) modified = issueAt.get(Number(issue[1])) ?? community.syncedAt;
      else if (pull) modified = pullAt.get(Number(pull[1])) ?? community.syncedAt;
      else if (post) modified = postAt.get(post[1]) ?? creator.syncedAt;
      else if (guide) {
        // A guide's freshness is its own publish date, not the site's: otherwise every article
        // looks equally new and the crawler stops bothering to re-read them.
        const article = getLiveArticles(locale).find((entry) => entry.slug === guide[1]);
        modified = article?.generatedAt ?? article?.publishAt ?? releaseAt;
      } else if (path.startsWith("/benchmarks")) modified = releaseAt;
      const isRelease = Boolean(releaseTag);
      const isDetail = Boolean(
        issue ||
          pull ||
          post ||
          guide ||
          path.includes("/labels/") ||
          path.startsWith("/benchmarks/") ||
          path.startsWith("/topics/") ||
          isRelease,
      );
      entries.push({
        url: `${SITE}/${locale}${path}`,
        lastModified: stamp(modified),
        changeFrequency: freshHub || isRelease ? "daily" : "weekly",
        priority:
          path === "" ? 1 : freshHub ? 0.9 : releaseTag?.[1] === latestReleaseTag ? 0.85 : isDetail ? 0.55 : 0.75,
        ...(languages ? { languages } : {}),
      });
    }
  }
  return entries;
}

/** Every locale serves the same path for catalogue pages, so the alternates are mechanical. */
function alternates(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(routing.locales.map((code) => [code, `${SITE}/${code}${path}`])),
    "x-default": `${SITE}/${routing.defaultLocale}${path}`,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderUrlset(entries: Entry[]): string {
  const urls = entries.map((entry) => {
    const links = entry.languages
      ? Object.entries(entry.languages)
          .map(
            ([lang, href]) =>
              `    <xhtml:link rel="alternate" hreflang="${escapeXml(lang)}" href="${escapeXml(href)}" />`,
          )
          .join("\n")
      : "";
    return [
      "  <url>",
      `    <loc>${escapeXml(entry.url)}</loc>`,
      `    <lastmod>${entry.lastModified.toISOString()}</lastmod>`,
      `    <changefreq>${entry.changeFrequency}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      links,
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function renderIndex(parts: { part: string; lastModified: Date }[]): string {
  const items = parts.map(({ part, lastModified }) =>
    [
      "  <sitemap>",
      `    <loc>${escapeXml(`${SITE}/sitemaps/${part}.xml`)}</loc>`,
      `    <lastmod>${lastModified.toISOString()}</lastmod>`,
      "  </sitemap>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    "</sitemapindex>",
    "",
  ].join("\n");
}
