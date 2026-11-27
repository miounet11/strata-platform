"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import type { ToolsBundle } from "../types";
import {
  CLIENTS,
  CLIENT_META,
  URL_SCHEMA,
  evaluate,
  inputFromParams,
  paramsFromInput,
} from "./engine";

/** Graphical configuration studio for six local IDE / coding-agent clients. */
export function AgentStudioTool({
  bundle,
  labels,
}: {
  bundle: ToolsBundle;
  labels?: Record<string, string>;
}) {
  const t = (key: string, fallback: string) => labels?.[key] ?? fallback;
  const [input, setInput] = useState(() => inputFromParams({}));
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const parsed = inputFromParams(Object.fromEntries(new URLSearchParams(window.location.search)));
    setInput(parsed);
    setHydrated(true);
  }, []);

  const result = useMemo(() => evaluate(input), [input]);
  const query = useMemo(() => {
    const params = paramsFromInput(result.input);
    const parts = Object.entries(URL_SCHEMA).flatMap(([key, spec]) => {
      const alias = spec.alias ?? key;
      const value = params[key];
      const fallback = spec.default;
      if (value == null || value === fallback) return [];
      return [`${encodeURIComponent(alias)}=${encodeURIComponent(String(value))}`];
    });
    return parts.length ? `?${parts.join("&")}` : "";
  }, [result.input]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const next = `${window.location.pathname}${query}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [query]);

  const update = useCallback(<K extends keyof typeof input>(key: K, value: (typeof input)[K]) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setInput(inputFromParams({})), []);

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(result.configText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function downloadConfig() {
    const blob = new Blob([result.configText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.targetPath.split("/").pop() || "strata-config.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const nodes = result.topology;
  const safe = result.isLoopback;
  const accent = safe ? "#2563eb" : "#dc2626";
  const nodeX = [70, 250, 430, 610, 790];
  const nodeW = 140;

  return (
    <ToolShell
      slug="agent-studio"
      title={t("title", "Agent Studio")}
      subtitle={t("subtitle", "Connect any IDE or coding agent to your local Strata gateway.")}
      badge={bundle.downloads.engineTag}
      shareQuery={query}
      onReset={reset}
      ctaLabel={t("cta", "Download Strata")}
      relatedLabels={labels}
    >
      <div className="studio-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div className="studio-config">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>
              {t("clientLabel", "Client")}
            </legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              {CLIENTS.map((client) => (
                <button
                  key={client}
                  type="button"
                  aria-pressed={input.client === client}
                  onClick={() => update("client", client)}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 8,
                    border: `2px solid ${input.client === client ? accent : "#d1d5db"}`,
                    background: input.client === client ? "#eff6ff" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {CLIENT_META[client].label}
                </button>
              ))}
            </div>
          </fieldset>

          <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>{t("hostLabel", "Endpoint host")}</span>
              <input
                type="text"
                value={input.host}
                onChange={(event) => update("host", event.target.value)}
                spellCheck={false}
                aria-invalid={!result.isLoopback}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>{t("portLabel", "Port")}</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={input.port}
                onChange={(event) => update("port", Number(event.target.value))}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>{t("modelLabel", "Model ID")}</span>
              <input
                type="text"
                value={input.modelId}
                onChange={(event) => update("modelId", event.target.value)}
                spellCheck={false}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>{t("contextLabel", "Context (K tokens)")}</span>
              <input
                type="number"
                min={4}
                max={1024}
                value={input.contextK}
                onChange={(event) => update("contextK", Number(event.target.value))}
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={input.enableReasoning}
                onChange={(event) => update("enableReasoning", event.target.checked)}
              />
              <span>{t("reasoningLabel", "Enable reasoning")}</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={input.enableMcp}
                onChange={(event) => update("enableMcp", event.target.checked)}
              />
              <span>{t("mcpLabel", "Enable MCP bridge")}</span>
            </label>
          </div>

          {result.warning ? (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: 12,
                border: "2px solid #dc2626",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#991b1b",
              }}
            >
              <strong>{t("securityTitle", "Security warning")}</strong>
              <p style={{ margin: "6px 0 0" }}>{result.warning}</p>
            </div>
          ) : null}

          <div style={{ marginTop: 16, fontSize: 14 }}>
            <p style={{ margin: "4px 0" }}>
              <strong>{t("protocolLabel", "Protocol")}:</strong> {result.protocol}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>{t("pathLabel", "Target file")}:</strong> <code>{result.targetPath}</code>
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>{t("endpointLabel", "Base URL")}:</strong> <code>{result.baseUrl}</code>
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>{t("testLabel", "Test command")}:</strong>{" "}
              <code style={{ wordBreak: "break-all" }}>{result.testCommand}</code>
            </p>
          </div>
        </div>

        <div className="studio-topology">
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
            {t("topologyTitle", "Live connection topology")}
          </h2>
          <SvgFrame
            viewBox="0 0 960 220"
            ariaLabel={t("topologyAria", "Client to Strata local gateway topology")}
            title={t("topologyTitle", "Live connection topology")}
            desc={t("topologyDesc", "Client app connects through the selected protocol to the Strata gateway, model and MCP bridge.")}
          >
            <defs>
              <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <path d="M0,0 L0,6 L9,3 z" fill={accent} />
              </marker>
            </defs>
            <g stroke={accent} strokeWidth={2} markerEnd="url(#arrow)">
              {nodeX.slice(0, -1).map((x, i) => (
                <line key={i} x1={x + nodeW} y1={100} x2={nodeX[i + 1] - 6} y2={100} />
              ))}
            </g>
            {nodes.map((node, i) => (
              <g key={node.id} transform={`translate(${nodeX[i]}, 60)`}>
                <rect
                  width={nodeW}
                  height={80}
                  rx={10}
                  fill={node.status === "warning" ? "#fef2f2" : "#eff6ff"}
                  stroke={node.status === "warning" ? "#dc2626" : "#93c5fd"}
                  strokeWidth={2}
                />
                <text x={nodeW / 2} y={32} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111827">
                  {node.label}
                </text>
                <text x={nodeW / 2} y={54} textAnchor="middle" fontSize={11} fill="#4b5563">
                  {node.detail.length > 22 ? `${node.detail.slice(0, 21)}…` : node.detail}
                </text>
                {node.status === "warning" ? (
                  <text x={nodeW / 2} y={72} textAnchor="middle" fontSize={10} fill="#dc2626">
                    insecure
                  </text>
                ) : null}
              </g>
            ))}
          </SvgFrame>

          <div style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
              {t("previewTitle", "Configuration preview")} · {result.targetPath}
            </h2>
            <pre
              style={{
                margin: 0,
                padding: 12,
                background: "#0f172a",
                color: "#e2e8f0",
                borderRadius: 8,
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {result.configText}
            </pre>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" onClick={copyConfig} aria-live="polite">
                {copied ? t("copied", "Copied") : t("copyLabel", "Copy configuration")}
              </button>
              <button type="button" onClick={downloadConfig}>
                {t("downloadLabel", "Download file")}
              </button>
              <Link href="/tools/install-wizard">{t("installLabel", "Install wizard")}</Link>
              <Link href="/download">{t("downloadsLabel", "Downloads")}</Link>
            </div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
