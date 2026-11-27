"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import { fmtGb, fmtPct, fmtWatts } from "../format";
import type { ToolsBundle } from "../types";
import {
  MAX_SLOTS,
  QUANT_IDS,
  decodePlannerUrl,
  emptySlot,
  encodePlannerUrl,
  isCardAvailable,
  planMultiGpu,
  sanitizeSlugs,
  slotsFromUrl,
  type PlannerInput,
  type PlannerRole,
  type PlannerSlot,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "Multi-GPU Planner",
  subtitle: "Plan PCIe lanes, VRAM layer splits and PSU headroom across up to four GPUs.",
  badge: "PCIe lanes",
  slot: "GPU slot",
  empty: "Empty slot",
  add: "+ Add GPU",
  remove: "Remove",
  presets: "Mixed presets",
  presetDual: "Dual mixed GPUs",
  presetMixed: "Big + small card",
  presetQuad: "Four-card workstation",
  ram: "System RAM",
  quant: "Quant",
  combinedVram: "Pooled VRAM",
  layerSplit: "Layer split",
  layerSplitArg: "CLI arg",
  recommendedPsu: "Recommended PSU",
  activeCards: "Active cards",
  slots: "slots",
  topology: "Motherboard PCIe topology",
  psu: "PSU power headroom",
  vram: "VRAM",
  layerShare: "Layer share",
  headroom: "headroom",
  estimateDetail: "Planning estimate only, not a measured guarantee.",
  roleMain: "Main",
  roleHelper: "Helper",
  roleOff: "Off",
  cli: "--layer-split CLI",
  copyCli: "Copy CLI",
  copied: "Copied",
  cliHint: "Paste this argument into your strata run command. Auto is used for a single active card.",
  buildsLink: "Browse compatible builds",
  wizardLink: "Install wizard",
};

const ROLE_COLORS: Record<PlannerRole, string> = {
  main: "#2563eb",
  helper: "#16a34a",
  off: "#94a3b8",
};

const ROLE_KEYS: Record<PlannerRole, string> = {
  main: "roleMain",
  helper: "roleHelper",
  off: "roleOff",
};

const W = 720;
const SLOT_W = 152;
const GAP = 14;

type Props = { bundle: ToolsBundle; labels?: Record<string, string> };

