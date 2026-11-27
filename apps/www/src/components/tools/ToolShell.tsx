"use client";

import { useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getTool } from "@/features/tools/registry";
import type { ToolSlug } from "@/features/tools/types";

/** Shared chrome for all ten interactive tools. */
export function ToolShell({
  slug,
  title,
  subtitle,
  badge,
  shareQuery,
  onReset,
  relatedLabels,
  ctaLabel,
  children,
}: {
  slug: ToolSlug;
  title: string;
  subtitle: string;
  badge?: string;
  shareQuery?: string;
  onReset?: () => void;
  relatedLabels?: Record<string, string>;
  ctaLabel?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const tool = getTool(slug);

  async function copyShareUrl() {
    try {
      const url = `${window.location.origin}${window.location.pathname}${shareQuery ?? ""}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="tool-shell" aria-label={title}>
      <header className="tool-shell-header">
        <div>
          <h2>
            {title}
            {badge ? <span className="badge">{badge}</span> : null}
          </h2>
          <p>{subtitle}</p>
        </div>
        <div className="tool-shell-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onReset ? (
            <button type="button" onClick={onReset}>
              Reset
            </button>
          ) : null}
          <button type="button" onClick={copyShareUrl} aria-live="polite">
            {copied ? "Copied" : "Copy share URL"}
          </button>
        </div>
      </header>

      <div className="tool-shell-content">{children}</div>

      {tool && tool.relatedSlugs.length > 0 ? (
        <nav className="tool-related" aria-label="Related tools">
          <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, listStyle: "none", padding: 0 }}>
            {tool.relatedSlugs.map((related) => (
              <li key={related}>
                <Link href={`/tools/${related}`}>
                  {relatedLabels?.[related] ?? getTool(related)?.badgeMetric ?? related}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {tool ? (
        <footer className="tool-cta">
          <Link href={tool.ctaHref}>{ctaLabel ?? "Explore the catalogue"}</Link>
        </footer>
      ) : null}
    </section>
  );
}
