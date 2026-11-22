"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  evaluateHardware,
  type ContextWindowK,
  type ModelVariantSpec,
} from "@/lib/can-i-run";
import { gpuPath, rigPath } from "@/lib/routes";

export type HardwarePreset = {
  id: string;
  name: string;
  vendor: string;
  vramGb: number;
  ramGb: number;
  unifiedMemory: boolean;
  bandwidthGbs?: number;
  measuredReadTps?: number;
  measuredWriteTps?: number;
  powerWatts?: number;
  rigPriceUsd?: number | null;
  rigId?: string;
  gpuSlug?: string;
};

export type CalculatorLabels = {
  presetLabel: string;
  customOption: string;
  vramLabel: string;
  ramLabel: string;
  unifiedLabel: string;
  contextLabel: string;
  hoursLabel: string;
  electricityLabel: string;
  verdictCanRun: string;
  verdictCannotRun: string;
  bestQuantLabel: string;
  kvOverheadLabel: string;
  speedLabel: string;
  costLabel: string;
  paybackLabel: string;
  daysUnit: string;
  evidenceMeasured: string;
  evidenceEstimated: string;
  bottleneckVram: string;
  bottleneckRam: string;
  bottleneckUnified: string;
  colQuant: string;
  colStatus: string;
  colVramNeed: string;
  colRamNeed: string;
  colDownload: string;
  colSpeed: string;
  statusRecommended: string;
  statusFits: string;
  statusTight: string;
  statusNeedsRam: string;
  statusNeedsVram: string;
  seeRig: string;
  seeGpu: string;
  installCta: string;
  downloadCta: string;
};

