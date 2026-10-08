import releasesData from "@/data/releases.json";
import { readDataJson } from "@/lib/data-file";

export type EngineRelease = {
  tag: string;
  name: string;
  publishedAt: string;
  url: string;
  prerelease?: boolean;
  body?: string;
  assets?: { name: string; size: number; downloadUrl: string }[];
};

type ReleaseFile = {
  syncedAt: string;
  releases: EngineRelease[];
};

function versionParts(tag: string) {
  return tag.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** Highest version first, so an older tag cannot be treated as the latest. */
function newestFirst(a: EngineRelease, b: EngineRelease) {
  const left = versionParts(a.tag);
  const right = versionParts(b.tag);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff) return diff;
  }
  return String(b.publishedAt).localeCompare(String(a.publishedAt));
}

export function getReleases() {
  const data = readDataJson("releases.json", releasesData as ReleaseFile);
  return { ...data, releases: [...data.releases].sort(newestFirst) };
}

export function getRelease(tag: string) {
  let want = tag;
  try {
    want = decodeURIComponent(tag);
  } catch {
    want = tag;
  }
  const key = want.toLowerCase();
  return getReleases().releases.find((release) => release.tag.toLowerCase() === key);
}

export function releaseLead(body: string, max = 220) {
  const head = String(body ?? "").split(/\n## |\n\|/)[0];
  const plain = head
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const slice = plain.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  const base = cut > 80 ? slice.slice(0, cut) : slice;
  return `${base}…`;
}