export function MultiGpuPlannerTool({ bundle, labels }: Props) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;

  const [initial] = useState(() => {
    if (typeof window === "undefined") {
      return { slots: [emptySlot(0)], systemRamGb: 64, quantId: "iq2_xs" };
    }
    const state = decodePlannerUrl(window.location.search);
    return {
      slots: slotsFromUrl(state, bundle),
      systemRamGb: state.systemRamGb,
      quantId: state.quantId,
    };
  });
  const [slots, setSlots] = useState<PlannerSlot[]>(initial.slots);
  const [systemRamGb, setSystemRamGb] = useState(initial.systemRamGb);
  const [quantId, setQuantId] = useState(initial.quantId);
  const [copied, setCopied] = useState(false);

  const input = useMemo<PlannerInput>(
    () => ({ slots, systemRamGb, quantId }),
    [slots, systemRamGb, quantId],
  );
  const result = useMemo(() => planMultiGpu(input), [input]);
  const shareQuery = useMemo(() => encodePlannerUrl(input), [input]);

  const presets = useMemo(() => {
    const pool = sanitizeSlugs(
      bundle.gpus
        .filter((gpu) => isCardAvailable(gpu))
        .sort((a, b) => b.writingTps - a.writingTps)
        .map((gpu) => gpu.slug),
    );
    const list: Array<{ key: string; labelKey: string; slugs: string[] }> = [];
    if (pool.length >= 2) list.push({ key: "dual", labelKey: "presetDual", slugs: pool.slice(0, 2) });
    const small = bundle.gpus.find((gpu) => isCardAvailable(gpu) && gpu.vramGb <= 8);
    if (small && pool[0] && small.slug !== pool[0]) {
      list.push({ key: "big-small", labelKey: "presetMixed", slugs: [pool[0], small.slug] });
    }
    if (pool.length >= 4) list.push({ key: "quad", labelKey: "presetQuad", slugs: pool.slice(0, 4) });
    return list;
  }, [bundle.gpus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [shareQuery]);

  function setSlotGpu(index: number, slug: string) {
    setSlots((prev) =>
      prev.map((slot, i) =>
        i === index ? { id: slot.id, gpu: bundle.gpus.find((gpu) => gpu.slug === slug) ?? null } : slot,
      ),
    );
  }

  function addSlot() {
    setSlots((prev) => (prev.length >= MAX_SLOTS ? prev : [...prev, emptySlot(prev.length)]));
  }

  function removeSlot(index: number) {
    setSlots((prev) =>
      prev.length <= 1
        ? prev
        : prev.filter((_, i) => i !== index).map((slot, i) => ({ ...slot, id: `slot-${i + 1}` })),
    );
  }

  function applyPreset(presetSlugs: string[]) {
    const next = presetSlugs.slice(0, MAX_SLOTS).map((slug, i) => ({
      id: `slot-${i + 1}`,
      gpu: bundle.gpus.find((gpu) => gpu.slug === slug) ?? null,
    }));
    setSlots(next.length > 0 ? next : [emptySlot(0)]);
  }

  async function copyCli() {
    try {
      await navigator.clipboard.writeText(result.cliCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    setSlots([emptySlot(0)]);
    setSystemRamGb(64);
    setQuantId("iq2_xs");
  }

  const boardW = slots.length * SLOT_W + (slots.length - 1) * GAP;
  const startX = (W - boardW) / 2;
  const psuUsed = result.recommendedPsuWatts > 0
    ? Math.min(1, result.totalTdpWatts / result.recommendedPsuWatts)
    : 0;

  return (
    <ToolShell
      slug="multi-gpu-planner"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("badge")}
      shareQuery={shareQuery}
      onReset={reset}
      ctaLabel={t("buildsLink")}
    >
      <div className="tool-controls" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}>
        {slots.map((slot, index) => (
          <label key={slot.id} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 210 }}>
            <span>{t("slot")} {index + 1}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <select
                value={slot.gpu?.slug ?? ""}
                onChange={(event) => setSlotGpu(index, event.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">{t("empty")}</option>
                {bundle.gpus.map((gpu) => (
                  <option key={gpu.slug} value={gpu.slug}>{gpu.name} · {fmtGb(gpu.vramGb)}</option>
                ))}
              </select>
              <button type="button" onClick={() => removeSlot(index)} disabled={slots.length <= 1}>
                {t("remove")}
              </button>
            </span>
          </label>
        ))}
        <button type="button" onClick={addSlot} disabled={slots.length >= MAX_SLOTS}>{t("add")}</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{t("presets")}:</span>
        {presets.map((preset) => (
          <button type="button" key={preset.key} onClick={() => applyPreset(preset.slugs)}>
            {t(preset.labelKey)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12, alignItems: "end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("ram")}: {systemRamGb} GB</span>
          <input
            type="range"
            min={0}
            max={2048}
            step={8}
            value={systemRamGb}
            onChange={(event) => setSystemRamGb(Number(event.target.value))}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("quant")}</span>
          <select value={quantId} onChange={(event) => setQuantId(event.target.value)}>
            {QUANT_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 16 }}>
        <MetricStat label={t("combinedVram")} value={fmtGb(result.combinedVramGb)} sub={result.pcieTopology} tone="accent" />
        <MetricStat label={t("layerSplit")} value={result.layerSplit} sub={`${t("layerSplitArg")}: ${result.layerSplitArg || "auto"}`} />
        <MetricStat label={t("recommendedPsu")} value={fmtWatts(result.recommendedPsuWatts)} sub={`${fmtWatts(result.totalTdpWatts)} · ${result.headroomFactor}x`} tone="warn" />
        <MetricStat label={t("activeCards")} value={String(result.cards.filter((card) => card.role !== "off").length)} sub={`${slots.length} ${t("slots")}`} />
      </div>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <SvgFrame
          viewBox={`0 0 ${W} 380`}
          ariaLabel={t("topology")}
          title={t("topology")}
          desc={`${t("psu")}: ${fmtWatts(result.totalTdpWatts)} / ${fmtWatts(result.recommendedPsuWatts)}. ${result.estimateNote}`}
        >
          <text x={40} y={30} fontSize={13} fontWeight={700}>{t("topology")} · {result.pcieTopology}</text>
          <rect x={startX} y={46} width={boardW} height={184} rx={8} fill="var(--muted, #f1f5f9)" fillOpacity={0.25} stroke="var(--line, #ccc)" />
          {result.cards.map((card, index) => {
            const x = startX + index * (SLOT_W + GAP);
            const color = ROLE_COLORS[card.role];
            const name = card.gpu?.name ?? t("empty");
            const short = name.length > 17 ? `${name.slice(0, 16)}…` : name;
            return (
              <g key={card.slotId}>
                <rect x={x} y={62} width={SLOT_W} height={152} rx={6} fill="var(--surface, #fff)" stroke={color} strokeWidth={card.role === "main" ? 3 : 1.5} />
                <text x={x + 10} y={82} fontSize={10} opacity={0.7}>PCIe {index + 1}</text>
                <text x={x + 10} y={102} fontSize={12} fontWeight={700}>{short}</text>
                <text x={x + 10} y={120} fontSize={10} opacity={0.75}>{fmtGb(card.vramGb)} {t("vram")}</text>
                <rect x={x + 10} y={130} width={56} height={18} rx={9} fill={color} fillOpacity={0.18} />
                <text x={x + 38} y={143} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
                  {card.laneWidth > 0 ? `x${card.laneWidth}` : "Off"}
                </text>
                <text x={x + 76} y={143} fontSize={10} fontWeight={700} fill={color}>{t(ROLE_KEYS[card.role])}</text>
                <text x={x + 10} y={170} fontSize={9} opacity={0.7}>{t("layerShare")} {fmtPct(card.layerSharePct)}</text>
                <rect x={x + 10} y={178} width={SLOT_W - 20} height={8} rx={4} fill="var(--line, #e2e8f0)" />
                <rect x={x + 10} y={178} width={(SLOT_W - 20) * card.layerSharePct / 100} height={8} rx={4} fill={color} />
              </g>
            );
          })}
          <text x={40} y={266} fontSize={13} fontWeight={700}>{t("psu")}</text>
          <rect x={40} y={280} width={W - 80} height={22} rx={11} fill="var(--line, #e2e8f0)" />
          <rect x={40} y={280} width={(W - 80) * psuUsed} height={22} rx={11} fill="#d97706" />
          <text x={40} y={322} fontSize={11}>{fmtWatts(result.totalTdpWatts)} / {fmtWatts(result.recommendedPsuWatts)} · {result.headroomFactor}x {t("headroom")}</text>
          <text x={40} y={352} fontSize={11} fill="var(--warn, #b45309)">※ {result.estimateNote} — {t("estimateDetail")}</text>
        </SvgFrame>
      </div>

      <LegendPills
        items={(Object.keys(ROLE_COLORS) as PlannerRole[]).map((role) => ({
          label: t(ROLE_KEYS[role]),
          color: ROLE_COLORS[role],
          value: role === "main" ? "1" : role === "helper" ? String(result.helpers.length) : String(result.offCards.length),
        }))}
      />

      <section style={{ marginTop: 18 }}>
        <h2>{t("cli")}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <code style={{ padding: "8px 12px", borderRadius: 6, background: "var(--muted, #f1f5f9)" }}>{result.cliCommand}</code>
          <button type="button" onClick={copyCli} aria-live="polite">{copied ? t("copied") : t("copyCli")}</button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.8 }}>{t("cliHint")}</p>
      </section>

      {result.warnings.length > 0 ? (
        <ul style={{ fontSize: 12, opacity: 0.85, marginTop: 12 }}>
          {result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
        </ul>
      ) : null}

      <p style={{ display: "flex", gap: 16, marginTop: 20 }}>
        <Link href="/builds">{t("buildsLink")}</Link>
        <Link href="/tools/install-wizard">{t("wizardLink")}</Link>
      </p>
    </ToolShell>
  );
}
