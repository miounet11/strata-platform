import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getRigs } from "@/lib/benchmarks";
import { getChangelog } from "@/lib/changelog";
import { getCommunity } from "@/lib/community";
import { getCreatorPulse } from "@/lib/creator";
import { getDownloads } from "@/lib/downloads";
import { newestXAt } from "@/lib/intelligence";
import { getReleases } from "@/lib/releases";

export const revalidate = 1800;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

const staticPaths = [
  "",
  "/releases",
  "/models",
  "/install",
  "/download",
  "/community",
  "/issues",
  "/pulls",
  "/community/labels",
  "/creator",
  "/pulse",
  "/changelog",
  "/links",
  "/benchmarks",
];

function stamp(iso?: string | null) {
  const date = iso ? new Date(iso) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default function sitemap(): MetadataRoute.Sitemap {
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

  const paths = [
    ...staticPaths,
    ...community.issues.map((issue) => `/issues/${issue.number}`),
    ...community.pulls.map((pull) => `/pulls/${pull.number}`),
    ...community.labels.map((label) => `/community/labels/${label.slug}`),
    ...creator.posts.map((post) => `/creator/updates/${post.id}`),
    ...getRigs().map((rig) => `/benchmarks/${rig.id}`),
    ...releases.releases.map((release) => `/releases/${release.tag}`),
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of routing.locales) {
    for (const path of paths) {
      const issue = path.match(/^\/issues\/(\d+)$/);
      const pull = path.match(/^\/pulls\/(\d+)$/);
      const post = path.match(/^\/creator\/updates\/(.+)$/);
      const releaseTag = path.match(/^\/releases\/([^/]+)$/);
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
      else if (path.startsWith("/benchmarks")) modified = releaseAt;
      const isRelease = Boolean(releaseTag);
      const isDetail = Boolean(issue || pull || post || path.includes("/labels/") || path.startsWith("/benchmarks/") || isRelease);
      entries.push({
        url: `${SITE}/${locale}${path}`,
        lastModified: stamp(modified),
        changeFrequency: freshHub || isRelease ? "daily" : "weekly",
        priority:
          path === "" ? 1 : freshHub ? 0.9 : releaseTag?.[1] === latestReleaseTag ? 0.85 : isDetail ? 0.55 : 0.75,
      });
    }
  }
  return entries;
}
