import { mediaById } from "@/lib/media";

// The image itself is a client component (failure placeholder, decode hints); re-export so
// existing `@/components/EnrichedBlock` imports keep working.
export { EnrichedImage } from "./EnrichedImage";

export function EnrichedAudio({ id, locale }: { id: string; locale: string }) {
  const asset = mediaById(id);
  if (!asset?.path || asset.type !== "tts") return null;
  if (asset.locale && asset.locale !== locale && locale !== "en") return null;
  return (
    <figure style={{ margin: "1rem 0" }}>
      <audio controls preload="none" src={asset.path} style={{ width: "100%" }} />
      {asset.text ? (
        <figcaption className="meta" style={{ marginTop: 6 }}>{asset.text}</figcaption>
      ) : null}
    </figure>
  );
}

export function EnrichedCode({ id, locale }: { id: string; locale: string }) {
  const asset = mediaById(id);
  if (!asset || asset.type !== "code" || !asset.body) return null;
  const title = asset.title?.[locale] ?? asset.title?.en;
  return (
    <figure style={{ margin: "1.25rem 0" }}>
      {title ? <figcaption style={{ fontWeight: 600, marginBottom: 8 }}>{title}</figcaption> : null}
      <pre className="copy-block">{asset.body}</pre>
    </figure>
  );
}
