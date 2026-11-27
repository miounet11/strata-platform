"use client";

import { useEffect, useMemo, useState } from "react";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import type { ToolsBundle } from "@/features/tools/types";
import { fmtGb, fmtTps } from "@/features/tools/format";
import {
  decodeVramUrl,
  encodeVramUrl,
  ENGINE_SPECS,
  KV_PRECISION_LABELS,
  QUANT_SPECS,
  simulateVram,
  type ContextWindowK,
  type EngineFamily,
  type KvPrecision,
  type VramSimInput,
} from "./engine";

const CONTEXTS: readonly ContextWindowK[] = [8, 32, 64, 128];
const PRECISIONS: readonly KvPrecision[] = ["q8_0", "fp16", "q4_0"];

const DEFAULT_LABELS: Record<string, string> = {
  title: "VRAM Visualizer",
  subtitle: "Simulate how weights, KV-cache and offload fill four memory tiers.",
  gpu: "GPU preset",
  vram: "VRAM",
  ram: "System RAM",
  unified: "Unified memory",
  quant: "Quant pack",
  context: "Context",
  kv: "KV precision",
  engine: "Engine family",
  weights: "Weights",
  kvCache: "KV-Cache",
  headroom: "Headroom",
  offload: "Offload",
  gpuTier: "GPU VRAM",
  ramTier: "System RAM",
  ssdTier: "SSD PLE",
  copy: "Copy command",
  copied: "Copied",
  troubleshoot: "Troubleshoot CUDA OOM",
  canIRun: "Can I run it?",
  warningLine: "90% warning",
};

type Segment = { key: string; label: string; gb: number; color: string };

const COLORS = {
  weights: "#2563eb",
  kv: "#7c3aed",
  ramOffload: "#0891b2",
  headroom: "#94a3b8",
  ssd: "#b45309",
};

