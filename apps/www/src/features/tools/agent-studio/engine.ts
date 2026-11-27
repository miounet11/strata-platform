/**
 * Pure deterministic engine for the Agent Studio tool.
 *
 * Generates local-gateway connection configuration for six IDE / coding-agent
 * clients. Never handles real credentials: every emitted config uses the
 * STRATA_LOCAL_KEY placeholder. Only relative imports from the tools folder.
 */

import { clamp } from "../format.ts";
import type { UrlSchema, UrlValue } from "../url-state.ts";

export type ClientId =
  | "claude-code"
  | "cursor"
  | "windsurf"
  | "codex-cli"
  | "continue"
  | "openai-curl";

export type Protocol = "anthropic" | "openai";
export type ConfigFormat = "json" | "toml" | "yaml" | "shell";

export type AgentStudioInput = {
  client: ClientId;
  host: string;
  port: number;
  modelId: string;
  contextK: number;
  enableReasoning: boolean;
  enableMcp: boolean;
};

export type TopologyNode = {
  id: string;
  label: string;
  detail: string;
  status: "ok" | "warning";
};

export type AgentStudioResult = {
  input: AgentStudioInput;
  client: ClientId;
  clientLabel: string;
  protocol: Protocol;
  configFormat: ConfigFormat;
  targetPath: string;
  origin: string;
  baseUrl: string;
  configText: string;
  testCommand: string;
  keyPlaceholder: string;
  isLoopback: boolean;
  warning: string | null;
  warnings: string[];
  topology: TopologyNode[];
};

export type ClientMeta = {
  label: string;
  protocol: Protocol;
  configFormat: ConfigFormat;
  targetPath: string;
};

export const KEY_PLACEHOLDER = "STRATA_LOCAL_KEY";

export const CLIENTS: readonly ClientId[] = [
  "claude-code",
  "cursor",
  "windsurf",
  "codex-cli",
  "continue",
  "openai-curl",
];

export const CLIENT_META: Record<ClientId, ClientMeta> = {
  "claude-code": {
    label: "Claude Code",
    protocol: "anthropic",
    configFormat: "json",
    targetPath: "~/.claude/settings.json",
  },
  cursor: {
    label: "Cursor",
    protocol: "openai",
    configFormat: "json",
    targetPath: "~/.cursor/mcp.json",
  },
  windsurf: {
    label: "Windsurf",
    protocol: "openai",
    configFormat: "json",
    targetPath: "~/.codeium/windsurf/mcp_config.json",
  },
  "codex-cli": {
    label: "Codex CLI",
    protocol: "openai",
    configFormat: "toml",
    targetPath: "~/.codex/config.toml",
  },
  continue: {
    label: "Continue",
    protocol: "openai",
    configFormat: "yaml",
    targetPath: "~/.continue/config.yaml",
  },
  "openai-curl": {
    label: "OpenAI curl",
    protocol: "openai",
    configFormat: "shell",
    targetPath: "./strata-curl.sh",
  },
};

export const URL_SCHEMA: UrlSchema = {
  client: { kind: "enum", default: "claude-code", values: CLIENTS, alias: "client" },
  host: { kind: "string", default: "127.0.0.1", alias: "host" },
  port: { kind: "number", default: 8080, min: 1, max: 65535, alias: "port" },
  model: { kind: "string", default: "strata-local", alias: "model" },
  ctx: { kind: "number", default: 32, min: 4, max: 1024, alias: "ctx" },
  reasoning: { kind: "boolean", default: true, alias: "reasoning" },
  mcp: { kind: "boolean", default: true, alias: "mcp" },
};

export const DEFAULT_INPUT: AgentStudioInput = {
  client: "claude-code",
  host: "127.0.0.1",
  port: 8080,
  modelId: "strata-local",
  contextK: 32,
  enableReasoning: true,
  enableMcp: true,
};

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST_LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,127}$/;

