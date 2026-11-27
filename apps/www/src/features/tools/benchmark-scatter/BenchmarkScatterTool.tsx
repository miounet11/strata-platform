"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import { fmtNum } from "../format";
import type { ToolsBundle } from "../types";
import {
  AXES,
  AXIS_KEYS,
  ALL_VENDORS,
  SCATTER_PRESETS,
  buildScatter,
  decodeScatterUrl,
  encodeScatterUrl,
  axisValue,
  listVendors,
  presetFor,
  type AxisKey,
  type ScatterPoint,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "Benchmark Scatter",
  subtitle: "Explore measured rigs on any two axes; the dashed line marks the Pareto frontier.",
  xAxis: "X axis",
  yAxis: "Y axis",
  vendor: "Vendor",
  presets: "Presets",
  chart: "Rig scatter plot",
  chartDesc: "Dots are measured rigs, coloured by vendor; the dashed polyline connects non-dominated rigs.",
  plotted: "Plotted rigs",
  excluded: "Excluded (missing axis)",
  frontier: "Frontier rigs",
  detail: "Machine details",
  choose: "Hover, click or focus a dot to inspect a machine.",
  none: "No rig matches the selected axes and vendor.",
  openBenchmark: "Open full benchmark",
  allVendors: "All vendors",
  pareto: "Pareto frontier",
  dominated: "Dominated",
};

const VENDOR_COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#b45309"];
const W = 780;
const H = 470;
const PAD = { left: 78, right: 26, top: 28, bottom: 62 };

type Props = { bundle: ToolsBundle; labels?: Record<string, string> };

/** Stable colour per vendor name, independent of rig input order. */
function vendorColor(vendor: string, vendors: readonly string[]): string {
  const index = vendors.indexOf(vendor);
  return VENDOR_COLORS[(index < 0 ? 0 : index) % VENDOR_COLORS.length]!;
}

function niceTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  return [0, 0.25, 0.5, 0.75, 1].map((frac) => min + (max - min) * frac);
}

function formatTick(value: number, axis: AxisKey): string {
  if (!Number.isFinite(value)) return "";
  if (AXES[axis].direction === "min" && (axis === "localCostPerMM" || axis === "breakEvenDays")) {
    return AXES[axis].format(value);
  }
  return fmtNum(value);
}