export function VramVisualizerTool({
  bundle,
  labels,
}: {
  bundle: ToolsBundle;
  labels?: Record<string, string>;
}) {
  const text = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [input, setInput] = useState<VramSimInput>({
    gpuSlug: "auto",
    vramGb: 24,
    ramGb: 64,
    unifiedMemory: false,
    quantId: "iq2_xs",
    contextK: 32,
    kvPrecision: "q8_0",
    engineFamily: "strata-engine",
  });
  const [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore query state on the client only; never read SSR searchParams.
  useEffect(() => {
    const state = decodeVramUrl(window.location.search);
    const gpu = bundle.gpus.find((item) => item.slug === state.gpu);
    setInput({
      gpuSlug: gpu?.slug ?? "auto",
      vramGb: gpu && !state.gpu.startsWith("custom") ? gpu.vramGb : state.vram,
      ramGb: state.ram,
      unifiedMemory: state.unified || gpu?.isUnifiedOrMobile === true,
      quantId: state.quant,
      contextK: Number(state.context) as ContextWindowK,
      kvPrecision: state.kv as KvPrecision,
      engineFamily: state.engine as EngineFamily,
    });
    setHydrated(true);
  }, [bundle]);

  useEffect(() => {
    if (!hydrated) return;
    const query = encodeVramUrl(input);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = `${window.location.pathname}${query}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [input, hydrated]);

  const result = useMemo(() => simulateVram(input), [input]);
  const ramKvGb = Math.max(0, result.ramCapacityGb - result.ramOffloadGb - result.ramHeadroomGb);

  const columns = useMemo(() => {
    const vram: Segment[] = [
      { key: "vram-weights", label: text("weights"), gb: result.vramWeightsGb, color: COLORS.weights },
      { key: "vram-kv", label: text("kvCache"), gb: result.vramKvGb, color: COLORS.kv },
      { key: "vram-head", label: text("headroom"), gb: result.vramHeadroomGb, color: COLORS.headroom },
    ];
    const ram: Segment[] = [
      { key: "ram-offload", label: text("offload"), gb: result.ramOffloadGb, color: COLORS.ramOffload },
      { key: "ram-kv", label: text("kvCache"), gb: ramKvGb, color: COLORS.kv },
      { key: "ram-head", label: text("headroom"), gb: result.ramHeadroomGb, color: COLORS.headroom },
    ];
    const ssd: Segment[] = [
      { key: "ssd-offload", label: text("offload"), gb: result.ssdOffloadGb, color: COLORS.ssd },
    ];
    return [{ title: text("gpuTier"), x: 70, capacity: result.vramCapacityGb, segments: vram },
      { title: text("ramTier"), x: 350, capacity: result.ramCapacityGb, segments: ram },
      { title: text("ssdTier"), x: 630, capacity: Math.max(result.ssdOffloadGb, 1), segments: ssd }];
  }, [result, ramKvGb, labels]);

  const maxCapacity = Math.max(
    1,
    ...columns.map((column) => column.capacity),
    ...columns.flatMap((column) => column.segments.reduce((sum, segment) => sum + segment.gb, 0)),
  );
  const baseY = 290;
  const barHeight = 220;
  const barWidth = 150;
  const scale = barHeight / maxCapacity;

  function selectGpu(slug: string) {
    const gpu = bundle.gpus.find((item) => item.slug === slug);
    setInput((current) => ({
      ...current,
      gpuSlug: slug,
      vramGb: gpu?.vramGb ?? current.vramGb,
      unifiedMemory: gpu?.isUnifiedOrMobile ?? current.unifiedMemory,
    }));
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(result.cliCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const controlStyle = { display: "grid", gap: 6, minWidth: 0 } as const;
  const sliderStyle = { width: "100%" } as const;

  return (
    <ToolShell
      slug="vram-visualizer"
      title={text("title")}
      subtitle={text("subtitle")}
      badge={result.overflowTier.replace("-", " ")}
      shareQuery={encodeVramUrl(input)}
      onReset={() => setInput({
        gpuSlug: "auto", vramGb: 24, ramGb: 64, unifiedMemory: false,
        quantId: "iq2_xs", contextK: 32, kvPrecision: "q8_0", engineFamily: "strata-engine",
      })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <label style={controlStyle}>
          <span>{text("gpu")}</span>
          <select value={input.gpuSlug} onChange={(event) => selectGpu(event.target.value)}>
            <option value="auto">Auto / custom</option>
            {bundle.gpus.slice(0, 60).map((gpu) => (
              <option key={gpu.slug} value={gpu.slug}>{gpu.name} · {gpu.vramGb} GB</option>
            ))}
          </select>
        </label>
        <label style={controlStyle}>
          <span>{text("vram")}: {fmtGb(input.vramGb)}</span>
          <input style={sliderStyle} type="range" min={0} max={256} step={1} value={input.vramGb}
            onChange={(event) => setInput({ ...input, vramGb: Number(event.target.value) })} />
        </label>
        <label style={controlStyle}>
          <span>{text("ram")}: {fmtGb(input.ramGb)}</span>
          <input style={sliderStyle} type="range" min={0} max={512} step={4} value={input.ramGb}
            onChange={(event) => setInput({ ...input, ramGb: Number(event.target.value) })} />
        </label>
        <label style={{ ...controlStyle, alignSelf: "end" }}>
          <span>{text("unified")}</span>
          <input type="checkbox" checked={input.unifiedMemory}
            onChange={(event) => setInput({ ...input, unifiedMemory: event.target.checked })} />
        </label>
        <label style={controlStyle}>
          <span>{text("quant")}</span>
          <select value={input.quantId} onChange={(event) => setInput({ ...input, quantId: event.target.value })}>
            {QUANT_SPECS.map((spec) => <option key={spec.id} value={spec.id}>{spec.label}</option>)}
          </select>
        </label>
        <div style={controlStyle}>
          <span>{text("context")}</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {CONTEXTS.map((value) => (
              <button type="button" key={value} aria-pressed={input.contextK === value}
                onClick={() => setInput({ ...input, contextK: value })}>{value}K</button>
            ))}
          </div>
        </div>
        <label style={controlStyle}>
          <span>{text("kv")}</span>
          <select value={input.kvPrecision} onChange={(event) => setInput({ ...input, kvPrecision: event.target.value as KvPrecision })}>
            {PRECISIONS.map((value) => <option key={value} value={value}>{KV_PRECISION_LABELS[value]}</option>)}
          </select>
        </label>
        <label style={controlStyle}>
          <span>{text("engine")}</span>
          <select value={input.engineFamily} onChange={(event) => setInput({ ...input, engineFamily: event.target.value as EngineFamily })}>
            {ENGINE_SPECS.map((spec) => <option key={spec.id} value={spec.id}>{spec.label}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 16 }}>
        <MetricStat label={text("weights")} value={fmtGb(result.vramWeightsGb, 1)} sub={`VRAM ${fmtGb(result.vramCapacityGb, 1)}`} tone="accent" />
        <MetricStat label={text("kvCache")} value={fmtGb(result.vramKvGb, 1)} sub={`${input.contextK}K · ${KV_PRECISION_LABELS[input.kvPrecision]}`} tone="accent" />
        <MetricStat label={text("offload")} value={fmtGb(result.ramOffloadGb + ramKvGb, 1)} sub={text("ramTier")} tone="warn" />
        <MetricStat label={text("ssdTier")} value={fmtGb(result.ssdOffloadGb, 1)} sub={result.overflowTier} tone={result.ssdOffloadGb > 0 ? "danger" : "neutral"} />
        <MetricStat label="Throughput" value={fmtTps(result.estWriteTps)} sub="estimated" tone="neutral" />
      </div>

      <SvgFrame viewBox="0 0 900 340" ariaLabel="Four-tier memory allocation water levels" title="Memory allocation">
        {columns.map((column) => {
          let cursor = baseY;
          const total = column.segments.reduce((sum, segment) => sum + segment.gb, 0);
          return (
            <g key={column.title}>
              <text x={column.x + barWidth / 2} y={24} textAnchor="middle" fontSize={14} fontWeight={600}>
                {column.title}
              </text>
              <text x={column.x + barWidth / 2} y={42} textAnchor="middle" fontSize={11} opacity={0.7}>
                {fmtGb(column.capacity, 1)}
              </text>
              <rect x={column.x} y={baseY - barHeight} width={barWidth} height={barHeight}
                fill="none" stroke="var(--line, #94a3b8)" strokeDasharray="3 3" />
              {column.segments.map((segment) => {
                const height = Math.max(0, segment.gb * scale);
                cursor -= height;
                const active = selected === segment.key;
                return (
                  <g key={segment.key}>
                    <rect x={column.x} y={cursor} width={barWidth} height={height}
                      fill={segment.color} opacity={active ? 1 : 0.82}
                      stroke={active ? "#0f172a" : "none"} strokeWidth={active ? 3 : 0}
                      tabIndex={0} role="button" aria-label={`${segment.label} ${fmtGb(segment.gb, 1)}`}
                      onClick={() => setSelected(active ? null : segment.key)}
                      onMouseEnter={() => setSelected(segment.key)}
                      onFocus={() => setSelected(segment.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(active ? null : segment.key);
                        }
                      }}
                      style={{ cursor: "pointer" }}>
                      <title>{`${segment.label}: ${fmtGb(segment.gb, 1)}`}</title>
                    </rect>
                    {height > 18 ? (
                      <text x={column.x + barWidth / 2} y={cursor + height / 2 + 4}
                        textAnchor="middle" fontSize={12} fill="#fff" style={{ pointerEvents: "none" }}>
                        {segment.gb.toFixed(1)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={column.x + barWidth / 2} y={baseY + 18} textAnchor="middle" fontSize={11} opacity={0.75}>
                {fmtGb(total, 1)} used
              </text>
            </g>
          );
        })}
        <line x1={70} y1={baseY - barHeight * 0.9} x2={900 - 20} y2={baseY - barHeight * 0.9}
          stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={880} y={baseY - barHeight * 0.9 - 6} textAnchor="end" fontSize={11} fill="#dc2626">
          {text("warningLine")}
        </text>
        {selected ? (
          <text x={450} y={330} textAnchor="middle" fontSize={12}>
            {selected}: {fmtGb(
              [...columns.flatMap((column) => column.segments)].find((segment) => segment.key === selected)?.gb ?? 0,
              1,
            )}
          </text>
        ) : null}
      </SvgFrame>

      <LegendPills items={[
        { label: text("weights"), color: COLORS.weights, value: fmtGb(result.vramWeightsGb, 1) },
        { label: text("kvCache"), color: COLORS.kv, value: fmtGb(result.vramKvGb + ramKvGb, 1) },
        { label: text("offload"), color: COLORS.ramOffload, value: fmtGb(result.ramOffloadGb, 1) },
        { label: text("ssdTier"), color: COLORS.ssd, value: fmtGb(result.ssdOffloadGb, 1) },
        { label: text("headroom"), color: COLORS.headroom, value: fmtGb(result.vramHeadroomGb, 1) },
      ]} />

      {result.warnings.length ? (
        <ul style={{ margin: "16px 0", paddingLeft: 20 }}>
          {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
        <code style={{ padding: 8, background: "var(--muted-bg, #f1f5f9)", borderRadius: 6, flex: "1 1 360px", overflowX: "auto" }}>
          {result.cliCommand}
        </code>
        <button type="button" onClick={copyCommand} aria-live="polite">{copied ? text("copied") : text("copy")}</button>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <a href="/tools/troubleshooter?symptom=cuda-oom">{text("troubleshoot")}</a>
        <a href="/can-i-run">{text("canIRun")}</a>
      </div>
    </ToolShell>
  );
}
