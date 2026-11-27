"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { fmtDecimal, fmtNum, fmtPct, fmtUsd } from "../format";
import type { ToolsBundle } from "../types";
import {
  CLOUD_PRESETS,
  DEFAULT_INPUT,
  computeRoi,
  decodeRoiUrl,
  encodeRoiUrl,
  getPreset,
  normalizePresetKey,
  roiInputFromUrl,
  type PresetKey,
  type RoiInput,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "ROI Calculator",
  subtitle: "Compare five-year local hardware cost against cloud API spend and find the exact payback point.",
  hardware: "Hardware preset", custom: "Custom values", apiPreset: "Cloud API preset",
  rigPrice: "Rig price (USD)", power: "Power draw (W)", hours: "Daily hours",
  electricity: "Electricity ($/kWh)", dailyTokens: "Daily usage (M tokens)",
  readShare: "Read share (%)", readPrice: "API read ($/1M)", writePrice: "API write ($/1M)",
  horizon: "Horizon (months)", chart: "Cumulative cost curve",
  chartDesc: "Blue is local hardware plus power; orange is cumulative cloud API spend. Shading marks savings after payback.",
  local: "Local", cloud: "Cloud API", savings: "Savings",
  hover: "Hover a month band to read exact cumulative costs.",
  breakEven: "Break-even", never: "No break-even", breakEvenDays: "Payback days",
  netSavings: "5-year net savings", sensitivity: "Usage ±25% range",
  lowUsage: "-25% usage", highUsage: "+25% usage",
  benchmarks: "Open benchmarks", builds: "Browse builds", month: "Month",
};

