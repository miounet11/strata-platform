import type { IntelligenceSignal } from "@/lib/intelligence";
import { formatAge } from "@/lib/time";

export function SignalList({ items, locale = "en" }: { items: IntelligenceSignal[]; locale?: string }) {
  if (!items.length) return null;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {items.map((s) => (
        <li
          key={s.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <a href={s.url} rel="noopener noreferrer" style={{ fontWeight: 600 }}>
            {headline(s.title)}
          </a>
          <p style={{ margin: "0.35rem 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            @{s.author} · {formatAge(s.publishedAt, locale)} · {sourceLabel(s.source)}
            {s.tags?.length ? ` · ${s.tags.slice(0, 3).join(", ")}` : ""}
          </p>
          {excerpt(s) ? (
            <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5 }}>{excerpt(s)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function headline(title: string) {
  const line = title.split("\n").find((part) => part.trim()) ?? title;
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

function excerpt(signal: { title: string; body?: string }) {
  const body = (signal.body ?? "").replace(/\s+/g, " ").trim();
  const title = signal.title.replace(/\s+/g, " ").trim();
  if (!body || body === title) return "";
  const cut = body.length > 220 ? `${body.slice(0, 220)}…` : body;
  return cut === title ? "" : cut;
}

function sourceLabel(source?: string) {
  if (!source) return "web";
  if (source.startsWith("x-gateway") || source.startsWith("x-api") || source.startsWith("cheap-x") || source.startsWith("rsshub") || source === "creator-x") {
    return "X";
  }
  if (source.includes("github")) return "GitHub";
  return source.split(":")[0];
}
