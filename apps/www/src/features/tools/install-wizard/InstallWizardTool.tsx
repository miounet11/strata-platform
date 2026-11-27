'use client';

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import type { ToolsBundle } from "@/features/tools/types";
import { decodeQuery, encodeQuery } from "@/features/tools/url-state";
import {
  DEFAULT_INPUT,
  ENGINES,
  GPU_STACKS,
  KV_CACHES,
  MIRRORS,
  OS_IDS,
  URL_SCHEMA,
  evaluate,
  normalizeInput,
  type EngineFamily,
  type GpuStack,
  type InstallWizardInput,
  type MirrorId,
  type OsId,
  type StageStatus,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "Install Wizard",
  subtitle: "Configure a cross-platform local runtime and generate ready-to-run install scripts.",
  form: "Install configuration",
  os: "Operating system",
  gpu: "GPU acceleration stack",
  mirror: "Download source / mirror",
  proxy: "Proxy URL (http(s))",
  engine: "Engine family",
  quant: "Quant pack",
  port: "Gateway port",
  kv: "KV-cache precision",
  parallel: "Parallel slots",
  pipeline: "Live install pipeline",
  pipelineDesc: "Four stages coloured by runtime validation status; summaries follow the selected configuration.",
  endpoint: "Local endpoint",
  backend: "Effective backend",
  stagesReady: "Stages ready",
  versions: "Release sync",
  statusOk: "Ready",
  statusWarning: "Check",
  statusBlocked: "Blocked",
  applySuggestion: "Apply suggestion",
  scriptInstall: "Install",
  scriptStart: "Start gateway",
  copyScript: "Copy script",
  copied: "Copied",
  downloadSh: "Download .sh",
  downloadPs1: "Download .ps1",
  warnings: "Configuration warnings",
  noWarnings: "No conflicts detected — this configuration is ready to install.",
  readyToInstall: "Pipeline ready — all four stages validated.",
  attention: "Attention required — review the warnings below before installing.",
  downloadLink: "Download release",
  agentStudioLink: "Open Agent Studio",
  runtime: "Runtime",
};

const OS_LABELS: Record<OsId, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const GPU_LABELS: Record<GpuStack, string> = {
  "nvidia-cuda13": "CUDA 13",
  "nvidia-cuda12": "CUDA 12",
  "amd-rocm": "ROCm",
  "apple-metal": "Metal",
  cpu: "CPU",
};

const MIRROR_LABELS: Record<MirrorId, string> = {
  official: "Official HF",
  "hf-mirror": "HF-Mirror",
  modelscope: "ModelScope",
  "custom-proxy": "Proxy",
};

const ENGINE_LABELS: Record<EngineFamily, string> = {
  "strata-engine": "Qwen3.8",
  "strata-hy4": "HY-4",
  "strata-inkling": "Inkling-2",
};

const STATUS_LABELS: Record<StageStatus, string> = {
  ok: "ok",
  warning: "warning",
  blocked: "blocked",
};

const STATUS_COLORS: Record<StageStatus, string> = {
  ok: "#2563eb",
  warning: "#b45309",
  blocked: "#dc2626",
};

const W = 920;
const CARD_W = 195;
const CARD_GAP = 28;
const CARD_X0 = 28;
const CARD_Y = 64;
const CARD_H = 124;

function wrap(text: string, max = 25, limit = 2): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      if (lines.length === limit) return lines;
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line && lines.length < limit) lines.push(line);
  return lines;
}

function pickState(search: string): InstallWizardInput {
  const state = decodeQuery(search, URL_SCHEMA);
  return normalizeInput({
    os: state.os as OsId,
    gpuStack: state.gpu as GpuStack,
    mirror: state.mirror as MirrorId,
    proxyUrl: state.proxy,
    engineFamily: state.engine as EngineFamily,
    quantId: state.quant,
    port: Number(state.port),
    kvCache: state.kv as (typeof DEFAULT_INPUT.kvCache),
    parallelSlots: Number(state.parallel),
  });
}

