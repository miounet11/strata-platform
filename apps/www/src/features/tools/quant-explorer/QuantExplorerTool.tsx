"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import { fmtDecimal, fmtGb, fmtTps } from "../format";
import { decodeQuery, encodeQuery } from "../url-state";
import type { ToolsBundle } from "../types";
import {
  CONTEXT_OPTIONS,
  QUALITY_LADDER,
  RAM_MAX,
  RAM_MIN,
  URL_SCHEMA,
  comparePacks,
  evaluatePacks,
  normalizeEnvironment,
  type ContextK,
  type FitStatus,
  type QuantEvaluation,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "Quant Explorer",
  subtitle: "Compare the six shipped quant packs by download size, estimated speed, memory floor and fit.",
  gpu: "GPU",
  ram: "System RAM",
  context: "Context window",
  matrix: "Trade-off matrix",
  matrixDesc: "X = download size, Y = estimated generation speed, bubble radius = RAM floor, colour = fit status.",
  qualityTitle: "Quality ladder (1–5)",
  selectHint: "Click a bubble to set quant A, then another for quant B.",
  comparison: "Quant A vs Quant B",
  speedDelta: "Speed change (B vs A)",
  sizeDelta: "Download change (B vs A)",
  ramDelta: "RAM floor change (B vs A)",
  recommend: "Recommended",
  details: "All six quant packs",
  colPack: "Pack",
  colDownload: "Download",
  colRam: "RAM floor",
  colVram: "VRAM floor",
  colSpeed: "Est. speed",
  colQuality: "Quality tier",
  colFit: "Fit",
  colContext: "Context cache",
  modelsLink: "Browse models",
  downloadLink: "Download",
  empty: "No usable quant packs in this catalogue.",
  none: "—",
};

const FIT_COLORS: Record<FitStatus, string> = {
  "full-vram": "#16a34a",
  "hybrid-offload": "#d97706",
  "needs-ram": "#dc2626",
};

const FIT_LABELS: Record<FitStatus, string> = {
  "full-vram": "Full VRAM",
  "hybrid-offload": "Hybrid offload",
  "needs-ram": "Needs RAM",
};

const W = 760;
const H = 470;
const PAD = { left: 70, right: 220, top: 80, bottom: 56 };

type Props = { bundle: ToolsBundle; labels?: Record<string, string> };

function pickState(search: string) {
  const state = decodeQuery(search, URL_SCHEMA);
  const ctxNum = Number(state.ctx);
  const ctx: ContextK = ctxNum === 8 || ctxNum === 64 || ctxNum === 128 ? ctxNum : 32;
  return {
    gpuId: String(state.gpu),
    ram: Number(state.ram),
    ctx,
    a: String(state.a),
    b: String(state.b),
  };
}

