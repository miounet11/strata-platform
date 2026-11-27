"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import type { ToolsBundle, ToolGpuRecord } from "@/features/tools/types";
import { fmtDecimal, fmtGb, fmtNum, fmtTps } from "@/features/tools/format";
import {
  METRIC_KEYS,
  compareGpus,
  computeRadarVertices,
  parseGpuSlugs,
  radarPolygonPoints,
  serializeGpuSlugs,
  type GpuComparisonEntry,
  type MetricKey,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "GPU Compare",
  subtitle: "Compare up to four GPUs across six performance axes.",
  presets: "Quick presets",
  search: "Search GPUs (name, vendor, architecture)",
  selected: "Selected GPUs",
  noResults: "No GPUs match your search.",
  needTwo: "Select at least two GPUs to compare.",
  radar: "Six-axis performance radar",
  bars: "Metric breakdown",
  details: "Details",
  vram: "VRAM",
  bandwidth: "Bandwidth",
  writeTps: "Write tok/s",
  readingTps: "Read tok/s",
  tdp: "TDP",
  psu: "Suggested PSU",
  gpu: "GPU",
  winner: "Wins",
  measuredAxes: "Axes compared",
  flagship: "Flagship",
  value: "Best value",
  vramPick: "Most VRAM",
  efficiency: "Most efficient",
};

const SERIES_COLORS = ["#2563eb", "#dc2626", "#059669", "#7c3aed"] as const;
const GRID_LEVELS = [20, 40, 60, 80, 100] as const;
const RADAR_CENTER = { x: 200, y: 200 };
const RADAR_RADIUS = 140;

type Hover = { slug: string; metric: MetricKey } | null;

function usable(gpu: ToolGpuRecord): boolean {
  return gpu.support !== "not-supported" && (gpu.writingTps ?? 0) > 0;
}

function topBy(gpus: readonly ToolGpuRecord[], score: (gpu: ToolGpuRecord) => number, limit = 3): string[] {
  return gpus
    .filter(usable)
    .slice()
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((gpu) => gpu.slug);
}

function defaultSlugs(gpus: readonly ToolGpuRecord[]): string[] {
  return topBy(gpus, (gpu) => gpu.writingTps ?? 0, 3);
}

function metricLabel(key: MetricKey): string {
  return DEFAULT_LABELS[key] ?? key;
}

function metricDisplay(key: MetricKey, value: number): string {
  switch (key) {
    case "writingTps":
    case "readingTps":
      return fmtTps(value);
    case "vramGb":
      return fmtGb(value, 1);
    case "bandwidthGbs":
      return `${fmtNum(value)} GB/s`;
    case "efficiency":
      return `${fmtDecimal(value)} tok/s/100W`;
    case "valueScore":
      return `${fmtDecimal(value)} tok/s/$`;
  }
}

