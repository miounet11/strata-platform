"use client";

import { useState } from "react";

/**
 * Thin client leaf for editorial images: zero JSON manifest imported on the client.
 * `EnrichedImage` resolves `src` and `alt` on the server and passes only plain strings here.
 */
export function FallbackImage({
  src,
  alt,
  className,
  width = 1024,
  height = 576,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

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
      src={src}
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
