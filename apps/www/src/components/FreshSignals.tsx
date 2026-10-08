import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { IntelligenceSignal } from "@/lib/intelligence";
import { formatAge } from "@/lib/time";

export async function FreshSignals({
  items,
  locale,
}: {
  items: IntelligenceSignal[];
  locale: string;
}) {
  const t = await getTranslations("nav");
  if (!items.length) return null;
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {items.map((signal) => (
        <li key={signal.id} className="card" style={{ marginBottom: "0.65rem" }}>
          <a href={signal.url} rel="noopener noreferrer" style={{ fontWeight: 600, color: "inherit" }}>
            {headline(signal.title)}
          </a>
          <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
            @{signal.author} · {formatAge(signal.publishedAt, locale)}
            {signal.tags?.includes("upgrade") ? (
              <>
                {" · "}
                <Link href="/releases">{t("releases")}</Link>
              </>
            ) : null}
            {signal.tags?.includes("benchmark") || signal.tags?.includes("comparison") ? (
              <>
                {" · "}
                <Link href="/benchmarks">{t("benchmarks")}</Link>
              </>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

function headline(title: string) {
  const line = title.split("\n").find((part) => part.trim()) ?? title;
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 160 ? `${clean.slice(0, 160)}…` : clean;
}
