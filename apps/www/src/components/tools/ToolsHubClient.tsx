"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ALL_TOOLS } from "@/features/tools/registry";
import type { ToolDefinition } from "@/features/tools/types";
import { toolPath } from "@/lib/internal-links";

export type ToolsHubLabels = {
  eyebrow: string;
  title: string;
  intro: string;
  searchPlaceholder: string;
  allCategories: string;
  openTool: string;
  relatedTitle: string;
  reset: string;
  copyShare: string;
  copied: string;
  ctaDefault: string;
  categories: Record<string, string>;
  priority: Record<string, string>;
  items: Record<string, { title: string; tagline: string; cta: string }>;
};

const CATEGORIES = [
  "all",
  "memory",
  "hardware",
  "models",
  "setup",
  "economics",
  "diagnostics",
] as const;

/** Tiny line icons; no external asset request and legible at 24px. */
const ICONS: Record<string, ReactNode> = {
  "vram-visualizer": (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M6 10v4m4-4v4m4-4v4m4-4v4" />
    </>
  ),
  "gpu-compare": (
    <>
      <rect x="2" y="6" width="9" height="10" rx="1" />
      <rect x="13" y="6" width="9" height="10" rx="1" />
      <path d="M6 20h12" />
    </>
  ),
  "quant-explorer": (
    <>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  "install-wizard": (
    <>
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  "benchmark-scatter": (
    <>
      <path d="M3 3v18h18" />
      <circle cx="8" cy="15" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="19" cy="6" r="1.5" />
    </>
  ),
  "multi-gpu-planner": (
    <>
      <rect x="3" y="9" width="9" height="6" rx="1" />
      <rect x="12" y="9" width="9" height="6" rx="1" />
      <path d="M7 19h10" />
    </>
  ),
  "pc-builder": (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8v6H8zM9 18h6" />
    </>
  ),
  troubleshooter: (
    <>
      <path d="M12 3a7 7 0 0 0-4 13v3h8v-3a7 7 0 0 0-4-13z" />
      <path d="M9 22h6" />
    </>
  ),
  "roi-calculator": (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h3m2 0h3M8 16h3m2 0h3" />
    </>
  ),
  "agent-studio": (
    <>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M8.6 10.7 15.4 7.3M8.6 13.3l6.8 3.4" />
    </>
  ),
};

function ToolIcon({ slug }: { slug: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {ICONS[slug] ?? ICONS["gpu-compare"]}
    </svg>
  );
}

function localText(labels: ToolsHubLabels, tool: ToolDefinition) {
  const item = labels.items[tool.slug];
  return {
    title: item?.title || tool.slug,
    tagline: item?.tagline || tool.badgeMetric,
    cta: item?.cta || labels.ctaDefault,
  };
}

export function ToolsHubClient({ labels }: { labels: ToolsHubLabels }) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ALL_TOOLS.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      if (!needle) return true;
      const text = localText(labels, tool);
      return [tool.slug, text.title, text.tagline, ...tool.keywords]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [category, query, labels]);

  return (
    <div className="tool-hub">
      <div className="tool-controls">
        <label className="tool-search">
          <span>{labels.searchPlaceholder}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
          />
        </label>
        <div className="tool-filters" role="group" aria-label={labels.allCategories}>
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              className={category === key ? "tool-filter is-active" : "tool-filter"}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {key === "all" ? labels.allCategories : labels.categories[key]}
            </button>
          ))}
          <button
            type="button"
            className="tool-filter"
            onClick={() => {
              setCategory("all");
              setQuery("");
            }}
          >
            {labels.reset}
          </button>
        </div>
      </div>

      <p className="tool-count" aria-live="polite">
        {visible.length} / {ALL_TOOLS.length}
      </p>

      <div className="tool-hub-grid">
        {visible.map((tool) => {
          const text = localText(labels, tool);
          return (
            <article key={tool.slug} className="tool-card">
              <div className="tool-card-top">
                <span className="tool-card-icon"><ToolIcon slug={tool.slug} /></span>
                <span className="tool-card-badges">
                  <span className="tool-badge">{labels.priority[tool.priority] || tool.priority}</span>
                  <span className="tool-badge tool-badge-metric">{tool.badgeMetric}</span>
                </span>
              </div>
              <h3>{text.title}</h3>
              <p>{text.tagline}</p>
              <div className="tool-card-actions">
                <Link href={toolPath(tool.slug)} className="btn btn-primary">
                  {labels.openTool} →
                </Link>
                <Link href={tool.ctaHref} className="btn btn-quiet">
                  {text.cta}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {visible.length === 0 ? <p className="tool-empty">{labels.reset}</p> : null}
    </div>
  );
}