function isValidHost(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const host = value.trim();
  if (!host || host.length > 253) return false;
  if (/\s|[@/?#\\]/.test(host) || host.includes("://")) return false;
  if (host === "::1" || host.startsWith("[")) {
    return /^\[?[0-9a-fA-F:.%]+\]?$/.test(host);
  }
  if (host.includes(":")) return false;
  if (IPV4.test(host)) return true;
  const labels = host.split(".");
  // Dotted quad that is not a valid IPv4 address must not pass as a hostname.
  if (labels.length === 4 && labels.every((label) => /^\d+$/.test(label))) return false;
  return labels.every((label) => HOST_LABEL.test(label));
}

function safeModelId(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_INPUT.modelId;
  const model = value.trim();
  return MODEL_ID.test(model) ? model : DEFAULT_INPUT.modelId;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function pickClient(value: unknown): ClientId {
  return typeof value === "string" && (CLIENTS as readonly string[]).includes(value)
    ? (value as ClientId)
    : DEFAULT_INPUT.client;
}

/** Strictly validate and coerce raw input into a safe, bounded value. */
export function normalizeInput(raw: Partial<AgentStudioInput> = {}): AgentStudioInput {
  return {
    client: pickClient(raw.client),
    host: isValidHost(raw.host) ? raw.host.trim() : DEFAULT_INPUT.host,
    port: clamp(Math.trunc(Number(raw.port)), 1, 65535, DEFAULT_INPUT.port),
    modelId: safeModelId(raw.modelId),
    contextK: clamp(Math.trunc(Number(raw.contextK)), 4, 1024, DEFAULT_INPUT.contextK),
    enableReasoning: asBoolean(raw.enableReasoning, DEFAULT_INPUT.enableReasoning),
    enableMcp: asBoolean(raw.enableMcp, DEFAULT_INPUT.enableMcp),
  };
}

/** Map URL-shaped params (from decodeQuery) onto engine input keys. */
export function inputFromParams(params: Record<string, unknown> = {}): AgentStudioInput {
  return normalizeInput({
    client: params.client as ClientId,
    host: params.host as string,
    port: Number(params.port),
    modelId: params.model as string,
    contextK: Number(params.ctx),
    enableReasoning: params.reasoning as boolean,
    enableMcp: params.mcp as boolean,
  });
}

/** Map engine input onto URL param keys (for encodeQuery). */
export function paramsFromInput(input: AgentStudioInput): Record<string, UrlValue> {
  return {
    client: input.client,
    host: input.host,
    port: input.port,
    model: input.modelId,
    ctx: input.contextK,
    reasoning: input.enableReasoning,
    mcp: input.enableMcp,
  };
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

type Ctx = AgentStudioInput & {
  meta: ClientMeta;
  protocol: Protocol;
  configFormat: ConfigFormat;
  origin: string;
  baseUrl: string;
  isLoopback: boolean;
};

function mcpServers(ctx: Ctx): Record<string, unknown> {
  if (!ctx.enableMcp) return {};
  return {
    strata: {
      command: "strata-mcp",
      args: ["--base-url", ctx.baseUrl, "--api-key", KEY_PLACEHOLDER],
    },
  };
}

function jsonConfig(ctx: Ctx): string {
  if (ctx.client === "claude-code") {
    return JSON.stringify(
      {
        env: {
          ANTHROPIC_BASE_URL: ctx.baseUrl,
          ANTHROPIC_API_KEY: KEY_PLACEHOLDER,
          ANTHROPIC_MODEL: ctx.modelId,
          STRATA_CONTEXT_K: String(ctx.contextK),
          STRATA_REASONING: ctx.enableReasoning ? "on" : "off",
        },
        mcpServers: mcpServers(ctx),
      },
      null,
      2,
    );
  }
  // Cursor and Windsurf both consume an mcp.json with OpenAI-compatible env hints.
  return JSON.stringify(
    {
      mcpServers: mcpServers(ctx),
      env: {
        OPENAI_API_BASE: ctx.baseUrl,
        OPENAI_API_KEY: KEY_PLACEHOLDER,
        OPENAI_MODEL: ctx.modelId,
        STRATA_CONTEXT_K: String(ctx.contextK),
        STRATA_REASONING: ctx.enableReasoning ? "on" : "off",
      },
    },
    null,
    2,
  );
}

function tomlConfig(ctx: Ctx): string {
  const lines = [
    "# Generated by Strata Agent Studio - do not edit by hand.",
    `model = ${tomlString(ctx.modelId)}`,
    `model_provider = "strata"`,
  ];
  if (ctx.enableReasoning) lines.push(`reasoning_effort = "medium"`);
  lines.push(
    "",
    "[model_providers.strata]",
    `name = "Strata Local"`,
    `base_url = ${tomlString(ctx.baseUrl)}`,
    `env_key = ${tomlString(KEY_PLACEHOLDER)}`,
    `wire_api = "chat"`,
    "",
    "[model_providers.strata.request_opts]",
    `max_context_tokens = ${ctx.contextK * 1024}`,
  );
  if (ctx.enableMcp) {
    lines.push("", "[mcp]", "enabled = true", `command = "strata-mcp"`);
  }
  return `${lines.join("\n")}\n`;
}

function yamlConfig(ctx: Ctx): string {
  const lines = [
    "# Generated by Strata Agent Studio - do not edit by hand.",
    "name: Strata Local",
    "version: 1.0.0",
    "schema: v1",
    "models:",
    "  - name: strata-local",
    "    provider: openai",
    `    model: ${yamlString(ctx.modelId)}`,
    `    apiBase: ${yamlString(ctx.baseUrl)}`,
    `    apiKey: ${yamlString(KEY_PLACEHOLDER)}`,
    `    contextLength: ${ctx.contextK * 1024}`,
  ];
  if (ctx.enableReasoning) lines.push("    reasoning: true");
  if (ctx.enableMcp) {
    lines.push(
      "mcpServers:",
      "  strata:",
      "    command: strata-mcp",
      `    args: [${yamlString("--base-url")}, ${yamlString(ctx.baseUrl)}, ${yamlString("--api-key")}, ${yamlString(KEY_PLACEHOLDER)}]`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function shellConfig(ctx: Ctx): string {
  const lines = [
    "#!/usr/bin/env bash",
    "# Generated by Strata Agent Studio - OpenAI-compatible curl example.",
    "set -euo pipefail",
    `export STRATA_BASE_URL=${shellQuote(ctx.baseUrl)}`,
    `export STRATA_API_KEY=${shellQuote(KEY_PLACEHOLDER)}`,
    `export STRATA_MODEL=${shellQuote(ctx.modelId)}`,
    `export STRATA_CONTEXT=${shellQuote(String(ctx.contextK * 1024))}`,
    `export STRATA_REASONING=${shellQuote(ctx.enableReasoning ? "on" : "off")}`,
    `export STRATA_MCP=${shellQuote(ctx.enableMcp ? "on" : "off")}`,
    "",
    'curl -fsS "$STRATA_BASE_URL/models" -H "Authorization: Bearer $STRATA_API_KEY"',
  ];
  return `${lines.join("\n")}\n`;
}

function configText(ctx: Ctx): string {
  switch (ctx.configFormat) {
    case "json":
      return jsonConfig(ctx);
    case "toml":
      return tomlConfig(ctx);
    case "yaml":
      return yamlConfig(ctx);
    case "shell":
    default:
      return shellConfig(ctx);
  }
}

function testCommand(ctx: Ctx): string {
  if (ctx.protocol === "anthropic") {
    const body = JSON.stringify({
      model: ctx.modelId,
      max_tokens: 16,
      messages: [{ role: "user", content: "ping" }],
    });
    return `curl -fsS ${shellQuote(`${ctx.baseUrl}/messages`)} -H ${shellQuote(`x-api-key: ${KEY_PLACEHOLDER}`)} -H ${shellQuote("anthropic-version: 2023-06-01")} -H ${shellQuote("content-type: application/json")} -d ${shellQuote(body)}`;
  }
  return `curl -fsS ${shellQuote(`${ctx.baseUrl}/models`)} -H ${shellQuote(`Authorization: Bearer ${KEY_PLACEHOLDER}`)}`;
}

function topology(ctx: Ctx, warning: string | null): TopologyNode[] {
  const nodes: TopologyNode[] = [
    {
      id: "client",
      label: ctx.meta.label,
      detail: ctx.client,
      status: "ok",
    },
    {
      id: "protocol",
      label: ctx.protocol === "anthropic" ? "Anthropic protocol" : "OpenAI protocol",
      detail: ctx.protocol === "anthropic" ? "/v1/messages" : "/v1/chat/completions",
      status: "ok",
    },
    {
      id: "gateway",
      label: "Strata Local Gateway",
      detail: ctx.baseUrl,
      status: warning ? "warning" : "ok",
    },
    {
      id: "model",
      label: "Model / Quant",
      detail: `${ctx.modelId} · ${ctx.contextK}K ctx`,
      status: "ok",
    },
  ];
  if (ctx.enableMcp) {
    nodes.push({ id: "mcp", label: "MCP Bridge", detail: "strata-mcp", status: "ok" });
  }
  return nodes;
}

/** Build the full configuration result for one client from raw input. */
export function evaluate(raw: Partial<AgentStudioInput> = {}): AgentStudioResult {
  const input = normalizeInput(raw);
  const meta = CLIENT_META[input.client];
  const origin = `http://${input.host}:${input.port}`;
  const baseUrl = `${origin}/v1`;
  const isLoopback = isLoopbackHost(input.host);
  const warning = isLoopback
    ? null
    : `Security risk: host "${input.host}" is not loopback. The local gateway and its ${KEY_PLACEHOLDER} placeholder would be reachable from other machines. Bind only to 127.0.0.1 or localhost for a local-only setup.`;
  const warnings = warning ? [warning] : [];
  const ctx: Ctx = {
    ...input,
    meta,
    protocol: meta.protocol,
    configFormat: meta.configFormat,
    origin,
    baseUrl,
    isLoopback,
  };

  return {
    input,
    client: input.client,
    clientLabel: meta.label,
    protocol: meta.protocol,
    configFormat: meta.configFormat,
    targetPath: meta.targetPath,
    origin,
    baseUrl,
    configText: configText(ctx),
    testCommand: testCommand(ctx),
    keyPlaceholder: KEY_PLACEHOLDER,
    isLoopback,
    warning,
    warnings,
    topology: topology(ctx, warning),
  };
}
