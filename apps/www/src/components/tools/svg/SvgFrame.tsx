"use client";

import type { ReactNode } from "react";

/** Responsive, accessible SVG frame shared by every graphical tool. */
export function SvgFrame({
  viewBox,
  ariaLabel,
  title,
  desc,
  className,
  children,
}: {
  viewBox: string;
  ariaLabel: string;
  title?: string;
  desc?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={viewBox}
      className={className}
      width="100%"
      height="auto"
      style={{ maxWidth: "100%", overflow: "visible" }}
    >
      {title ? <title>{title}</title> : null}
      {desc ? <desc>{desc}</desc> : null}
      {children}
    </svg>
  );
}
