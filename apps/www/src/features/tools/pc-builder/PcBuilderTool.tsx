"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import { fmtPct, fmtTps, fmtUsd, fmtWatts } from "../format";
import type { ToolsBundle } from "../types";
import {
  BOM_CATEGORIES,
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_FILTERS,
  TIER_OPTIONS,
  URL_SCHEMA,
  VENDOR_OPTIONS,
  VRAM_MAX,
  arcPath,
  buildDetail,
  decodeBuilderUrl,
  encodeBuilderUrl,
  performanceBars,
  polarPoint,
  recommendWithFallback,
  type BomCategory,
  type BuilderFilters,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "PC Builder",
  subtitle: "Pick a real catalogue build by budget, vendor and VRAM — then inspect power, headroom and efficiency.",
  budget: "Max budget",
  vendor: "GPU vendor",
  vram: "Minimum VRAM",
  tier: "Build tier",
  all: "All",
  recommendations: "Top 3 recommendations",
  selected: "Selected build",
  donut: "Estimated BOM split",
  donutDesc: "Cost groups derived from the catalogue total; shares are estimates, not live retailer prices.",
  gauge: "PSU load & headroom",
  gaugeDesc: "Half-circle gauge: load watts vs. headroom against the suggested standard PSU capacity.",
  bars: "Read / write throughput",
  barsDesc: "Catalogue throughput for the recommended builds, normalized to the fastest entry in the set.",
  read: "Read",
  write: "Write",
  total: "Total",
  psu: "Suggested PSU",
  load: "Load",
  headroom: "Headroom",
  efficiency: "Efficiency",
  detail: "Build detail",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  buildLink: "Full build parts list",
  roiLink: "Compare with API costs",
  empty: "No build matches these filters.",
  emptyHint: "Relax the filters below to restore recommendations.",
  relaxed: "No exact match — showing the closest relaxed search.",
  estimated: "Estimated from catalogue figures",
  tpsPer100W: "tok/s per 100 W",
  resetFilters: "Clear filters",
  score: "Match score",
};

