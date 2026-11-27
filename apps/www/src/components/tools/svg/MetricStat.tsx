"use client";

const TONE_COLORS: Record<NonNullable<MetricStatProps["tone"]>, string> = {
  accent: "var(--accent, #2563eb)",
  warn: "var(--warn, #b45309)",
  danger: "var(--danger, #dc2626)",
  neutral: "var(--muted, #64748b)",
};

type MetricStatProps = {
  label: string;
  value: string;
  sub?: string;
  tone?: "accent" | "warn" | "danger" | "neutral";
};

/** Metric card with fixed-width numerals so live values never jitter. */
export function MetricStat({ label, value, sub, tone = "neutral" }: MetricStatProps) {
  return (
    <div className="tool-metric" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
      <strong
        style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'", color: TONE_COLORS[tone], fontSize: 22 }}
      >
        {value}
      </strong>
      {sub ? <span style={{ fontSize: 11, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{sub}</span> : null}
    </div>
  );
}
