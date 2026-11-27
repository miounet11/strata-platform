/** Pure deterministic engine for the cross-platform install wizard. */

import type { ToolDownloadSummary } from "../types.ts";
import { clamp } from "../format.ts";
import type { UrlSchema } from "../url-state.ts";

export type OsId = "windows" | "macos" | "linux";
export type GpuStack = "nvidia-cuda13" | "nvidia-cuda12" | "amd-rocm" | "apple-metal" | "cpu";
export type MirrorId = "official" | "hf-mirror" | "modelscope" | "custom-proxy";
export type EngineFamily = "strata-engine" | "strata-hy4" | "strata-inkling";
export type KvCache = "q8_0" | "fp16" | "q4_0";

export type InstallWizardInput = {
  os: OsId;
  gpuStack: GpuStack;
  mirror: MirrorId;
  proxyUrl: string;
  engineFamily: EngineFamily;
  quantId: string;
  port: number;
  kvCache: KvCache;
  parallelSlots: number;
};

export type StageStatus = "ok" | "warning" | "blocked";
export type PipelineStage = {
  id: string;
  label: string;
  status: StageStatus;
  color: string;
  summary: string;
};

export type VersionSummary = {
  desktopTag: string;
  engineTag: string;
  syncedAt: string;
};

export type InstallWizardResult = {
  input: InstallWizardInput;
  effectiveGpuStack: GpuStack;
  warnings: string[];
  suggestion: string | null;
  envVars: Record<string, string>;
  envLines: string[];
  endpoint: string;
  installBash: string;
  installPowerShell: string;
  startBash: string;
  startPowerShell: string;
  stages: PipelineStage[];
  versions: VersionSummary;
};

export const OS_IDS: readonly OsId[] = ["windows", "macos", "linux"];
export const GPU_STACKS: readonly GpuStack[] = ["nvidia-cuda13", "nvidia-cuda12", "amd-rocm", "apple-metal", "cpu"];
export const MIRRORS: readonly MirrorId[] = ["official", "hf-mirror", "modelscope", "custom-proxy"];
export const ENGINES: readonly EngineFamily[] = ["strata-engine", "strata-hy4", "strata-inkling"];
export const KV_CACHES: readonly KvCache[] = ["q8_0", "fp16", "q4_0"];

export const URL_SCHEMA: UrlSchema = {
  os: { kind: "enum", default: "windows", values: OS_IDS, alias: "os" },
  gpu: { kind: "enum", default: "nvidia-cuda13", values: GPU_STACKS, alias: "gpu" },
  mirror: { kind: "enum", default: "official", values: MIRRORS, alias: "mirror" },
  proxy: { kind: "string", default: "", alias: "proxy" },
  engine: { kind: "enum", default: "strata-engine", values: ENGINES, alias: "engine" },
  quant: { kind: "string", default: "q4_k_m", alias: "quant" },
  port: { kind: "number", default: 8080, min: 1024, max: 65535, alias: "port" },
  kv: { kind: "enum", default: "q8_0", values: KV_CACHES, alias: "kv" },
  parallel: { kind: "number", default: 2, min: 1, max: 16, alias: "parallel" },
};

export const DEFAULT_INPUT: InstallWizardInput = {
  os: "windows",
  gpuStack: "nvidia-cuda13",
  mirror: "official",
  proxyUrl: "",
  engineFamily: "strata-engine",
  quantId: "q4_k_m",
  port: 8080,
  kvCache: "q8_0",
  parallelSlots: 2,
};

const SUPPORTED: Record<OsId, readonly GpuStack[]> = {
  windows: ["nvidia-cuda13", "nvidia-cuda12", "amd-rocm", "cpu"],
  macos: ["apple-metal", "cpu"],
  linux: ["nvidia-cuda13", "nvidia-cuda12", "amd-rocm", "cpu"],
};

const STATUS_COLORS: Record<StageStatus, string> = {
  ok: "#2563eb",
  warning: "#b45309",
  blocked: "#dc2626",
};

const RUNTIMES: Record<GpuStack, string> = {
  "nvidia-cuda13": "CUDA 13",
  "nvidia-cuda12": "CUDA 12",
  "amd-rocm": "ROCm 6",
  "apple-metal": "Metal 3",
  cpu: "CPU fallback",
};

function pick<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function normalizeInput(raw: Partial<InstallWizardInput> = {}): InstallWizardInput {
  const port = clamp(Math.trunc(Number(raw.port)), 1024, 65535, DEFAULT_INPUT.port);
  const slots = clamp(Math.trunc(Number(raw.parallelSlots)), 1, 16, DEFAULT_INPUT.parallelSlots);
  const quantId = typeof raw.quantId === "string" && /^[a-zA-Z0-9_.:-]+$/.test(raw.quantId) ? raw.quantId : DEFAULT_INPUT.quantId;
  const proxyUrl = typeof raw.proxyUrl === "string" ? raw.proxyUrl.trim().slice(0, 2048) : "";
  return {
    os: pick(raw.os, OS_IDS, DEFAULT_INPUT.os),
    gpuStack: pick(raw.gpuStack, GPU_STACKS, DEFAULT_INPUT.gpuStack),
    mirror: pick(raw.mirror, MIRRORS, DEFAULT_INPUT.mirror),
    proxyUrl: /^https?:\/\/[^\s]+$/i.test(proxyUrl) ? proxyUrl : "",
    engineFamily: pick(raw.engineFamily, ENGINES, DEFAULT_INPUT.engineFamily),
    quantId,
    port,
    kvCache: pick(raw.kvCache, KV_CACHES, DEFAULT_INPUT.kvCache),
    parallelSlots: slots,
  };
}