function useLabel(labels?: Record<string, string>) {
  return (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
}

type Props = { bundle: ToolsBundle; labels?: Record<string, string> };

const DONUT = { cx: 150, cy: 150, radius: 96, width: 42 };
const GAUGE = { cx: 180, cy: 176, radius: 118 };
const BAR = { x: 156, width: 470, rowHeight: 62 };

export function PcBuilderTool({ bundle, labels }: Props) {
  const t = useLabel(labels);
  const [filters, setFilters] = useState<BuilderFilters>({ ...DEFAULT_FILTERS });
  const [pick, setPick] = useState("");
  const [activeCategory, setActiveCategory] = useState<BomCategory | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore query state on the client only; SSR always renders defaults.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const state = decodeBuilderUrl(window.location.search);
    setFilters({
      maxBudgetUsd: state.maxBudgetUsd,
      vendor: state.vendor,
      minVramGb: state.minVramGb,
      tier: state.tier,
    });
    setPick(state.pick);
    setHydrated(true);
  }, []);

  const { recommendations, filters: effectiveFilters, relaxed } = useMemo(
    () => recommendWithFallback(bundle, filters),
    [bundle, filters],
  );

  const selected = useMemo(
    () => recommendations.find((entry) => entry.build.slug === pick) ?? recommendations[0] ?? null,
    [recommendations, pick],
  );

  const detail = useMemo(
    () => (selected ? buildDetail(selected.build, bundle.builds) : null),
    [selected, bundle.builds],
  );

  const bars = useMemo(
    () => performanceBars(recommendations.map((entry) => entry.build)),
    [recommendations],
  );

  const shareQuery = useMemo(
    () => encodeBuilderUrl(effectiveFilters, selected?.build.slug ?? ""),
    [effectiveFilters, selected],
  );

  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [shareQuery, hydrated]);

  function updateFilter<K extends keyof BuilderFilters>(key: K, value: BuilderFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setActiveCategory(null);
  }

  function reset() {
    setFilters({ ...DEFAULT_FILTERS });
    setPick("");
    setActiveCategory(null);
  }

  const controlStyle = { display: "grid", gap: 6, minWidth: 0 } as const;
  const tierValues: readonly string[] = TIER_OPTIONS;
  const vendorValues: readonly string[] = VENDOR_OPTIONS;

  return (
    <ToolShell
      slug="pc-builder"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={recommendations[0]?.build.tier ?? t("all")}
      shareQuery={shareQuery}
      onReset={reset}
      ctaLabel={t("buildLink")}
    >
      <div
        className="tool-controls"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}
      >
        <label style={controlStyle}>
          <span>{t("budget")}: {fmtUsd(filters.maxBudgetUsd, 0)}</span>
          <input
            style={{ width: "100%" }}
            type="range"
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={100}
            value={filters.maxBudgetUsd}
            onChange={(event) => updateFilter("maxBudgetUsd", Number(event.target.value))}
          />
        </label>
        <label style={controlStyle}>
          <span>{t("vendor")}</span>
          <select value={filters.vendor} onChange={(event) => updateFilter("vendor", event.target.value as BuilderFilters["vendor"])}>
            {vendorValues.map((vendor) => (
              <option key={vendor} value={vendor}>{vendor === "all" ? t("all") : vendor}</option>
            ))}
          </select>
        </label>
        <label style={controlStyle}>
          <span>{t("vram")}: {filters.minVramGb === 0 ? t("all") : `${filters.minVramGb} GB`}</span>
          <input
            style={{ width: "100%" }}
            type="range"
            min={0}
            max={VRAM_MAX}
            step={8}
            value={filters.minVramGb}
            onChange={(event) => updateFilter("minVramGb", Number(event.target.value))}
          />
        </label>
        <label style={controlStyle}>
          <span>{t("tier")}</span>
          <select value={filters.tier} onChange={(event) => updateFilter("tier", event.target.value as BuilderFilters["tier"])}>
            {tierValues.map((tier) => (
              <option key={tier} value={tier}>{tier === "all" ? t("all") : tier}</option>
            ))}
          </select>
        </label>
      </div>

      {relaxed ? <p style={{ color: "var(--warn, #b45309)" }}>{t("relaxed")}</p> : null}

      {recommendations.length === 0 ? (
        <section aria-label={t("empty")}>
          <p>{t("empty")}</p>
          <button type="button" onClick={reset}>{t("resetFilters")}</button>
          <p style={{ opacity: 0.8, fontSize: 12 }}>{t("emptyHint")}</p>
        </section>
      ) : (
        <>
          <section aria-label={t("recommendations")}>
            <h2>{t("recommendations")}</h2>
            <div role="group" aria-label={t("recommendations")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recommendations.map((entry, index) => {
                const active = entry.build.slug === selected?.build.slug;
                return (
                  <button
                    key={entry.build.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPick(entry.build.slug)}
                    style={{
                      padding: "8px 12px",
                      border: active ? "2px solid var(--accent, #2563eb)" : "1px solid var(--line, #ccc)",
                      textAlign: "left",
                    }}
                  >
                    <strong>#{index + 1} {entry.build.title || entry.build.gpuModel}</strong>
                    <span style={{ display: "block", fontSize: 12, opacity: 0.8 }}>
                      {fmtUsd(entry.build.totalPriceUsd, 0)} · {fmtTps(entry.build.writingTps)} · {entry.build.totalVramGb} GB VRAM · {t("score")} {entry.score}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {detail ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 20 }}>
              <section aria-label={t("donut")}>
                <h2>{t("donut")}</h2>
                <div style={{ overflowX: "auto" }}>
                  <SvgFrame
                    viewBox="0 0 300 300"
                    ariaLabel={t("donut")}
                    title={t("donut")}
                    desc={t("donutDesc")}
                  >
                    <circle cx={DONUT.cx} cy={DONUT.cy} r={DONUT.radius} fill="none" stroke="var(--line, #e2e8f0)" strokeWidth={DONUT.width} />
                    {detail.donut.map((segment) => {
                      const active = activeCategory === segment.key;
                      return (
                        <path
                          key={segment.key}
                          d={arcPath(DONUT.cx, DONUT.cy, DONUT.radius, segment.startAngle, segment.endAngle)}
                          fill="none"
                          stroke={BOM_CATEGORIES[segment.key].color}
                          strokeWidth={active ? DONUT.width + 8 : DONUT.width}
                          strokeOpacity={active ? 1 : 0.85}
                          role="button"
                          tabIndex={0}
                          aria-label={`${segment.label}: ${fmtUsd(segment.usd)} (${fmtPct(segment.pct)})`}
                          aria-pressed={active}
                          onClick={() => setActiveCategory(active ? null : segment.key)}
                          onFocus={() => setActiveCategory(segment.key)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveCategory(active ? null : segment.key);
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <title>{`${segment.label}: ${fmtUsd(segment.usd)} (${fmtPct(segment.pct)})`}</title>
                        </path>
                      );
                    })}
                    <text x={DONUT.cx} y={DONUT.cy - 4} textAnchor="middle" fontSize={26} fontWeight={700}>
                      {fmtUsd(detail.bom.totalUsd, 0)}
                    </text>
                    <text x={DONUT.cx} y={DONUT.cy + 18} textAnchor="middle" fontSize={12} opacity={0.7}>
                      {t("total")}
                    </text>
                    <text x={DONUT.cx} y={290} textAnchor="middle" fontSize={11} opacity={0.7}>
                      {t("estimated")}
                    </text>
                  </SvgFrame>
                </div>
                <LegendPills
                  items={detail.bom.shares.map((share) => ({
                    label: share.label,
                    color: BOM_CATEGORIES[share.key].color,
                    value: `${fmtUsd(share.usd, 0)} · ${fmtPct(share.pct)}`,
                  }))}
                />
              </section>

              <section aria-label={t("gauge")}>
                <h2>{t("gauge")}</h2>
                <div style={{ overflowX: "auto" }}>
                  <SvgFrame viewBox="0 0 360 320" ariaLabel={t("gauge")} title={t("gauge")} desc={t("gaugeDesc")}>
                    <path
                      d={arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, 180, 360)}
                      fill="none"
                      stroke="var(--line, #e2e8f0)"
                      strokeWidth={26}
                      strokeLinecap="round"
                    />
                    {detail.psu.recommendedWatts > 0 ? (
                      <>
                        <path
                          d={arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, 180, 180 + detail.gauge.loadAngle)}
                          fill="none"
                          stroke="#dc2626"
                          strokeWidth={26}
                        />
                        <path
                          d={arcPath(GAUGE.cx, GAUGE.cy, GAUGE.radius, 180 + detail.gauge.loadAngle, 360)}
                          fill="none"
                          stroke="#16a34a"
                          strokeWidth={26}
                        />
                      </>
                    ) : null}
                    {[0, 25, 50, 75, 100].map((value) => {
                      const angle = 180 + (value / 100) * 180;
                      const outer = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius + 22, angle);
                      const inner = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius + 12, angle);
                      const label = polarPoint(GAUGE.cx, GAUGE.cy, GAUGE.radius + 38, angle);
                      return (
                        <g key={value}>
                          <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--line, #94a3b8)" />
                          <text x={label.x} y={label.y + 4} textAnchor="middle" fontSize={10} opacity={0.75}>{value}</text>
                        </g>
                      );
                    })}
                    <text x={GAUGE.cx} y={GAUGE.cy - 30} textAnchor="middle" fontSize={30} fontWeight={700}>
                      {fmtPct(detail.psu.loadPct)}
                    </text>
                    <text x={GAUGE.cx} y={GAUGE.cy - 6} textAnchor="middle" fontSize={12} opacity={0.8}>
                      {t("load")}
                    </text>
                    <text x={GAUGE.cx} y={GAUGE.cy + 22} textAnchor="middle" fontSize={12}>
                      {fmtWatts(detail.psu.loadWatts)} / {detail.psu.recommendedWatts > 0 ? fmtWatts(detail.psu.recommendedWatts) : t("all")}
                    </text>
                    <text x={GAUGE.cx} y={214} textAnchor="middle" fontSize={11} opacity={0.7}>
                      {t("headroom")} {fmtPct(detail.psu.headroomPct)} · {detail.psu.tier}
                    </text>
                  </SvgFrame>
                </div>
                <LegendPills items={[
                  { label: t("load"), color: "#dc2626", value: fmtWatts(detail.psu.loadWatts) },
                  { label: t("headroom"), color: "#16a34a", value: fmtPct(detail.psu.headroomPct) },
                ]} />
              </section>
            </div>
          ) : null}

          {detail ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 20 }}>
              <MetricStat label={t("total")} value={fmtUsd(detail.build.totalPriceUsd, 0)} sub={detail.build.tier} />
              <MetricStat label={t("read")} value={fmtTps(detail.build.readingTps)} sub={detail.build.evidence} />
              <MetricStat label={t("write")} value={fmtTps(detail.build.writingTps)} tone="accent" />
              <MetricStat label={t("efficiency")} value={`${detail.efficiencyTpsPer100W}`} sub={t("tpsPer100W")} />
              <MetricStat label={t("psu")} value={detail.psu.recommendedWatts > 0 ? fmtWatts(detail.psu.recommendedWatts) : "—"} />
            </div>
          ) : null}

          <section aria-label={t("bars")} style={{ marginTop: 20 }}>
            <h2>{t("bars")}</h2>
            <div style={{ overflowX: "auto" }}>
              <SvgFrame
                viewBox={`0 0 ${BAR.x + BAR.width + 20} ${bars.length * BAR.rowHeight + 70}`}
                ariaLabel={t("bars")}
                title={t("bars")}
                desc={t("barsDesc")}
              >
                <text x={BAR.x} y={22} fontSize={11} opacity={0.7}>{t("read")}</text>
                <text x={BAR.x + BAR.width} y={22} textAnchor="end" fontSize={11} opacity={0.7}>{t("write")}</text>
                {bars.map((row, index) => {
                  const y = 40 + index * BAR.rowHeight;
                  const active = row.build.slug === selected?.build.slug;
                  return (
                    <g
                      key={row.build.slug}
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      aria-label={`${row.build.title || row.build.gpuModel}: ${t("read")} ${fmtTps(row.build.readingTps)}, ${t("write")} ${fmtTps(row.build.writingTps)}`}
                      onClick={() => setPick(row.build.slug)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setPick(row.build.slug);
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <rect x={0} y={y - 12} width={BAR.x + BAR.width + 16} height={BAR.rowHeight - 8} rx={8}
                        fill={active ? "var(--accent-bg, #eff6ff)" : "transparent"}
                        stroke={active ? "var(--accent, #2563eb)" : "transparent"} />
                      <text x={8} y={y + 12} fontSize={12} fontWeight={active ? 700 : 400}>
                        #{index + 1} {(row.build.title || row.build.gpuModel).slice(0, 24)}
                      </text>
                      <rect x={BAR.x} y={y} width={BAR.width} height={8} rx={4} fill="var(--line, #e2e8f0)" />
                      <rect x={BAR.x} y={y} width={(BAR.width * row.readPct) / 100} height={8} rx={4} fill="#7c3aed" />
                      <rect x={BAR.x} y={y + 18} width={BAR.width} height={8} rx={4} fill="var(--line, #e2e8f0)" />
                      <rect x={BAR.x} y={y + 18} width={(BAR.width * row.writePct) / 100} height={8} rx={4} fill="#2563eb" />
                      <text x={BAR.x + BAR.width} y={y + 27} textAnchor="end" fontSize={10} opacity={0.75}>
                        {fmtTps(row.build.readingTps, 0)} / {fmtTps(row.build.writingTps, 0)}
                      </text>
                    </g>
                  );
                })}
              </SvgFrame>
            </div>
          </section>

          {detail ? (
            <section aria-label={t("detail")} style={{ marginTop: 20 }}>
              <h2>{t("detail")}: {detail.build.title || detail.build.gpuModel}</h2>
              <p>{detail.build.tagline}</p>
              <p style={{ opacity: 0.85 }}>
                {detail.build.gpuModel} × {detail.build.gpuCount} · {detail.build.totalVramGb} GB VRAM · {detail.build.systemRamGb} GB RAM · {detail.build.runtime}
              </p>
              {selected ? <p style={{ opacity: 0.8 }}>{selected.reasons.join(" · ")}</p> : null}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
                {detail.alternatives.upgrade ? (
                  <span>{t("upgrade")}: <Link href={`/builds/${detail.alternatives.upgrade.slug}`}>{detail.alternatives.upgrade.title}</Link> ({fmtUsd(detail.alternatives.upgrade.priceUsd, 0)})</span>
                ) : null}
                {detail.alternatives.downgrade ? (
                  <span>{t("downgrade")}: <Link href={`/builds/${detail.alternatives.downgrade.slug}`}>{detail.alternatives.downgrade.title}</Link> ({fmtUsd(detail.alternatives.downgrade.priceUsd, 0)})</span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
                <Link href={`/builds/${detail.build.slug}`}>{t("buildLink")}</Link>
                <Link href="/tools/roi-calculator">{t("roiLink")}</Link>
              </div>
            </section>
          ) : null}
        </>
      )}
    </ToolShell>
  );
}

export { URL_SCHEMA };
