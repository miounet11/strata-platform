import { mediaById, mediaForPage } from "@/lib/media";

export function EnrichedImage({
  id,
  page,
  slot,
  locale,
  className,
}: {
  id?: string;
  page?: string;
  slot?: string;
  locale: string;
  className?: string;
}) {
  const asset = id ? mediaById(id) : mediaForPage(page ?? "", slot ?? "").find((a) => a.type === "image");
  if (!asset?.path) return null;
  const alt = asset.alt?.[locale] ?? asset.alt?.en ?? "";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.path}
      alt={alt}
      className={className}
      loading="lazy"
      style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }}
    />
  );
}

export function EnrichedAudio({ id, locale }: { id: string; locale: string }) {
  const asset = mediaById(id);
  if (!asset?.path || asset.type !== "tts") return null;
  if (asset.locale && asset.locale !== locale && locale !== "en") return null;
  return (
    <figure style={{ margin: "1rem 0" }}>
      <audio controls preload="none" src={asset.path} style={{ width: "100%" }} />
      {asset.text ? (
        <figcaption style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 6 }}>{asset.text}</figcaption>
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
