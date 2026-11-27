'use client';

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ToolShell } from "@/components/tools/ToolShell";
import { SvgFrame } from "@/components/tools/svg/SvgFrame";
import { LegendPills } from "@/components/tools/svg/LegendPills";
import { MetricStat } from "@/components/tools/svg/MetricStat";
import type { ToolsBundle } from "@/features/tools/types";
import {
  SYMPTOM_IDS,
  SYMPTOM_META,
  TROUBLESHOOT_GUIDE_HREF,
  advance,
  createSession,
  currentNode,
  emptySession,
  getTreeLayout,
  parseUrlState,
  reset,
  sessionShareQuery,
  stepBack,
  type LeafDiagnosis,
  type SymptomId,
} from "./engine";

const DEFAULT_LABELS: Record<string, string> = {
  title: "Troubleshooter",
  subtitle: "Follow a guided decision tree to find the root cause and a ready-to-run fix.",
  badge: "guided diagnosis",
  start: "Choose a symptom",
  startHint: "Pick the closest symptom to begin. You can change it at any time.",
  tree: "Diagnostic decision tree",
  treeDesc:
    "Visited nodes and edges are highlighted; the current question and the diagnosed leaf use distinct colours. Click a visited node to jump back.",
  step: "Step",
  currentIssue: "Current question",
  options: "Select the answer that matches your system",
  back: "Previous step",
  resetPath: "Reset path",
  path: "Visited path",
  noPath: "No diagnosis started yet.",
  result: "Root cause identified",
  rootCause: "Root cause",
  fixCommand: "Recommended fix",
  copyCommand: "Copy command",
  copied: "Copied",
  guide: "Read the troubleshooting guide",
  allGuides: "All troubleshooting guides",
  relatedTools: "Related tools",
  waiting: "Select a symptom above to start the guided diagnosis.",
  symptom: "Symptom",
  stepsTaken: "Steps taken",
  possibleFixes: "Possible fixes",
  status: "Status",
  statusIdle: "Not started",
  statusRunning: "Diagnosing",
  statusDone: "Fixed",
  legendVisited: "Visited",
  legendCurrent: "Current question",
  legendLeaf: "Root-cause fix",
  legendIdle: "Not reached",
  locale: "Locale",
};

