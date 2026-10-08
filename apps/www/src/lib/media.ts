import manifest from "@/data/media-manifest.json";

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
