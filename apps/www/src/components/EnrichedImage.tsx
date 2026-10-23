"use client";

import { useState } from "react";
import { mediaById, mediaForPage, mediaUrl } from "@/lib/media";

/**
 * Client-side so a broken or missing file degrades to a labelled placeholder instead of a
 * broken-image glyph. Width/height come from the manifest (all art is 16:9) so the browser
 * reserves space and the page does not jump while the image loads.
 */
export function EnrichedImage({
  id,
  page,
  slot,
  locale,
  className,
  width = 1024,
  height = 576,
  priority = false,
}: {
  id?: string;
  page?: string;
  slot?: string;
  locale: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const asset = id ? mediaById(id) : mediaForPage(page ?? "", slot ?? "").find((a) => a.type === "image");
  if (!asset?.path) return null;

  const alt = asset.alt?.[locale] ?? asset.alt?.en ?? "";

  if (failed) {
    return (
      <div className={`page-visual page-visual-missing ${className ?? ""}`.trim()} role="img" aria-label={alt}>
        <span>{alt}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(asset.path)}
      alt={alt}
      width={width}
      height={height}
      className={`page-visual ${className ?? ""}`.trim()}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}