export function QuantExplorerTool({ bundle, labels }: Props) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [initial] = useState(() => pickState(""));
  const [gpuId, setGpuId] = useState(initial.gpuId);
  const [ram, setRam] = useState(initial.ram);
  const [ctx, setCtx] = useState<ContextK>(initial.ctx);
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = pickState(window.location.search);
    setGpuId(s.gpuId);
    setRam(s.ram);
    setCtx(s.ctx);
    setA(s.a);
    setB(s.b);
    setHydrated(true);
  }, []);

  const gpus = bundle.gpus.filter((gpu) => gpu.support !== "not-supported");
  const gpu = gpus.find((item) => item.id === gpuId) ?? gpus.find((item) => item.slug === gpuId) ?? gpus[0];

  const env = useMemo(() => normalizeEnvironment(gpu, ram, ctx), [gpu, ram, ctx]);
  const rows = useMemo(() => (env ? evaluatePacks(bundle.variants, env) : []), [bundle.variants, env]);
  const comparison = useMemo(() => comparePacks(rows, a, b), [rows, a, b]);

  const shareQuery = useMemo(
    () => encodeQuery(
      { gpu: gpu?.id ?? "", ram, ctx: String(ctx), a, b },
      URL_SCHEMA,
    ),
    [gpu, ram, ctx, a, b],
  );

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [shareQuery]);

  function selectBubble(id: string) {
    if (a === id) return;
    if (!a || b) {
      setA(id);
      setB("");
    } else {
      setB(id);
    }
  }

  function reset() {
    setGpuId(gpus[0]?.id ?? "");
    setRam(64);
    setCtx(32);
    setA("");
    setB("");
  }

  const maxSize = Math.max(1, ...rows.map((row) => row.downloadGb));
  const maxTps = Math.max(1, ...rows.map((row) => row.estWriteTps));
  const maxRam = Math.max(1, ...rows.map((row) => row.ramFloorGb));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xOf = (gb: number) => PAD.left + (gb / maxSize) * plotW;
  const yOf = (tps: number) => PAD.top + plotH - (tps / maxTps) * plotH;
  const rOf = (gb: number) => 7 + (gb / maxRam) * 16;

  return (
    <ToolShell
      slug="quant-explorer"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("quant quality")}
      shareQuery={shareQuery}
      onReset={reset}
    >
      <div className="tool-controls" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <span>{t("gpu")}</span>
          <select value={gpu?.id ?? ""} onChange={(event) => setGpuId(event.target.value)}>
            {gpus.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
          <span>{t("ram")}: {ram} GB</span>
          <input
            type="range"
            min={RAM_MIN}
            max={RAM_MAX}
            step={8}
            value={ram}
            onChange={(event) => setRam(Number(event.target.value))}
          />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("context")}</span>
          <div role="group" aria-label={t("context")} style={{ display: "flex", gap: 4 }}>
            {CONTEXT_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={ctx === option}
                onClick={() => setCtx(option)}
                style={{ padding: "4px 10px", border: ctx === option ? "2px solid var(--accent, #2563eb)" : "1px solid var(--line, #ccc)" }}
              >
                {option}K
              </button>
            ))}
          </div>
        </div>
      </div>

      <p style={{ opacity: 0.8, fontSize: 12 }}>{t("selectHint")}</p>

      <div style={{ overflowX: "auto" }}>
        <SvgFrame
          viewBox={`0 0 ${W} ${H}`}
          ariaLabel={t("matrix")}
          title={t("matrix")}
          desc={t("matrixDesc")}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <g key={frac}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + plotH * frac}
                y2={PAD.top + plotH * frac}
                stroke="var(--line, #ddd)"
                strokeDasharray="3 4"
              />
              <text x={PAD.left - 8} y={PAD.top + plotH * frac + 4} textAnchor="end" fontSize={11}>
                {fmtDecimal(maxTps * (1 - frac), 0)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke="var(--line, #888)" />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--line, #888)" />
          <text x={PAD.left + plotW / 2} y={H - 16} textAnchor="middle" fontSize={12}>{t("colDownload")}</text>
          <text x={16} y={PAD.top + plotH / 2} textAnchor="middle" fontSize={12} transform={`rotate(-90 16 ${PAD.top + plotH / 2})`}>
            {fmtTps(0).replace(/[\d.\s]/g, "")}
          </text>

          {rows.map((row) => {
            const cx = xOf(row.downloadGb);
            const cy = yOf(row.estWriteTps);
            const r = rOf(row.ramFloorGb);
            const selected = row.id === a || row.id === b;
            return (
              <g
                key={row.id}
                role="button"
                tabIndex={0}
                aria-label={`${row.name}: ${fmtGb(row.downloadGb)}, ${fmtTps(row.estWriteTps)}, ${FIT_LABELS[row.fitStatus]}`}
                onClick={() => selectBubble(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectBubble(row.id);
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={FIT_COLORS[row.fitStatus]}
                  fillOpacity={selected ? 0.55 : 0.28}
                  stroke={selected ? "var(--accent, #2563eb)" : FIT_COLORS[row.fitStatus]}
                  strokeWidth={selected ? 3 : 1.5}
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={600}>
                  {row.id === a ? "A" : row.id === b ? "B" : row.qualityTier}
                </text>
              </g>
            );
          })}

          <g transform={`translate(${W - PAD.right + 16}, ${PAD.top - 24})`}>
            <text fontSize={13} fontWeight={700}>{t("qualityTitle")}</text>
            {QUALITY_LADDER.map((entry, index) => (
              <text key={entry.id} y={26 + index * 26} fontSize={11}>
                <tspan fontWeight={700}>{entry.tier}</tspan>
                <tspan dx={6}>{entry.description.trim()}</tspan>
              </text>
            ))}
            <text y={26 + QUALITY_LADDER.length * 26 + 16} fontSize={10} opacity={0.7}>
              (1 = leanest, 5 = richest; no benchmark scores)
            </text>
          </g>
        </SvgFrame>
      </div>

      <LegendPills
        items={(Object.keys(FIT_COLORS) as FitStatus[]).map((status) => ({
          label: FIT_LABELS[status],
          color: FIT_COLORS[status],
        }))}
      />

      <section className="tool-comparison" aria-label={t("comparison")} style={{ marginTop: 20 }}>
        <h2>{t("comparison")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <MetricStat label={t("speedDelta")} value={fmtDecimal(comparison.speedDeltaPct, 1) + "%"} tone={comparison.speedDeltaPct >= 0 ? "accent" : "warn"} />
          <MetricStat label={t("sizeDelta")} value={fmtGb(comparison.sizeDeltaGb, 1)} sub={`B − A`} />
          <MetricStat label={t("ramDelta")} value={fmtGb(comparison.ramDeltaGb, 1)} sub={`B − A`} />
        </div>
        <p>
          {t("recommend")}: <strong>{comparison.recommendedChoice ? comparison.recommendedChoice.toUpperCase() : t("none")}</strong>
          {comparison.recommendedChoice ? ` — ${comparison.a?.name ?? ""} vs ${comparison.b?.name ?? ""}` : ""}
        </p>
        <p style={{ opacity: 0.85 }}>{comparison.reason}</p>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>{t("details")}</h2>
        {rows.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {[t("colPack"), t("colDownload"), t("colRam"), t("colVram"), t("colSpeed"), t("colQuality"), t("colFit"), t("colContext")].map((head) => (
                    <th key={head} style={{ textAlign: "left", borderBottom: "1px solid var(--line, #ccc)", padding: "6px 8px" }}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: QuantEvaluation) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--line, #eee)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <button type="button" onClick={() => selectBubble(row.id)} style={{ padding: 0, border: 0, background: "none", cursor: "pointer", textDecoration: "underline" }}>
                        {row.name}
                      </button>
                      {row.id === a ? " [A]" : row.id === b ? " [B]" : ""}
                    </td>
                    <td>{fmtGb(row.downloadGb, 1)}</td>
                    <td>{fmtGb(row.ramFloorGb, 1)}</td>
                    <td>{fmtGb(row.vramFloorGb, 1)}</td>
                    <td>{row.estWriteTps > 0 ? fmtTps(row.estWriteTps) : t("none")}</td>
                    <td>{row.qualityTier}/5</td>
                    <td style={{ color: FIT_COLORS[row.fitStatus] }}>{FIT_LABELS[row.fitStatus]}</td>
                    <td>{fmtGb(row.contextCacheGb, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p style={{ display: "flex", gap: 16, marginTop: 20 }}>
        <Link href="/models">{t("modelsLink")}</Link>
        <Link href="/download">{t("downloadLink")}</Link>
      </p>
    </ToolShell>
  );
}
