import { mediaById, mediaForGuide, mediaForPage, mediaUrl } from "@/lib/media";
import { FallbackImage } from "./FallbackImage";

/**
 * Server Component wrapper around `<FallbackImage>`.
 *
 * Resolving the manifest on the server keeps the 60 KB `media-manifest.json` out of the client
 * bundle and lets runtime-generated guide images appear via hot-reloaded `readDataJson` without
 * rebuilding the site.
 */
export function EnrichedImage({
  id,
  guideSlug,
  page,
  slot,
  locale,
  className,
  width = 1024,
  height = 576,
  priority = false,
}: {
  id?: string;
  guideSlug?: string;
  page?: string;
  slot?: string;
  locale: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const asset = guideSlug
    ? mediaForGuide(guideSlug, locale)
    : id
      ? mediaById(id)
      : mediaForPage(page ?? "", slot ?? "").find((a) => a.type === "image");
  const src = mediaUrl(asset?.path);
  if (!asset || !src) return null;

  const alt = asset.alt?.[locale] ?? asset.alt?.en ?? "";
  return (
    <FallbackImage
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      priority={priority}
    />
  );
}