export function CanIRunCalculator({
  presets,
  variants,
  labels,
}: {
  presets: HardwarePreset[];
  variants: ModelVariantSpec[];
  labels: CalculatorLabels;
}) {
  const defaultPreset = presets[0];
  const [presetId, setPresetId] = useState<string>(defaultPreset?.id ?? "custom");
  const [vramGb, setVramGb] = useState<number>(defaultPreset?.vramGb ?? 24);
  const [ramGb, setRamGb] = useState<number>(defaultPreset?.ramGb ?? 64);
  const [unifiedMemory, setUnifiedMemory] = useState<boolean>(defaultPreset?.unifiedMemory ?? false);
  const [contextK, setContextK] = useState<ContextWindowK>(32);
  const [dailyHours, setDailyHours] = useState<number>(8);
  const [electricityPerKwh, setElectricityPerKwh] = useState<number>(0.15);

  const selectedPreset = useMemo(
    () => (presetId === "custom" ? null : presets.find((p) => p.id === presetId) ?? null),
    [presetId, presets],
  );

  function selectPreset(id: string) {
    setPresetId(id);
    const p = presets.find((entry) => entry.id === id);
    if (!p) return;
    setVramGb(p.vramGb);
    setRamGb(p.ramGb);
    setUnifiedMemory(p.unifiedMemory);
  }

  const verdict = useMemo(
    () =>
      evaluateHardware(
        {
          vramGb,
          ramGb,
          unifiedMemory,
          contextK,
          bandwidthGbs: selectedPreset?.bandwidthGbs ?? (unifiedMemory ? 400 : vramGb >= 24 ? 950 : 500),
          measuredReadTps: selectedPreset?.measuredReadTps,
          measuredWriteTps: selectedPreset?.measuredWriteTps,
          powerWatts: selectedPreset?.powerWatts ?? (unifiedMemory ? 140 : 450),
          rigPriceUsd: selectedPreset?.rigPriceUsd ?? null,
          dailyHours,
          electricityPerKwh,
        },
        variants,
      ),
    [vramGb, ramGb, unifiedMemory, contextK, selectedPreset, dailyHours, electricityPerKwh, variants],
  );

  const statusText = (s: string) => {
    switch (s) {
      case "recommended":
        return labels.statusRecommended;
      case "fits":
        return labels.statusFits;
      case "tight":
        return labels.statusTight;
      case "needs-ram":
        return labels.statusNeedsRam;
      default:
        return labels.statusNeedsVram;
    }
  };

  return (
    <div className="calc-shell">
      <div className="bench-controls calc-controls">
        <label style={{ gridColumn: "1 / -1" }}>
          <span>{labels.presetLabel}</span>
          <select value={presetId} onChange={(e) => selectPreset(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.vramGb} GB{p.unifiedMemory ? " unified" : ` VRAM + ${p.ramGb} GB RAM`})
              </option>
            ))}
            <option value="custom">{labels.customOption}</option>
          </select>
        </label>

        <label>
          <span>
            {labels.vramLabel}: <strong>{vramGb} GB</strong>
          </span>
          <input
            type="number"
            min={4}
            max={512}
            step={4}
            value={vramGb}
            onChange={(e) => {
              setPresetId("custom");
              setVramGb(Math.max(0, Number(e.target.value) || 0));
            }}
          />
        </label>

        <label>
          <span>
            {labels.ramLabel}: <strong>{unifiedMemory ? `${vramGb} GB` : `${ramGb} GB`}</strong>
          </span>
          <input
            type="number"
            min={8}
            max={512}
            step={8}
            disabled={unifiedMemory}
            value={unifiedMemory ? vramGb : ramGb}
            onChange={(e) => {
              setPresetId("custom");
              setRamGb(Math.max(0, Number(e.target.value) || 0));
            }}
          />
        </label>

        <label>
          <span>{labels.contextLabel}</span>
          <select
            value={contextK}
            onChange={(e) => setContextK(Number(e.target.value) as ContextWindowK)}
          >
            <option value={8}>8K</option>
            <option value={32}>32K</option>
            <option value={64}>64K</option>
            <option value={128}>128K</option>
          </select>
        </label>

        <label>
          <span>
            {labels.hoursLabel}: <strong>{dailyHours} h/day</strong>
          </span>
          <input
            type="range"
            min={1}
            max={24}
            value={dailyHours}
            onChange={(e) => setDailyHours(Number(e.target.value))}
          />
        </label>

        <label>
          <span>{labels.electricityLabel}</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={electricityPerKwh}
            onChange={(e) => setElectricityPerKwh(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        <label className="calc-checkbox">
          <input
            type="checkbox"
            checked={unifiedMemory}
            onChange={(e) => {
              setPresetId("custom");
              setUnifiedMemory(e.target.checked);
            }}
          />
          <span>{labels.unifiedLabel}</span>
        </label>
      </div>

      <section
        className={`gpu-verdict ${
          verdict.runnable ? "gpu-verdict-verified" : "gpu-verdict-not-supported"
        }`}
      >
        <p className="gpu-verdict-main">
          {verdict.runnable ? labels.verdictCanRun : labels.verdictCannotRun}
        </p>
        {verdict.bestVariant ? (
          <div className="stat-row" style={{ marginTop: "0.75rem" }}>
            <div>
              <div className="meta">{labels.bestQuantLabel}</div>
              <strong>{verdict.bestVariant.variant.name}</strong>
            </div>
            <div>
              <div className="meta">{labels.speedLabel}</div>
              <strong>
                {verdict.bestVariant.estimatedWriteTps != null
                  ? `${verdict.bestVariant.estimatedWriteTps} tok/s`
                  : "—"}
              </strong>{" "}
              <span className="meta">
                (
                {verdict.bestVariant.evidence === "measured"
                  ? labels.evidenceMeasured
                  : labels.evidenceEstimated}
                )
              </span>
            </div>
            <div>
              <div className="meta">{labels.kvOverheadLabel}</div>
              <strong>~{verdict.kvCacheGb} GB ({contextK}K)</strong>
            </div>
            {verdict.bestVariant.localCostPerMM != null ? (
              <div>
                <div className="meta">{labels.costLabel}</div>
                <strong>${verdict.bestVariant.localCostPerMM.toFixed(3)}/M</strong>
              </div>
            ) : null}
            {verdict.bestVariant.breakEvenDays != null ? (
              <div>
                <div className="meta">{labels.paybackLabel}</div>
                <strong>
                  {verdict.bestVariant.breakEvenDays} {labels.daysUnit}
                </strong>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="meta" style={{ margin: "0.35rem 0 0" }}>
            {verdict.bottleneck === "vram"
              ? labels.bottleneckVram
              : verdict.bottleneck === "unified-memory"
                ? labels.bottleneckUnified
                : labels.bottleneckRam}
          </p>
        )}

        <div className="row" style={{ marginTop: "1rem" }}>
          <Link href="/download" className="btn btn-primary">
            {labels.downloadCta}
          </Link>
          <Link href="/install" className="btn">
            {labels.installCta}
          </Link>
          {selectedPreset?.rigId ? (
            <Link href={rigPath(selectedPreset.rigId)} className="btn btn-quiet">
              {labels.seeRig} →
            </Link>
          ) : null}
          {selectedPreset?.gpuSlug ? (
            <Link href={gpuPath(selectedPreset.gpuSlug)} className="btn btn-quiet">
              {labels.seeGpu} →
            </Link>
          ) : null}
        </div>
      </section>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{labels.colQuant}</th>
              <th>{labels.colStatus}</th>
              <th className="num">{labels.colVramNeed}</th>
              <th className="num">{labels.colRamNeed}</th>
              <th className="num">{labels.colDownload}</th>
              <th className="num">{labels.colSpeed}</th>
            </tr>
          </thead>
          <tbody>
            {verdict.variants.map((row) => (
              <tr
                key={row.variant.id}
                className={row.status === "recommended" ? "is-selected" : undefined}
              >
                <td>
                  <strong>{row.variant.name}</strong>
                  <div className="meta">{row.variant.description}</div>
                </td>
                <td>
                  <span className={`badge calc-badge-${row.status}`}>{statusText(row.status)}</span>
                </td>
                <td className="num">{row.requiredVramGb} GB</td>
                <td className="num">{row.requiredRamGb} GB</td>
                <td className="num">~{row.variant.downloadGb} GB</td>
                <td className="num">
                  {row.estimatedWriteTps != null ? `~${row.estimatedWriteTps} tok/s` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
