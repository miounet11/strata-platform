import { gpuVariants, type Gpu, type QuantVariant } from "@/lib/gpus";
import {
  gpuHardwareProfile,
  type CoolingTier,
  type QuantFitStatus,
} from "@/lib/gpu-profiles";

export type GpuConfigPanelLabels = {
  configHeading: string;
  configIntro: string;
  psuLabel: string;
  connectorLabel: string;
  hostRamLabel: string;
  pcieLabel: string;
  slotCoolingLabel: string;
  multiGpuLabel: string;
  efficiencyLabel: string;
  annualPowerLabel: string;
  quantHeading: string;
  quantColModel: string;
  quantColFit: string;
  quantColSplit: string;
  quantColSpeed: string;
  quantColContext: string;
  fitFullVram: string;
  fitHybrid: string;
  fitTooSmall: string;
  yes: string;
  no: string;
  unifiedSystem: string;
  coolingLabels: Record<CoolingTier, string>;
  ramUnit: string;
  wattsUnit: string;
  perYear4h: string;
  tpsPer100WUnit: string;
};

function fitText(fit: QuantFitStatus, labels: GpuConfigPanelLabels): string {
  if (fit === "full-vram") return labels.fitFullVram;
  if (fit === "hybrid-offload") return labels.fitHybrid;
  return labels.fitTooSmall;
}

function fitClass(fit: QuantFitStatus): string {
  if (fit === "full-vram") return "badge-ok";
  if (fit === "hybrid-offload") return "badge-warn";
  return "badge-muted";
}

function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function GpuConfigPanel({
  gpu,
  labels,
  variants = gpuVariants,
}: {
  gpu: Gpu;
  labels: GpuConfigPanelLabels;
  variants?: readonly QuantVariant[];
}) {
  const profile = gpuHardwareProfile(gpu, variants);
  const legacy = gpu.support === "not-supported";
  const psu =
    profile.recommendedPsuWatts == null
      ? labels.unifiedSystem
      : `${profile.recommendedPsuWatts} ${labels.wattsUnit}`;
  const ram =
    profile.minHostRamGb < profile.recommendedHostRamGb
      ? `${profile.minHostRamGb}–${profile.recommendedHostRamGb} ${labels.ramUnit}`
      : `${profile.recommendedHostRamGb} ${labels.ramUnit}`;
  const efficiency =
    profile.tpsPer100W == null ? "—" : `${num(profile.tpsPer100W)} ${labels.tpsPer100WUnit}`;

  return (
    <section className="gpu-config-panel" data-gpu={gpu.slug}>
      <h2>{labels.configHeading}</h2>
      <p>{labels.configIntro}</p>
      {legacy ? (
        <dl className="gpu-config-grid">
          <dt>{labels.pcieLabel}</dt>
          <dd>{profile.pcieInterface}</dd>
          <dt>TDP</dt>
          <dd>
            {num(profile.tdpWatts)} {labels.wattsUnit}
          </dd>
          <dt>{labels.connectorLabel}</dt>
          <dd>{profile.powerConnector}</dd>
          <dt>{labels.slotCoolingLabel}</dt>
          <dd>{profile.slotWidth}</dd>
        </dl>
      ) : (
        <dl className="gpu-config-grid">
          <dt>{labels.psuLabel}</dt>
          <dd>{psu}</dd>
          <dt>{labels.connectorLabel}</dt>
          <dd>{profile.powerConnector}</dd>
          <dt>{labels.hostRamLabel}</dt>
          <dd>{ram}</dd>
          <dt>{labels.pcieLabel}</dt>
          <dd>{profile.pcieInterface}</dd>
          <dt>{labels.slotCoolingLabel}</dt>
          <dd>
            {profile.slotWidth} · {labels.coolingLabels[profile.coolingTier]}
          </dd>
          <dt>{labels.multiGpuLabel}</dt>
          <dd>{profile.multiGpuViable ? labels.yes : labels.no}</dd>
          <dt>{labels.efficiencyLabel}</dt>
          <dd>{efficiency}</dd>
          <dt>{labels.annualPowerLabel}</dt>
          <dd>
            {num(profile.annualPower4hUsd)} {labels.perYear4h}
          </dd>
        </dl>
      )}
      {legacy ? null : (
        <>
          <h3>{labels.quantHeading}</h3>
          <table className="gpu-quant-table">
            <thead>
              <tr>
                <th>{labels.quantColModel}</th>
                <th>{labels.quantColFit}</th>
                <th>{labels.quantColSplit}</th>
                <th>{labels.quantColSpeed}</th>
                <th>{labels.quantColContext}</th>
              </tr>
            </thead>
            <tbody>
              {profile.quantMatrix.map((row) => (
                <tr key={row.id} data-best={row.id === profile.bestQuantId ? "1" : undefined}>
                  <td>{row.name}</td>
                  <td>
                    <span className={fitClass(row.fit)}>{fitText(row.fit, labels)}</span>
                  </td>
                  <td>
                    {row.fit === "too-small"
                      ? "—"
                      : row.fit === "full-vram"
                        ? `${num(row.vramUsedGb)} ${labels.ramUnit}`
                        : `${num(row.vramUsedGb)}+${num(row.ramOffloadGb)} ${labels.ramUnit}`}
                  </td>
                  <td>
                    {row.fit === "too-small" ? "—" : `${num(row.estWriteTps)}/${num(row.estReadTps)}`}
                  </td>
                  <td>{row.maxContextK > 0 ? `${row.maxContextK}K` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