const COLOR = {
  accent: "var(--accent, #2563eb)",
  accentFill: "#eff6ff",
  current: "#b45309",
  currentFill: "#fef3c7",
  leaf: "#15803d",
  leafFill: "#dcfce7",
  idle: "var(--line, #94a3b8)",
  idleFill: "var(--muted-bg, #f8fafc)",
};

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function TroubleshooterTool({ bundle, labels }: { bundle: ToolsBundle; labels?: Record<string, string> }) {
  const t = (key: string) => labels?.[key] ?? DEFAULT_LABELS[key] ?? key;

  // Deterministic SSR/CSR first paint: no browser globals during render.
  const [session, setSession] = useState(emptySession);
  const [hydrated, setHydrated] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSession(parseUrlState(window.location.search).session);
    setHydrated(true);
  }, []);

  const shareQuery = useMemo(() => sessionShareQuery(session), [session]);

  useEffect(() => {
    if (!hydrated) return;
    const next = `${window.location.pathname}${shareQuery}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [shareQuery, hydrated]);

  const layout = useMemo(() => getTreeLayout(session.symptom), [session.symptom]);
  const node = currentNode(session);
  const question = node?.kind === "question" ? node : null;
  const leaf: LeafDiagnosis | null = node?.kind === "leaf" ? node : null;
  const currentId = session.history[session.history.length - 1] ?? null;
  const pathEdges = useMemo(() => {
    const keys = new Set<string>();
    for (let i = 1; i < session.history.length; i += 1) {
      keys.add(`${session.history[i - 1]}>${session.history[i]}`);
    }
    return keys;
  }, [session.history]);
  const leafCount = layout.nodes.filter((item) => item.kind === "leaf").length;

  function selectSymptom(id: SymptomId) {
    setSession(createSession(id));
    setCopied(false);
  }

  function choose(choice: string) {
    setSession((current) => advance(current, choice));
    setCopied(false);
  }

  function goBack() {
    setSession((current) => stepBack(current));
    setCopied(false);
  }

  function resetPath() {
    setSession((current) => reset(current));
    setCopied(false);
  }

  function jumpTo(index: number) {
    setSession((current) => ({ symptom: current.symptom, history: current.history.slice(0, index + 1) }));
    setCopied(false);
  }

  async function copyFix() {
    if (!leaf) return;
    try {
      await navigator.clipboard.writeText(leaf.fixCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const statusText = leaf ? t("statusDone") : session.symptom ? t("statusRunning") : t("statusIdle");
  const statusTone = leaf ? "accent" : session.symptom ? "warn" : "neutral";

  return (
    <ToolShell
      slug="troubleshooter"
      title={t("title")}
      subtitle={t("subtitle")}
      badge={t("badge")}
      shareQuery={shareQuery}
      onReset={resetPath}
    >
      <div data-locale={bundle.locale}>
        <section aria-label={t("start")}>
          <h2>{t("start")}</h2>
          <p style={{ opacity: 0.8, marginTop: 0 }}>{t("startHint")}</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
            }}
          >
            {SYMPTOM_IDS.map((id) => {
              const active = session.symptom === id;
              const meta = SYMPTOM_META[id];
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectSymptom(id)}
                  style={{
                    textAlign: "left",
                    display: "grid",
                    gap: 4,
                    padding: 12,
                    borderRadius: 8,
                    border: `2px solid ${active ? COLOR.accent : "var(--line, #cbd5e1)"}`,
                    background: active ? COLOR.accentFill : "transparent",
                  }}
                >
                  <strong>{meta.title}</strong>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>{meta.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 16,
            margin: "20px 0",
          }}
        >
          <MetricStat
            label={t("symptom")}
            value={session.symptom ? SYMPTOM_META[session.symptom].title : "—"}
            tone={session.symptom ? "accent" : "neutral"}
          />
          <MetricStat label={t("stepsTaken")} value={String(Math.max(0, session.history.length - 1))} tone="neutral" />
          <MetricStat label={t("possibleFixes")} value={String(leafCount)} tone="neutral" />
          <MetricStat label={t("status")} value={statusText} tone={statusTone} />
        </div>

        <section aria-label={t("tree")}>
          <h2>{t("tree")}</h2>
          <div style={{ overflowX: "auto" }}>
            <SvgFrame
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              ariaLabel={t("tree")}
              title={t("tree")}
              desc={t("treeDesc")}
            >
              {layout.edges.map((edge) => {
                const onPath = pathEdges.has(`${edge.from}>${edge.to}`);
                const mid = (edge.x1 + edge.x2) / 2;
                const d = `M ${edge.x1} ${edge.y1} C ${mid} ${edge.y1}, ${mid} ${edge.y2}, ${edge.x2} ${edge.y2}`;
                return (
                  <g key={`${edge.from}-${edge.to}-${edge.choice}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={onPath ? COLOR.accent : COLOR.idle}
                      strokeWidth={onPath ? 3 : 1.5}
                      strokeOpacity={onPath ? 1 : 0.55}
                    />
                    <text
                      x={edge.labelX}
                      y={edge.labelY}
                      textAnchor="middle"
                      fontSize={9}
                      fill={onPath ? COLOR.accent : COLOR.idle}
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}
              {layout.nodes.map((item) => {
                const index = session.history.indexOf(item.id);
                const isVisited = index >= 0;
                const isCurrent = item.id === currentId;
                const isLeaf = item.kind === "leaf";
                const canJump = isVisited && !isCurrent && index < session.history.length - 1;
                const stroke = isCurrent ? COLOR.current : isLeaf ? COLOR.leaf : isVisited ? COLOR.accent : COLOR.idle;
                const fill = isCurrent ? COLOR.currentFill : isLeaf ? COLOR.leafFill : isVisited ? COLOR.accentFill : COLOR.idleFill;
                return (
                  <g
                    key={item.id}
                    role={canJump ? "button" : undefined}
                    tabIndex={canJump ? 0 : undefined}
                    aria-label={canJump ? `${t("back")}: ${item.title}` : undefined}
                    style={{ cursor: canJump ? "pointer" : "default" }}
                    onClick={canJump ? () => jumpTo(index) : undefined}
                    onKeyDown={
                      canJump
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              jumpTo(index);
                            }
                          }
                        : undefined
                    }
                  >
                    <title>{`${item.title} — ${item.label}`}</title>
                    <rect
                      x={item.x}
                      y={item.y}
                      width={item.width}
                      height={item.height}
                      rx={8}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={isCurrent ? 3 : isVisited || isLeaf ? 2 : 1}
                    />
                    <text x={item.x + 12} y={item.y + 25} fontSize={12} fontWeight={700} fill={stroke}>
                      {clip(item.title, 16)}
                    </text>
                    <text x={item.x + 12} y={item.y + 45} fontSize={10} fill="var(--muted, #64748b)">
                      {clip(item.label, 20)}
                    </text>
                  </g>
                );
              })}
            </SvgFrame>
          </div>
          <LegendPills
            items={[
              { label: t("legendVisited"), color: COLOR.accent },
              { label: t("legendCurrent"), color: COLOR.current },
              { label: t("legendLeaf"), color: COLOR.leaf },
              { label: t("legendIdle"), color: COLOR.idle },
            ]}
          />
        </section>

        <section aria-label={t("path")} style={{ marginTop: 20 }}>
          <h2>{t("path")}</h2>
          {session.history.length > 0 ? (
            <ol style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0 }}>
              {session.history.map((id, index) => {
                const item = layout.nodes.find((candidate) => candidate.id === id);
                const isLast = index === session.history.length - 1;
                return (
                  <li key={`${id}-${index}`}>
                    <button
                      type="button"
                      disabled={isLast}
                      aria-current={isLast ? "step" : undefined}
                      onClick={() => jumpTo(index)}
                    >
                      {index + 1}. {item ? clip(item.title, 18) : id}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p style={{ opacity: 0.8 }}>{t("noPath")}</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" onClick={goBack} disabled={session.history.length <= 1}>
              {t("back")}
            </button>
            <button type="button" onClick={resetPath} disabled={session.history.length === 0}>
              {t("resetPath")}
            </button>
          </div>
        </section>

        {question ? (
          <section aria-label={t("currentIssue")} style={{ marginTop: 20 }}>
            <h2>{question.title}</h2>
            <p>{question.question}</p>
            <p style={{ fontSize: 12, opacity: 0.75 }}>{t("options")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => choose(option.id)}
                  style={{ textAlign: "left", padding: 12, borderRadius: 8 }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {leaf ? (
          <section
            aria-label={t("result")}
            style={{
              marginTop: 20,
              padding: 16,
              borderRadius: 10,
              border: `2px solid ${COLOR.leaf}`,
              background: COLOR.leafFill,
            }}
          >
            <h2>{t("result")}</h2>
            <h3>{leaf.title}</h3>
            <p>
              <strong>{t("rootCause")}: </strong>
              {leaf.rootCause}
            </p>
            <h4>{t("fixCommand")}</h4>
            <pre
              style={{
                margin: "8px 0",
                padding: 12,
                borderRadius: 6,
                background: "var(--muted-bg, #f1f5f9)",
                overflowX: "auto",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <code>{leaf.fixCommand}</code>
            </pre>
            <button type="button" onClick={copyFix} aria-live="polite">
              {copied ? t("copied") : t("copyCommand")}
            </button>
            <p style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
              <Link href={leaf.guideHref}>{t("guide")}</Link>
              <Link href={TROUBLESHOOT_GUIDE_HREF}>{t("allGuides")}</Link>
            </p>
            {leaf.relatedTools.length > 0 ? (
              <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <strong>{t("relatedTools")}:</strong>
                {leaf.relatedTools.map((href) => (
                  <Link key={href} href={href}>
                    {href.slice("/tools/".length)}
                  </Link>
                ))}
              </p>
            ) : null}
          </section>
        ) : session.history.length === 0 ? (
          <p style={{ opacity: 0.8, marginTop: 20 }}>{t("waiting")}</p>
        ) : null}
      </div>
    </ToolShell>
  );
}