export function versionSummary(downloads?: ToolDownloadSummary): VersionSummary {
  return {
    desktopTag: downloads?.desktopTag ?? "v0.2.22",
    engineTag: downloads?.engineTag ?? "v0.2.22",
    syncedAt: downloads?.syncedAt ?? "2026-11-26T00:55:07.143Z",
  };
}

function envFor(input: InstallWizardInput): Record<string, string> {
  const endpoints: Record<MirrorId, string> = {
    official: "https://huggingface.co",
    "hf-mirror": "https://hf-mirror.com",
    modelscope: "https://www.modelscope.cn",
    "custom-proxy": "https://huggingface.co",
  };
  const sources: Record<MirrorId, string> = {
    official: "huggingface",
    "hf-mirror": "hf-mirror",
    modelscope: "modelscope",
    "custom-proxy": "proxy",
  };
  const env: Record<string, string> = {
    HF_ENDPOINT: endpoints[input.mirror],
    STRATA_SOURCE: sources[input.mirror],
  };
  if (input.mirror === "custom-proxy" && input.proxyUrl) env.HTTPS_PROXY = input.proxyUrl;
  return env;
}

function scripts(input: InstallWizardInput, env: Record<string, string>) {
  const envBash = Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`).join("\n");
  const envPs = Object.entries(env).map(([key, value]) => `$env:${key} = ${psQuote(value)}`).join("\n");
  const installer = "https://www.stratat.com/install.sh";
  const installerPs = "https://www.stratat.com/install.ps1";
  const flags = `--engine ${shellQuote(input.engineFamily)} --quant ${shellQuote(input.quantId)} --kv ${input.kvCache} --parallel ${input.parallelSlots} --port ${input.port}`;
  const flagsPs = `--engine ${psQuote(input.engineFamily)} --quant ${psQuote(input.quantId)} --kv ${input.kvCache} --parallel ${input.parallelSlots} --port ${input.port}`;
  return {
    installBash: `#!/usr/bin/env bash\nset -euo pipefail\n${envBash}\ncurl -fsSL ${installer} | bash\nstrata-engine setup --runtime ${shellQuote(RUNTIMES[input.gpuStack])}`,
    installPowerShell: `# Install Strata (Windows PowerShell)\n$ErrorActionPreference = "Stop"\n${envPs}\nInvoke-WebRequest -Uri ${psQuote(installerPs)} -UseBasicParsing | Invoke-Expression\nstrata-engine setup --runtime ${psQuote(RUNTIMES[input.gpuStack])}`,
    startBash: `#!/usr/bin/env bash\nset -euo pipefail\n${envBash}\nstrata-engine serve ${flags}`,
    startPowerShell: `# Start local Strata gateway\n$ErrorActionPreference = "Stop"\n${envPs}\nstrata-engine serve ${flagsPs}`,
  };
}

export function evaluate(input: InstallWizardInput, downloads?: ToolDownloadSummary): InstallWizardResult {
  const normalized = normalizeInput(input);
  const warnings: string[] = [];
  let suggestion: string | null = null;
  let effectiveGpuStack = normalized.gpuStack;
  if (!(SUPPORTED[normalized.os] as readonly string[]).includes(normalized.gpuStack)) {
    const candidates = SUPPORTED[normalized.os];
    const preferred = normalized.os === "macos" ? "apple-metal" : candidates[0];
    effectiveGpuStack = preferred;
    suggestion = preferred;
    warnings.push(
      `${normalized.os} does not support ${normalized.gpuStack}; use ${preferred} instead. Valid backends: ${candidates.join(", ")}.`,
    );
  }
  if (normalized.mirror === "custom-proxy" && !normalized.proxyUrl) {
    warnings.push("Custom proxy selected without a valid http(s) proxy URL; HTTPS_PROXY was omitted.");
  }
  const env = envFor(normalized);
  const endpoint = `http://127.0.0.1:${normalized.port}/v1`;
  const s = scripts({ ...normalized, gpuStack: effectiveGpuStack }, env);
  const networkStatus: StageStatus = warnings.some((w) => w.startsWith("Custom proxy")) ? "warning" : "ok";
  const stages: PipelineStage[] = [
    {
      id: "platform",
      label: "OS & driver check",
      status: suggestion ? "warning" : "ok",
      color: STATUS_COLORS[suggestion ? "warning" : "ok"],
      summary: `${normalized.os} · ${RUNTIMES[effectiveGpuStack]}`,
    },
    {
      id: "runtime",
      label: "Backend & runtime",
      status: suggestion ? "warning" : "ok",
      color: STATUS_COLORS[suggestion ? "warning" : "ok"],
      summary: `${RUNTIMES[effectiveGpuStack]} · ${normalized.engineFamily} · ${normalized.quantId}`,
    },
    {
      id: "network",
      label: "Mirror & proxy",
      status: networkStatus,
      color: STATUS_COLORS[networkStatus],
      summary: `${normalized.mirror}${env.HTTPS_PROXY ? " · HTTPS_PROXY" : ""}`,
    },
    {
      id: "gateway",
      label: "Local gateway",
      status: "ok",
      color: STATUS_COLORS.ok,
      summary: endpoint,
    },
  ];
  return {
    input: normalized,
    effectiveGpuStack,
    warnings,
    suggestion,
    envVars: env,
    envLines: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    endpoint,
    ...s,
    stages,
    versions: versionSummary(downloads),
  };
}