const W = 760;
const H = 420;
const PAD = { left: 66, right: 20, top: 24, bottom: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

type HardwareOption = { id: string; name: string; price: number; watts: number };

function hardwareOptions(bundle: ToolsBundle): HardwareOption[] {
  const rigs = bundle.rigs
    .filter((rig) => (rig.rigTotal ?? rig.cardPrice) != null && rig.powerWatts > 0)
    .map((rig) => ({ id: `rig:${rig.id}`, name: rig.name, price: rig.rigTotal ?? rig.cardPrice ?? 0, watts: rig.powerWatts }));
  const builds = bundle.builds
    .filter((build) => build.totalPriceUsd > 0 && build.loadWatts > 0)
    .map((build) => ({ id: `build:${build.slug}`, name: build.title || build.gpuModel, price: build.totalPriceUsd, watts: build.loadWatts }));
  return [...rigs, ...builds];
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div style={{ display: "grid", gap: 4, padding: 12, border: "1px solid var(--line, #ddd)", borderRadius: 8 }}>
    <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
    <strong style={{ fontSize: 20, color: tone }}>{value}</strong>
  </div>;
}

const FIELDS: { key: keyof RoiInput; label: string; max: number; step: number }[] = [
  { key: "rigPriceUsd", label: "rigPrice", max: 1e9, step: 100 }, { key: "powerWatts", label: "power", max: 1e9, step: 10 },
  { key: "dailyHours", label: "hours", max: 24, step: 0.5 }, { key: "electricityPerKwh", label: "electricity", max: 1000, step: 0.01 },
  { key: "dailyMTokens", label: "dailyTokens", max: 1e9, step: 0.5 }, { key: "apiReadPerMM", label: "readPrice", max: 1e9, step: 0.1 },
  { key: "apiWritePerMM", label: "writePrice", max: 1e9, step: 0.1 }, { key: "horizonMonths", label: "horizon", max: 60, step: 1 },
];

export function RoiCalculatorTool({ bundle, labels }: { bundle: ToolsBundle; labels?: Record<string, string> }) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [preset, setPreset] = useState<PresetKey>("claude-sonnet");
  const [hardware, setHardware] = useState("");
  const [input, setInput] = useState<RoiInput>({ ...DEFAULT_INPUT });
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const state = decodeRoiUrl(window.location.search);
    setPreset(state.preset);
    setHardware(state.hardware);
    setInput(roiInputFromUrl(state));
    setHydrated(true);
  }, []);

  const shareQuery = useMemo(() => encodeRoiUrl({ ...input, preset, hardware }), [input, preset, hardware]);
  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [hydrated, shareQuery]);

  const result = useMemo(() => computeRoi(input), [input]);
  const options = useMemo(() => hardwareOptions(bundle), [bundle]);
  const { curve } = result;
  const horizon = result.input.horizonMonths;
  const maxCost = Math.max(1, ...curve.flatMap((point) => [point.localCumulativeUsd, point.cloudCumulativeUsd]));
  const xOf = (month: number) => PAD.left + (month / horizon) * PLOT_W;
  const yOf = (value: number) => PAD.top + PLOT_H - (value / maxCost) * PLOT_H;
  const line = (key: "localCumulativeUsd" | "cloudCumulativeUsd") =>
    curve.map((point, index) => `${index ? "L" : "M"}${xOf(point.month).toFixed(2)},${yOf(point[key]).toFixed(2)}`).join(" ");

  const crossing = result.breakEvenMonth;
  const crossingLocalAt = (month: number) => {
    const lo = Math.floor(month);
    const hi = Math.min(horizon, lo + 1);
    const frac = month - lo;
    return curve[lo]!.localCumulativeUsd * (1 - frac) + curve[hi]!.localCumulativeUsd * frac;
  };
  const savingsPath = crossing == null ? "" : (() => {
    const first = Math.ceil(crossing);
    const local = curve.slice(first).map((point) => `${xOf(point.month).toFixed(2)},${yOf(point.localCumulativeUsd).toFixed(2)}`);
    const cloud = curve.slice(first).reverse().map((point) => `${xOf(point.month).toFixed(2)},${yOf(point.cloudCumulativeUsd).toFixed(2)}`);
    return `M${xOf(crossing).toFixed(2)},${yOf(crossingLocalAt(crossing)).toFixed(2)} ` +
      [...local, ...cloud, `${xOf(crossing).toFixed(2)},${yOf(crossingLocalAt(crossing)).toFixed(2)}`].map((p) => `L${p}`).join(" ");
  })();

  const active = hoverMonth == null ? null : curve[hoverMonth];
  function setField(key: keyof RoiInput, raw: string) {
    setInput((current) => ({ ...current, [key]: Number(raw) }));
    if (key === "apiReadPerMM" || key === "apiWritePerMM") setPreset("custom");
  }
  function selectPreset(key: PresetKey) {
    const next = getPreset(key);
    setPreset(key);
    setInput((current) => ({
      ...current,
      apiReadPerMM: next.apiReadPerMM,
      apiWritePerMM: next.apiWritePerMM,
    }));
  }
  function selectHardware(id: string) {
    setHardware(id);
    const option = options.find((item) => item.id === id);
    if (option) setInput((current) => ({ ...current, rigPriceUsd: option.price, powerWatts: option.watts }));
  }

  return (
    <ToolShell
      slug="roi-calculator"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("5-year TCO")}
      shareQuery={shareQuery}
      onReset={() => { setInput({ ...DEFAULT_INPUT }); setPreset("claude-sonnet"); setHardware(""); setHoverMonth(null); }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("hardware")}</span>
          <select value={hardware} onChange={(event) => selectHardware(event.target.value)}>
            <option value="">{t("custom")}</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("apiPreset")}</span>
          <select value={preset} onChange={(event) => selectPreset(normalizePresetKey(event.target.value))}>
            {CLOUD_PRESETS.map((item) => (
              <option key={item.key} value={item.key}>{labels?.[`preset_${item.key}`] ?? item.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>{t("readShare")}</span>
          <input type="number" min={0} max={100} step={5} value={Math.round(result.input.readShare * 100)}
            onChange={(event) => setField("readShare", String(Number(event.target.value) / 100))} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
        {FIELDS.map((field) => (
          <label key={field.key} style={{ display: "grid", gap: 4 }}>
            <span>{t(field.label)}</span>
            <input type="number" min={0} max={field.max} step={field.step} value={result.input[field.key]}
              onChange={(event) => setField(field.key, event.target.value)} />
          </label>
        ))}
      </div>

      <p style={{ fontSize: 12, opacity: 0.8 }}>{t("hover")}</p>
      <div style={{ overflowX: "auto" }}>
        <SvgFrame viewBox={`0 0 ${W} ${H}`} ariaLabel={t("chart")} title={t("chart")} desc={t("chartDesc")}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <g key={`y-${frac}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yOf(maxCost * frac)} y2={yOf(maxCost * frac)} stroke="var(--line, #ddd)" strokeDasharray="3 4" />
              <text x={PAD.left - 8} y={yOf(maxCost * frac) + 4} textAnchor="end" fontSize={11}>{fmtUsd(maxCost * frac, 0)}</text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <text key={`x-${frac}`} x={xOf(horizon * frac)} y={PAD.top + PLOT_H + 20} textAnchor="middle" fontSize={11}>
              {fmtNum(horizon * frac)}
            </text>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="var(--line, #888)" />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--line, #888)" />

          {savingsPath ? <path d={savingsPath} fill="#16a34a" fillOpacity={0.18} /> : null}
          <path d={line("localCumulativeUsd")} fill="none" stroke="#2563eb" strokeWidth={2.5} />
          <path d={line("cloudCumulativeUsd")} fill="none" stroke="#ea580c" strokeWidth={2.5} />

          {crossing != null ? (
            <g>
              <line x1={xOf(crossing)} x2={xOf(crossing)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#16a34a" strokeDasharray="5 4" />
              <circle cx={xOf(crossing)} cy={yOf(crossingLocalAt(crossing))} r={7} fill="#16a34a" stroke="#fff" strokeWidth={2} />
              <text x={xOf(crossing) + 10} y={PAD.top + 16} fontSize={12} fill="#15803d">{t("breakEven")}</text>
            </g>
          ) : null}

          {active ? (
            <g>
              <line x1={xOf(active.month)} x2={xOf(active.month)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#0f172a" strokeOpacity={0.4} />
              <circle cx={xOf(active.month)} cy={yOf(active.localCumulativeUsd)} r={5} fill="#2563eb" />
              <circle cx={xOf(active.month)} cy={yOf(active.cloudCumulativeUsd)} r={5} fill="#ea580c" />
              <rect x={Math.min(W - 178, xOf(active.month) + 10)} y={PAD.top + 6} width={168} height={58} rx={6} fill="#fff" fillOpacity={0.94} stroke="var(--line, #ccc)" />
              <text x={Math.min(W - 168, xOf(active.month) + 20)} y={PAD.top + 24} fontSize={11}>{t("month")} {active.month} · {t("savings")} {fmtUsd(active.savingsUsd, 0)}</text>
              <text x={Math.min(W - 168, xOf(active.month) + 20)} y={PAD.top + 40} fontSize={11} fill="#2563eb">{t("local")} {fmtUsd(active.localCumulativeUsd, 0)}</text>
              <text x={Math.min(W - 168, xOf(active.month) + 20)} y={PAD.top + 56} fontSize={11} fill="#ea580c">{t("cloud")} {fmtUsd(active.cloudCumulativeUsd, 0)}</text>
            </g>
          ) : null}

          {curve.slice(0, -1).map((point) => (
            <rect key={point.month} x={xOf(point.month)} y={PAD.top} width={PLOT_W / horizon + 0.5} height={PLOT_H}
              fill="transparent" onMouseEnter={() => setHoverMonth(point.month)} onMouseLeave={() => setHoverMonth(null)} />
          ))}
        </SvgFrame>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
        <Metric label={t("breakEven")} value={result.breakEvenMonth == null ? t("never") : `${fmtDecimal(result.breakEvenMonth, 2)} mo`} tone={result.breakEvenMonth == null ? "#b45309" : "#15803d"} />
        <Metric label={t("breakEvenDays")} value={result.breakEvenDays == null ? "—" : fmtNum(result.breakEvenDays)} />
        <Metric label={t("netSavings")} value={fmtUsd(result.netSavings5YearUsd, 0)} tone={result.netSavings5YearUsd >= 0 ? "#15803d" : "#b45309"} />
        <Metric label={t("sensitivity")} value={`${fmtUsd(result.sensitivity.netSavings5YearRangeUsd[0], 0)} … ${fmtUsd(result.sensitivity.netSavings5YearRangeUsd[1], 0)}`} />
      </div>
      <p style={{ fontSize: 12, opacity: 0.85 }}>{result.breakEven.hint}</p>
      <p style={{ fontSize: 12, opacity: 0.85 }}>
        {t("lowUsage")}: {fmtUsd(result.sensitivity.low.netSavings5YearUsd, 0)} ({fmtPct(result.sensitivity.low.factor * 100, 0)}) ·
        {" "}{t("highUsage")}: {fmtUsd(result.sensitivity.high.netSavings5YearUsd, 0)} ({fmtPct(result.sensitivity.high.factor * 100, 0)})
      </p>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <Link href="/benchmarks">{t("benchmarks")}</Link>
        <Link href="/builds">{t("builds")}</Link>
      </div>
    </ToolShell>
  );
}
