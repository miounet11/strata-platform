import fallbackManifest from "@/data/media-manifest.json";
import { readDataJson } from "@/lib/data-file";

/**
 * Public base for media files. Unset when served from this host's `public/media/`.
 */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/+$/, "");

export function mediaUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!MEDIA_BASE || !path.startsWith("/media/")) return path;
  return `${MEDIA_BASE}${path}`;
}

export type MediaAsset = {
  type: "image" | "tts" | "code";
  path?: string;
  page: string;
  slot: string;
  alt?: Record<string, string>;
  locale?: string;
  source?: string;
  text?: string;
  language?: string;
  title?: Record<string, string>;
  body?: string;
};

type ManifestFile = {
  assets: Record<string, MediaAsset>;
};

export function getMediaManifest(): ManifestFile {
  return readDataJson("media-manifest.json", fallbackManifest as unknown as ManifestFile);
}

export function mediaForPage(page: string, slot: string) {
  return Object.entries(getMediaManifest().assets)
    .filter(([, a]) => a.page === page && a.slot === slot)
    .map(([id, a]) => ({ id, ...a }));
}

export function mediaById(id: string): (MediaAsset & { id: string }) | null {
  const a = getMediaManifest().assets[id];
  return a ? { id, ...a } : null;
}

/**
 * Resolve a guide's hero image with locale-specific priority (`guide-<locale>-<slug>`),
 * falling back to the legacy shared key (`guide-<slug>`).
 */
export function mediaForGuide(slug: string, locale: string): (MediaAsset & { id: string }) | null {
  return mediaById(`guide-${locale}-${slug}`) ?? mediaById(`guide-${slug}`);
}