export function GpuCompareTool({
  bundle,
  labels,
}: {
  bundle: ToolsBundle;
  labels?: Record<string, string>;
}) {
  const text = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [selected, setSelected] = useState<string[]>(() => defaultSlugs(bundle.gpus));
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<Hover>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore from the URL on the client only, so SSR and CSR markup stay identical.
  useEffect(() => {
    const fromUrl = parseGpuSlugs(window.location.search).filter((slug) =>
      bundle.gpus.some((gpu) => gpu.slug === slug),
    );
    if (fromUrl.length >= 2) setSelected(fromUrl);
    setHydrated(true);
  }, [bundle]);

  useEffect(() => {
    if (!hydrated) return;
    const share = serializeGpuSlugs(selected);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = `${window.location.pathname}${share}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [selected, hydrated]);

  const result = useMemo(() => {
    const picked = selected
      .map((slug) => bundle.gpus.find((gpu) => gpu.slug === slug))
      .filter((gpu): gpu is ToolGpuRecord => Boolean(gpu));
    return compareGpus(picked);
  }, [bundle, selected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return bundle.gpus.filter(usable).slice(0, 40);
    return bundle.gpus
      .filter(
        (gpu) =>
          usable(gpu) &&
          (gpu.name.toLowerCase().includes(needle) ||
            gpu.vendor.toLowerCase().includes(needle) ||
            gpu.arch.toLowerCase().includes(needle) ||
            gpu.slug.includes(needle)),
      )
      .slice(0, 40);
  }, [bundle, query]);

  const colorOf = (slug: string) => {
    const index = result.entries.findIndex((entry) => entry.gpu.slug === slug);
    return SERIES_COLORS[Math.max(0, index) % SERIES_COLORS.length];
  };

  function toggle(slug: string) {
    setHover(null);
    setSelected((current) => {
      if (current.includes(slug)) return current.filter((item) => item !== slug);
      if (current.length >= 4) return [...current.slice(1), slug];
      return [...current, slug];
    });
  }

  function applyPreset(slugs: string[]) {
    if (slugs.length >= 2) {
      setHover(null);
      setSelected(slugs);
    }
  }

  const presets = [
    { id: "flagship", label: text("flagship"), slugs: topBy(bundle.gpus, (gpu) => gpu.writingTps ?? 0) },
    {
      id: "value",
      label: text("value"),
      slugs: topBy(bundle.gpus, (gpu) => ((gpu.cardPrice ?? 0) > 0 ? (gpu.writingTps ?? 0) / gpu.cardPrice! : 0)),
    },
    { id: "vram", label: text("vramPick"), slugs: topBy(bundle.gpus, (gpu) => gpu.vramGb ?? 0) },
    {
      id: "efficiency",
      label: text("efficiency"),
      slugs: topBy(bundle.gpus, (gpu) => gpu.tpsPer100W ?? 0),
    },
  ];

  const hoveredEntry: GpuComparisonEntry | undefined = hover
    ? result.entries.find((entry) => entry.gpu.slug === hover.slug)
    : undefined;
  const hoverText =
    hover && hoveredEntry
      ? `${hoveredEntry.gpu.name} · ${metricLabel(hover.metric)}: ${metricDisplay(
          hover.metric,
          hoveredEntry.raw[hover.metric],
        )}`
      : "";

  return (
    <ToolShell
      slug="gpu-compare"
      title={text("title")}
      subtitle={text("subtitle")}
      badge={`${result.entries.length} GPUs`}
      shareQuery={serializeGpuSlugs(selected)}
      onReset={() => applyPreset(defaultSlugs(bundle.gpus))}
      relatedLabels={labels}
    >
      <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{text("presets")}</span>
          {presets.map((preset) => (
            <button type="button" key={preset.id} onClick={() => applyPreset(preset.slugs)}>
              {preset.label}
            </button>
          ))}
        </div>
        <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>{text("search")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text("search")}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {selected.map((slug) => (
            <button
              type="button"
              key={slug}
              aria-pressed
              onClick={() => toggle(slug)}
              style={{ borderColor: colorOf(slug), borderWidth: 2 }}
            >
              {bundle.gpus.find((gpu) => gpu.slug === slug)?.name ?? slug} ×
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <p style={{ opacity: 0.75 }}>{text("noResults")}</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {filtered.map((gpu) => (
              <button
                type="button"
                key={gpu.slug}
                aria-pressed={selected.includes(gpu.slug)}
                onClick={() => toggle(gpu.slug)}
              >
                {selected.includes(gpu.slug) ? "− " : "+ "}
                {gpu.name} · {fmtGb(gpu.vramGb)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <MetricStat label={text("selected")} value={String(result.entries.length)} sub="2–4 GPUs" tone="accent" />
        <MetricStat
          label={text("measuredAxes")}
          value={String(METRIC_KEYS.length)}
          sub={METRIC_KEYS.map(metricLabel).join(" · ")}
          tone="neutral"
        />
        <MetricStat
          label={text("winner")}
          value={result.entries.reduce((sum, entry) => sum + entry.winners.length, 0).toString()}
          sub={METRIC_KEYS.map((key) => `${metricLabel(key)}: ${result.winners[key].length}`).join(" · ")}
          tone="neutral"
        />
      </div>

      {result.entries.length < 2 ? (
        <p style={{ opacity: 0.8 }}>{text("needTwo")}</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 16 }}>{text("radar")}</h2>
              <SvgFrame
                viewBox="0 0 400 410"
                ariaLabel={text("radar")}
                title={text("radar")}
                desc={METRIC_KEYS.map(metricLabel).join(", ")}
              >
                {GRID_LEVELS.map((level) => (
                  <polygon
                    key={`grid-${level}`}
                    points={radarPolygonPoints(
                      computeRadarVertices([level, level, level, level, level, level], RADAR_CENTER, RADAR_RADIUS),
                    )}
                    fill="none"
                    stroke="var(--line, #94a3b8)"
                    strokeWidth={level === 100 ? 1.5 : 1}
                    opacity={level === 100 ? 0.9 : 0.45}
                  />
                ))}
                {METRIC_KEYS.map((key, index) => {
                  const outer = computeRadarVertices(
                    [100, 100, 100, 100, 100, 100],
                    RADAR_CENTER,
                    RADAR_RADIUS,
                  )[index]!;
                  const labelX = RADAR_CENTER.x + (outer.x - RADAR_CENTER.x) * 1.18;
                  const labelY = RADAR_CENTER.y + (outer.y - RADAR_CENTER.y) * 1.18;
                  const anchor = labelX < RADAR_CENTER.x - 4 ? "end" : labelX > RADAR_CENTER.x + 4 ? "start" : "middle";
                  return (
                    <g key={`axis-${key}`}>
                      <line
                        x1={RADAR_CENTER.x}
                        y1={RADAR_CENTER.y}
                        x2={outer.x}
                        y2={outer.y}
                        stroke="var(--line, #94a3b8)"
                        opacity={0.5}
                      />
                      <text x={labelX} y={labelY + 4} textAnchor={anchor} fontSize={11}>
                        {metricLabel(key)}
                      </text>
                    </g>
                  );
                })}
                {GRID_LEVELS.map((level) => {
                  const vertex = computeRadarVertices(
                    [level, level, level, level, level, level],
                    RADAR_CENTER,
                    RADAR_RADIUS,
                  )[0]!;
                  return (
                    <text key={`tick-${level}`} x={RADAR_CENTER.x + 5} y={vertex.y + 4} fontSize={9} opacity={0.6}>
                      {level}
                    </text>
                  );
                })}
                {result.entries.map((entry) => {
                  const vertices = computeRadarVertices(entry.normalized, RADAR_CENTER, RADAR_RADIUS);
                  const color = colorOf(entry.gpu.slug);
                  return (
                    <g key={`series-${entry.gpu.slug}`}>
                      <polygon
                        points={radarPolygonPoints(vertices)}
                        fill={color}
                        fillOpacity={0.16}
                        stroke={color}
                        strokeWidth={2}
                      />
                      {vertices.map((vertex) => {
                        const active = hover?.slug === entry.gpu.slug && hover.metric === vertex.metric;
                        return (
                          <circle
                            key={`point-${entry.gpu.slug}-${vertex.metric}`}
                            cx={vertex.x}
                            cy={vertex.y}
                            r={active ? 6 : 3.5}
                            fill={color}
                            stroke={active ? "#0f172a" : "#fff"}
                            strokeWidth={active ? 2 : 1}
                            tabIndex={0}
                            role="button"
                            aria-label={`${entry.gpu.name} ${metricLabel(vertex.metric)} ${metricDisplay(
                              vertex.metric,
                              entry.raw[vertex.metric],
                            )}`}
                            onMouseEnter={() => setHover({ slug: entry.gpu.slug, metric: vertex.metric })}
                            onMouseLeave={() => setHover(null)}
                            onFocus={() => setHover({ slug: entry.gpu.slug, metric: vertex.metric })}
                            onBlur={() => setHover(null)}
                            style={{ cursor: "pointer" }}
                          >
                            <title>{`${entry.gpu.name} · ${metricLabel(vertex.metric)}: ${metricDisplay(
                              vertex.metric,
                              entry.raw[vertex.metric],
                            )}`}</title>
                          </circle>
                        );
                      })}
                    </g>
                  );
                })}
                <text x={200} y={402} textAnchor="middle" fontSize={11} fill="#0f172a">
                  {hoverText}
                </text>
              </SvgFrame>
              <LegendPills
                items={result.entries.map((entry) => ({
                  label: entry.gpu.name,
                  color: colorOf(entry.gpu.slug),
                  value: `${fmtTps(entry.raw.writingTps)} write`,
                }))}
              />
            </div>

            <div>
              <h2 style={{ fontSize: 16 }}>{text("bars")}</h2>
              <SvgFrame
                viewBox={`0 0 900 ${24 + METRIC_KEYS.length * 94}`}
                ariaLabel={text("bars")}
                title={text("bars")}
              >
                {METRIC_KEYS.map((key, groupIndex) => {
                  const groupY = 24 + groupIndex * 94;
                  return (
                    <g key={`bar-group-${key}`}>
                      <text x={10} y={groupY} fontSize={13} fontWeight={600}>
                        {metricLabel(key)} · {metricDisplay(key, result.maxRaw[key])}
                      </text>
                      {result.entries.map((entry, entryIndex) => {
                        const barY = groupY + 12 + entryIndex * 20;
                        const color = colorOf(entry.gpu.slug);
                        const width = (660 * entry.normalized[key]) / 100;
                        const active = hover?.slug === entry.gpu.slug && hover.metric === key;
                        return (
                          <g key={`bar-${key}-${entry.gpu.slug}`}>
                            <text x={160} y={barY + 12} textAnchor="end" fontSize={11} opacity={0.85}>
                              {entry.gpu.name}
                            </text>
                            <rect x={170} y={barY} width={660} height={14} rx={3} fill="var(--muted-bg, #e2e8f0)" />
                            <rect
                              x={170}
                              y={barY}
                              width={width}
                              height={14}
                              rx={3}
                              fill={color}
                              opacity={active ? 1 : 0.82}
                              tabIndex={0}
                              role="button"
                              aria-label={`${entry.gpu.name} ${metricLabel(key)} ${metricDisplay(
                                key,
                                entry.raw[key],
                              )}`}
                              onMouseEnter={() => setHover({ slug: entry.gpu.slug, metric: key })}
                              onMouseLeave={() => setHover(null)}
                              onFocus={() => setHover({ slug: entry.gpu.slug, metric: key })}
                              onBlur={() => setHover(null)}
                              style={{ cursor: "pointer" }}
                            >
                              <title>{`${entry.gpu.name} · ${metricLabel(key)}: ${metricDisplay(
                                key,
                                entry.raw[key],
                              )}`}</title>
                            </rect>
                            <text x={840} y={barY + 12} fontSize={11} fontVariant="tabular-nums">
                              {metricDisplay(key, entry.raw[key])}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </SvgFrame>
            </div>
          </div>

          <div style={{ overflowX: "auto", marginTop: 24 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{text("gpu")}</th>
                  <th>{text("vram")}</th>
                  <th>{text("bandwidth")}</th>
                  <th>{text("writeTps")}</th>
                  <th>{text("readingTps")}</th>
                  <th>{text("tdp")}</th>
                  <th>{text("psu")}</th>
                  <th>{text("details")}</th>
                </tr>
              </thead>
              <tbody>
                {result.entries.map((entry) => (
                  <tr key={entry.gpu.slug} style={{ borderTop: "1px solid var(--line, #ccc)" }}>
                    <td style={{ padding: "8px 6px" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: "inline-block",
                          width: 9,
                          height: 9,
                          borderRadius: "50%",
                          background: colorOf(entry.gpu.slug),
                          marginRight: 6,
                        }}
                      />
                      {entry.gpu.name}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{fmtGb(entry.gpu.vramGb, 1)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{fmtNum(entry.gpu.bandwidthGbs)} GB/s</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{fmtTps(entry.gpu.writingTps)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>{fmtTps(entry.gpu.readingTps)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      {entry.gpu.powerWatts ? `${fmtNum(entry.gpu.powerWatts)} W` : "—"}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      {entry.gpu.recommendedPsuWatts ? `${fmtNum(entry.gpu.recommendedPsuWatts)} W` : "—"}
                    </td>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      <Link href={`/gpus/${entry.gpu.slug}`}>{text("details")}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ToolShell>
  );
}
