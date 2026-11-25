import { routing } from "@/i18n/routing";
import { getRigs } from "@/lib/benchmarks";
import { getChangelog } from "@/lib/changelog";
import { getCommunity, getIndexableIssues } from "@/lib/community";
import { getCreatorPulse } from "@/lib/creator";
import { getDownloads } from "@/lib/downloads";
import { newestXAt } from "@/lib/intelligence";
import { getReleases } from "@/lib/releases";
import { getLiveTopics, getTopic } from "@/lib/topics";
import { getLiveArticles, getLiveArticlesByKind, liveGuideKinds, localesForSlug } from "@/lib/articles";
import { allBuilds } from "@/lib/builds";
import { allGpus, allSeries, vendorSlug, vendorSummaries } from "@/lib/gpus";
import { SCENARIOS } from "@/lib/scenarios";
import { getVpsDeals } from "@/lib/vps";
import {
  GUIDE_KINDS,
  guideCategoryPath,
  guidePath,
  gpuPath,
  buildPath,
  gpuSeriesPath,
  gpuVendorPath,
  releasePath,
  rigPath,
  STATIC_PATHS,
} from "@/lib/routes";

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

function stamp(iso?: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type SitemapPart = "core" | "gpus" | "gpu-index";

export const SITEMAP_PARTS: SitemapPart[] = ["core", "gpus", "gpu-index"];

export type Entry = {
  url: string;
  /** `null` when the content has no real modification date — the `<lastmod>` tag is then omitted. */
  lastModified: Date | null;
  changeFrequency: "daily" | "weekly";
  priority: number;
  languages?: Record<string, string>;
};

export function buildEntries(part: SitemapPart): Entry[] {
  const community = getCommunity();
  const indexableIssues = getIndexableIssues();
  const creator = getCreatorPulse();
  const releases = getReleases();
  const releaseAtByTag = new Map(releases.releases.map((release) => [release.tag, release.publishedAt]));
  const latestReleaseTag = releases.releases[0]?.tag;
  const downloads = getDownloads();
  const changelog = getChangelog();
  const vpsAt = getVpsDeals().updatedAt;
  const releaseAt = releases.syncedAt ?? releases.releases[0]?.publishedAt;
  const pulseAt = newestXAt();
  const issueAt = new Map(indexableIssues.map((issue) => [issue.number, issue.updatedAt]));
  const postAt = new Map(creator.posts.map((post) => [post.id, post.publishedAt]));

  if (part === "gpu-index") {
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

  // Raw PR mirrors (`/pulls/[number]`) are intentionally omitted from the sitemap and marked
  // `noindex`: they are raw English diffs that caused 1,200+ near-duplicate pairs across 7
  // locales. The `/pulls` list hub and substantive issues remain indexed.
  const sharedPaths = [
    ...STATIC_PATHS,
    ...indexableIssues.map((issue) => `/issues/${issue.number}`),
    ...community.labels.map((label) => `/community/labels/${label.slug}`),
    ...creator.posts.map((post) => `/creator/updates/${post.id}`),
    ...getRigs().map((rig) => rigPath(rig.id)),
    ...allBuilds().map((build) => buildPath(build.slug)),
    ...SCENARIOS.map((scenario) => `/best/${scenario.slug}`),
    ...releases.releases.map((release) => releasePath(release.tag)),
  ];

  const entries: Entry[] = [];
  for (const locale of routing.locales) {
    const liveArticles = getLiveArticles(locale);
    const published = liveArticles.length > 0;
    const categoryPaths = liveGuideKinds(locale)
      .filter((kind) => (GUIDE_KINDS as readonly string[]).includes(kind))
      .map((kind) => guideCategoryPath(kind));
    const paths = [
      ...sharedPaths.filter((path) => path !== "/guides" || published),
      ...categoryPaths,
      ...getLiveTopics(locale).map((topic) => `/topics/${topic.slug}`),
      ...liveArticles.map((article) => guidePath(article.slug)),
    ];
    for (const path of paths) {
      const issue = path.match(/^\/issues\/(\d+)$/);
      const post = path.match(/^\/creator\/updates\/(.+)$/);
      const releaseTag = path.match(/^\/releases\/([^/]+)$/);
      const guideCategory = path.match(/^\/guides\/category\/([^/]+)$/);
      const guide = !guideCategory ? path.match(/^\/guides\/([^/]+)$/) : null;
      const topic = path.match(/^\/topics\/([^/]+)$/);

      const siblings = guide
        ? localesForSlug(decodeURIComponent(guide[1]))
        : guideCategory
          ? routing.locales.filter((code) => getLiveArticlesByKind(code, decodeURIComponent(guideCategory[1])).length > 0)
          : path === "/guides"
            ? [...new Set(getLiveArticles().map((article) => article.locale))]
            : topic
              ? (getTopic(decodeURIComponent(topic[1]))?.locales ?? [...routing.locales])
              : [...routing.locales];
      const known = siblings.filter((code) =>
        routing.locales.includes(code as (typeof routing.locales)[number]),
      );
      const languages =
        known.length > 0
          ? {
              ...Object.fromEntries(known.map((code) => [code, `${SITE}/${code}${path}`])),
              "x-default": `${SITE}/${known.includes(routing.defaultLocale) ? routing.defaultLocale : known[0]}${path}`,
            }
          : undefined;

      const freshHub =
        path === "" ||
        path === "/pulse" ||
        path === "/creator" ||
        path === "/changelog" ||
        path === "/vps" ||
        path === "/can-i-run" ||
        path === "/guides" ||
        path === "/builds";
      let modified = releaseAt;
      if (path === "/pulse") modified = pulseAt ?? releaseAt;
      else if (path === "/vps") modified = vpsAt ?? releaseAt;
      else if (path === "/changelog") modified = changelog.syncedAt;
      else if (path === "/download") modified = downloads.syncedAt;
      else if (path === "/releases" || path === "") modified = releaseAt;
      else if (releaseTag) modified = releaseAtByTag.get(decodeURIComponent(releaseTag[1])) ?? releaseAt;
      else if (issue) modified = issueAt.get(Number(issue[1])) ?? community.syncedAt;
      else if (post) modified = postAt.get(post[1]) ?? creator.syncedAt;
      else if (guideCategory) {
        const latestInCat = getLiveArticlesByKind(locale, decodeURIComponent(guideCategory[1]))[0];
        modified = latestInCat?.generatedAt ?? latestInCat?.publishedAt ?? latestInCat?.publishAt ?? releaseAt;
      } else if (guide) {
        const article = liveArticles.find((entry) => entry.slug === decodeURIComponent(guide[1]));
        modified = article?.generatedAt ?? article?.publishedAt ?? article?.publishAt ?? releaseAt;
      } else if (path.startsWith("/benchmarks")) modified = releaseAt;

      const isRelease = Boolean(releaseTag);
      const isBuildDetail = path.startsWith("/builds/");
      const isHighIntentHub =
        path === "/can-i-run" || path === "/best" || path.startsWith("/best/") || Boolean(guideCategory);
      const isDetail = Boolean(
        issue ||
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
          path === ""
            ? 1
            : freshHub
              ? 0.9
              : isBuildDetail
                ? 0.8
                : isHighIntentHub
                ? 0.85
                : releaseTag?.[1] === latestReleaseTag
                  ? 0.85
                  : isDetail
                    ? 0.55
                    : 0.75,
        ...(languages ? { languages } : {}),
      });
    }
  }
  return entries;
}

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
      entry.lastModified ? `    <lastmod>${entry.lastModified.toISOString()}</lastmod>` : null,
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

export function renderIndex(parts: { part: string; lastModified?: Date | null }[]): string {
  const items = parts.map(({ part, lastModified }) =>
    [
      "  <sitemap>",
      `    <loc>${escapeXml(`${SITE}/sitemaps/${part}.xml`)}</loc>`,
      lastModified ? `    <lastmod>${lastModified.toISOString()}</lastmod>` : null,
      "  </sitemap>",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items,
    "</sitemapindex>",
    "",
  ].join("\n");
}