export function InstallWizardTool({ bundle, labels }: { bundle: ToolsBundle; labels?: Record<string, string> }) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;
  const [input, setInput] = useState<InstallWizardInput>(DEFAULT_INPUT);
  const [hydrated, setHydrated] = useState(false);
  const [scriptKind, setScriptKind] = useState<"install" | "start">("install");
  const [copiedScript, setCopiedScript] = useState(false);

  // Restore from the query string on the client only; never read SSR searchParams.
  useEffect(() => {
    setInput(pickState(window.location.search));
    setHydrated(true);
  }, []);

  const result = useMemo(() => evaluate(input, bundle.downloads), [input, bundle.downloads]);

  const shareQuery = useMemo(
    () => encodeQuery(
      {
        os: input.os,
        gpu: input.gpuStack,
        mirror: input.mirror,
        proxy: input.proxyUrl,
        engine: input.engineFamily,
        quant: input.quantId,
        port: input.port,
        kv: input.kvCache,
        parallel: input.parallelSlots,
      },
      URL_SCHEMA,
    ),
    [input],
  );

  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [shareQuery, hydrated]);

  const quantIds = useMemo(() => {
    const ids = bundle.variants.map((variant) => variant.id);
    return ids.includes(input.quantId) ? ids : [input.quantId, ...ids];
  }, [bundle.variants, input.quantId]);

  const activeScript = input.os === "windows"
    ? (scriptKind === "install" ? result.installPowerShell : result.startPowerShell)
    : (scriptKind === "install" ? result.installBash : result.startBash);

  function update<K extends keyof InstallWizardInput>(key: K, value: InstallWizardInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setInput(DEFAULT_INPUT);
    setScriptKind("install");
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(activeScript);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      setCopiedScript(false);
    }
  }

  function downloadScript(kind: "sh" | "ps1") {
    const content = kind === "sh"
      ? `${result.installBash}\n\n${result.startBash}\n`
      : `${result.installPowerShell}\n\n${result.startPowerShell}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = kind === "sh" ? "strata-install.sh" : "strata-install.ps1";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const readyCount = result.stages.filter((stage) => stage.status === "ok").length;
  const overallStatus: StageStatus = result.warnings.length > 0 ? "warning" : "ok";

  return (
    <ToolShell
      slug="install-wizard"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("runtime")}
      shareQuery={shareQuery}
      onReset={reset}
    >
      <section aria-label={t("form")}>
        <h2>{t("form")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("os")}</span>
            <select value={input.os} onChange={(event) => update("os", event.target.value as OsId)}>
              {OS_IDS.map((os) => <option key={os} value={os}>{OS_LABELS[os]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("gpu")}</span>
            <select value={input.gpuStack} onChange={(event) => update("gpuStack", event.target.value as GpuStack)}>
              {GPU_STACKS.map((gpu) => <option key={gpu} value={gpu}>{GPU_LABELS[gpu]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("mirror")}</span>
            <select value={input.mirror} onChange={(event) => update("mirror", event.target.value as MirrorId)}>
              {MIRRORS.map((mirror) => <option key={mirror} value={mirror}>{MIRROR_LABELS[mirror]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("engine")}</span>
            <select value={input.engineFamily} onChange={(event) => update("engineFamily", event.target.value as EngineFamily)}>
              {ENGINES.map((engine) => <option key={engine} value={engine}>{ENGINE_LABELS[engine]}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("quant")}</span>
            <select value={input.quantId} onChange={(event) => update("quantId", event.target.value)}>
              {quantIds.map((quant) => <option key={quant} value={quant}>{quant}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("port")}: {input.port}</span>
            <input
              type="number"
              min={1024}
              max={65535}
              step={1}
              value={input.port}
              onChange={(event) => update("port", Number(event.target.value))}
            />
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("kv")}</span>
            <select value={input.kvCache} onChange={(event) => update("kvCache", event.target.value as InstallWizardInput["kvCache"])}>
              {KV_CACHES.map((kv) => <option key={kv} value={kv}>{kv}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <span>{t("parallel")}: {input.parallelSlots}</span>
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={input.parallelSlots}
              onChange={(event) => update("parallelSlots", Number(event.target.value))}
            />
          </label>
          {input.mirror === "custom-proxy" ? (
            <label style={{ display: "grid", gap: 6, minWidth: 0, gridColumn: "1 / -1" }}>
              <span>{t("proxy")}</span>
              <input
                type="url"
                value={input.proxyUrl}
                placeholder="http://127.0.0.1:7890"
                onChange={(event) => update("proxyUrl", event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, margin: "20px 0" }}>
        <MetricStat label={t("endpoint")} value={result.endpoint} tone="accent" />
        <MetricStat label={t("backend")} value={result.effectiveGpuStack} sub={`${OS_LABELS[input.os]} · ${result.versions.engineTag}`} tone="neutral" />
        <MetricStat label={t("stagesReady")} value={`${readyCount}/4`} tone={readyCount === 4 ? "accent" : "warn"} />
        <MetricStat label={t("versions")} value={result.versions.desktopTag} sub={result.versions.engineTag} tone="neutral" />
      </div>

      <section aria-label={t("pipeline")}>
        <h2>{t("pipeline")}</h2>
        <div style={{ overflowX: "auto" }}>
          <SvgFrame
            viewBox={`0 0 ${W} 240`}
            ariaLabel={t("pipeline")}
            title={t("pipeline")}
            desc={t("pipelineDesc")}
          >
            {result.stages.map((stage, index) => {
              const x = CARD_X0 + index * (CARD_W + CARD_GAP);
              const nextX = x + CARD_W + CARD_GAP;
              return (
                <g key={stage.id}>
                  <title>{`${stage.label}: ${stage.summary} (${STATUS_LABELS[stage.status]})`}</title>
                  <rect
                    x={x}
                    y={CARD_Y}
                    width={CARD_W}
                    height={CARD_H}
                    rx={10}
                    fill={stage.color}
                    fillOpacity={0.08}
                    stroke={stage.color}
                    strokeWidth={2}
                  />
                  <circle cx={x + 26} cy={CARD_Y + 26} r={15} fill={stage.color} />
                  <text x={x + 26} y={CARD_Y + 31} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                    {index + 1}
                  </text>
                  <text x={x + 50} y={CARD_Y + 30} fontSize={13} fontWeight={600}>
                    {stage.label}
                  </text>
                  <text x={x + CARD_W - 12} y={CARD_Y + 30} textAnchor="end" fontSize={11} fill={stage.color}>
                    {STATUS_LABELS[stage.status]}
                  </text>
                  <line x1={x + 12} x2={x + CARD_W - 12} y1={CARD_Y + 44} y2={CARD_Y + 44} stroke={stage.color} strokeOpacity={0.4} />
                  {wrap(stage.summary).map((line, lineIndex) => (
                    <text
                      key={`${stage.id}-${lineIndex}`}
                      x={x + 14}
                      y={CARD_Y + 66 + lineIndex * 16}
                      fontSize={11}
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                    >
                      {line}
                    </text>
                  ))}
                  {index < result.stages.length - 1 ? (
                    <g>
                      <line
                        x1={x + CARD_W + 4}
                        x2={nextX - 12}
                        y1={CARD_Y + CARD_H / 2}
                        y2={CARD_Y + CARD_H / 2}
                        stroke="var(--line, #94a3b8)"
                        strokeWidth={2}
                      />
                      <polygon
                        points={`${nextX - 12},${CARD_Y + CARD_H / 2 - 5} ${nextX - 12},${CARD_Y + CARD_H / 2 + 5} ${nextX - 3},${CARD_Y + CARD_H / 2}`}
                        fill="var(--line, #94a3b8)"
                      />
                    </g>
                  ) : null}
                </g>
              );
            })}
            <rect
              x={CARD_X0}
              y={204}
              width={W - CARD_X0 * 2}
              height={28}
              rx={6}
              fill={STATUS_COLORS[overallStatus]}
              fillOpacity={0.12}
              stroke={STATUS_COLORS[overallStatus]}
              strokeOpacity={0.5}
            />
            <text x={CARD_X0 + 12} y={222} fontSize={12} fill={STATUS_COLORS[overallStatus]}>
              {result.warnings.length > 0 ? t("attention") : t("readyToInstall")}
            </text>
          </SvgFrame>
        </div>
        <LegendPills
          items={result.stages.map((stage) => ({
            label: stage.label,
            color: stage.color,
            value: STATUS_LABELS[stage.status],
          }))}
        />
      </section>

      {result.warnings.length > 0 || result.suggestion ? (
        <section aria-label={t("warnings")} style={{ marginTop: 20 }}>
          <h2>{t("warnings")}</h2>
          <ul style={{ paddingLeft: 20 }}>
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          {result.suggestion ? (
            <button type="button" onClick={() => update("gpuStack", result.suggestion as GpuStack)}>
              {t("applySuggestion")}: {result.suggestion}
            </button>
          ) : null}
        </section>
      ) : (
        <p style={{ opacity: 0.8 }}>{t("noWarnings")}</p>
      )}

      <section aria-label={t("scriptInstall")} style={{ marginTop: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" aria-pressed={scriptKind === "install"} onClick={() => setScriptKind("install")}>
            {t("scriptInstall")}
          </button>
          <button type="button" aria-pressed={scriptKind === "start"} onClick={() => setScriptKind("start")}>
            {t("scriptStart")}
          </button>
        </div>
        <pre
          style={{
            margin: "12px 0",
            padding: 12,
            background: "var(--muted-bg, #f1f5f9)",
            borderRadius: 6,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <code>{activeScript}</code>
        </pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={copyScript} aria-live="polite">
            {copiedScript ? t("copied") : t("copyScript")}
          </button>
          <button type="button" onClick={() => downloadScript("sh")}>{t("downloadSh")}</button>
          <button type="button" onClick={() => downloadScript("ps1")}>{t("downloadPs1")}</button>
        </div>
        <p style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
          <Link href="/download">{t("downloadLink")}</Link>
          <Link href="/tools/agent-studio">{t("agentStudioLink")}</Link>
        </p>
      </section>
    </ToolShell>
  );
}