export function BenchmarkScatterTool({ bundle, labels }: Props) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [x, setX] = useState<AxisKey>("rigTotal");
  const [y, setY] = useState<AxisKey>("writingToks");
  const [vendor, setVendor] = useState<string>(ALL_VENDORS);
  const [selectedId, setSelectedId] = useState<string>("");
  const [hoveredId, setHoveredId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // Initial render uses schema defaults on both server and client. The URL is
  // only read after mount, so the markup matches during hydration.
  useEffect(() => {
    const state = decodeScatterUrl(window.location.search);
    setX(state.x);
    setY(state.y);
    setVendor(state.vendor);
    setSelectedId(state.rig);
    setHydrated(true);
  }, []);

  const shareQuery = useMemo(
    () => encodeScatterUrl({ x, y, vendor, rig: selectedId }),
    [x, y, vendor, selectedId],
  );

  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [hydrated, shareQuery]);

  const result = useMemo(
    () => buildScatter(bundle.rigs, { x, y, vendor }),
    [bundle.rigs, x, y, vendor],
  );

  const activeId = hoveredId || selectedId;
  const active = result.points.find((point) => point.id === activeId) ?? null;
  const activePreset = presetFor(x, y);

  function selectPoint(point: ScatterPoint) {
    setSelectedId((current) => (current === point.id ? "" : point.id));
  }

  const xs = result.points.map((point) => point.x);
  const ys = result.points.map((point) => point.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xPad = (xMax - xMin) * 0.08 || Math.max(xMax * 0.05, 1);
  const yPad = (yMax - yMin) * 0.08 || Math.max(yMax * 0.05, 1);
  const dMinX = xMin - xPad;
  const dMaxX = xMax + xPad;
  const dMinY = yMin - yPad;
  const dMaxY = yMax + yPad;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xOf = (value: number) => PAD.left + ((value - dMinX) / (dMaxX - dMinX)) * plotW;
  const yOf = (value: number) => PAD.top + plotH - ((value - dMinY) / (dMaxY - dMinY)) * plotH;
  const ticksX = niceTicks(dMinX, dMaxX);
  const ticksY = niceTicks(dMinY, dMaxY);

  const frontierPath = result.frontier
    .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(point.x).toFixed(2)},${yOf(point.y).toFixed(2)}`)
    .join(" ");

  return (
    <ToolShell
      slug="benchmark-scatter"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("29 rigs")}
      shareQuery={shareQuery}
      onReset={() => { setX("rigTotal"); setY("writingToks"); setVendor(ALL_VENDORS); setSelectedId(""); }}
    >
      <div className="tool-controls" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 16 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("xAxis")}: {AXES[x].label}</span>
          <select value={x} onChange={(event) => setX(event.target.value as AxisKey)}>
            {AXIS_KEYS.map((key) => <option key={key} value={key}>{AXES[key].label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("yAxis")}: {AXES[y].label}</span>
          <select value={y} onChange={(event) => setY(event.target.value as AxisKey)}>
            {AXIS_KEYS.map((key) => <option key={key} value={key}>{AXES[key].label}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("vendor")}</span>
          <select value={vendor} onChange={(event) => setVendor(event.target.value)}>
            <option value={ALL_VENDORS}>{t("allVendors")}</option>
            {result.vendors.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div style={{ display: "grid", gap: 4 }}>
          <span>{t("presets")}</span>
          <div role="group" aria-label={t("presets")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SCATTER_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.key}
                aria-pressed={activePreset === preset.key}
                onClick={() => { setX(preset.x); setY(preset.y); }}
                style={{ padding: "4px 10px", border: activePreset === preset.key ? "2px solid var(--accent, #2563eb)" : "1px solid var(--line, #ccc)" }}
              >
                {labels?.[`preset_${preset.key}`] ?? preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
        <MetricStat label={t("plotted")} value={fmtNum(result.validCount)} tone="accent" />
        <MetricStat label={t("frontier")} value={fmtNum(result.frontier.length)} tone="accent" />
        <MetricStat label={t("excluded")} value={fmtNum(result.excludedCount)} tone={result.excludedCount ? "warn" : "neutral"} />
      </div>

      <p style={{ opacity: 0.8, fontSize: 12 }}>{t("choose")}</p>

      <div style={{ overflowX: "auto" }}>
        <SvgFrame viewBox={`0 0 ${W} ${H}`} ariaLabel={t("chart")} title={t("chart")} desc={t("chartDesc")}>
          {ticksY.map((tick, index) => (
            <g key={`y-${index}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--line, #ddd)" strokeDasharray="3 4" />
              <text x={PAD.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={11}>{formatTick(tick, y)}</text>
            </g>
          ))}
          {ticksX.map((tick, index) => (
            <g key={`x-${index}`}>
              <line x1={xOf(tick)} x2={xOf(tick)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line, #eee)" strokeDasharray="3 4" />
              <text x={xOf(tick)} y={PAD.top + plotH + 18} textAnchor="middle" fontSize={11}>{formatTick(tick, x)}</text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--line, #888)" />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line, #888)" />
          <text x={PAD.left + plotW / 2} y={H - 12} textAnchor="middle" fontSize={12}>{AXES[x].label}</text>
          <text x={16} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={12} transform={`rotate(-90 16 ${PAD.top + plotH / 2})`}>{AXES[y].label}</text>

          {result.frontier.length > 1 ? (
            <path d={frontierPath} fill="none" stroke="#0f172a" strokeWidth={2.5} strokeDasharray="7 5" style={{ pointerEvents: "none" }} />
          ) : null}

          {result.points.map((point) => {
            const cx = xOf(point.x);
            const cy = yOf(point.y);
            const isActive = point.id === activeId;
            const color = vendorColor(point.vendor, result.vendors);
            return (
              <g
                key={point.id}
                role="button"
                tabIndex={0}
                aria-label={`${point.name}, ${AXES[x].label} ${AXES[x].format(point.x)}, ${AXES[y].label} ${AXES[y].format(point.y)}, ${point.pareto ? t("pareto") : t("dominated")}`}
                onClick={() => selectPoint(point)}
                onMouseEnter={() => setHoveredId(point.id)}
                onMouseLeave={() => setHoveredId("")}
                onFocus={() => setHoveredId(point.id)}
                onBlur={() => setHoveredId("")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectPoint(point);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 9 : 6}
                  fill={color}
                  fillOpacity={point.pareto ? 0.85 : 0.45}
                  stroke={isActive ? "#0f172a" : point.pareto ? color : "none"}
                  strokeWidth={isActive ? 3 : point.pareto ? 2 : 0}
                />
                <title>{`${point.name} · ${AXES[x].format(point.x)} / ${AXES[y].format(point.y)}`}</title>
              </g>
            );
          })}
        </SvgFrame>
        {result.points.length === 0 ? <p>{t("none")}</p> : null}
      </div>

      <LegendPills items={[
        { label: t("pareto"), color: "#0f172a" },
        ...result.vendors.map((name) => ({ label: name, color: vendorColor(name, result.vendors) })),
      ]} />

      <section className="tool-comparison" aria-label={t("detail")} style={{ marginTop: 18 }}>
        <h2>{t("detail")}</h2>
        {active ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p><strong>{active.name}</strong> · {active.vendor} · {active.rig.form}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {AXIS_KEYS.map((key) => (
                <MetricStat key={key} label={AXES[key].label} value={AXES[key].format(axisValue(active.rig, key))} tone="neutral" />
              ))}
            </div>
            <p>{active.pareto ? t("pareto") : t("dominated")} · {active.rig.note || active.rig.fit}</p>
            <Link href={`/benchmarks/${encodeURIComponent(active.id)}`}>{t("openBenchmark")}</Link>
          </div>
        ) : (
          <p>{t("choose")}</p>
        )}
      </section>
    </ToolShell>
  );
}
