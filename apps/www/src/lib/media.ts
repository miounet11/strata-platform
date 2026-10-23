import manifest from "@/data/media-manifest.json";

/**
 * Public base for media files. In production this is the R2 bucket behind `file.stratat.com`,
 * so images and audio are served by Cloudflare's edge instead of the VPS that also renders the
 * pages. Unset in development, where `/media/...` resolves against `public/`.
 */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? "").replace(/\/+$/, "");

/**
 * Absolute (or root-relative) URL for a manifest path.
 *
 * The manifest stores root-relative paths because the files also live in `public/` for local
 * work and for the image worker that writes them. The base is applied at read time so moving to
 * a CDN is one environment variable, not 139 edits — and turning it off restores the old
 * behaviour without touching data.
 */
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
  text?: string;
  language?: string;
  title?: Record<string, string>;
  body?: string;
};

export function getMediaManifest() {
  return manifest;
}

export function mediaForPage(page: string, slot: string) {
  return Object.entries(manifest.assets as Record<string, MediaAsset>)
    .filter(([, a]) => a.page === page && a.slot === slot)
    .map(([id, a]) => ({ id, ...a }));
}

export function mediaById(id: string): (MediaAsset & { id: string }) | null {
  const a = (manifest.assets as Record<string, MediaAsset>)[id];
  return a ? { id, ...a } : null;
}
