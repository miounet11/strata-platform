import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { FreshSignals } from "@/components/FreshSignals";
import { SignalList } from "@/components/SignalList";
import {
  comparisonSignals,
  getIntelligencePulse,
  latestGpuQuotes,
  latestSignals,
  latestXSignals,
  newestXAt,
  presentSignals,
  upgradeSignals,
  worthReading,
} from "@/lib/intelligence";
import { formatAge } from "@/lib/time";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(
    locale,
    "Pulse",
    "X signals on local LLM deploy, Strata, and community GPU price mentions.",
    "/pulse",
  );
}

export default async function PulsePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pulse");
  const { syncedAt, meta } = getIntelligencePulse();
  const intake = meta.intake;
  const fresh = worthReading(6);
  const newest = newestXAt();
  const xFeed = presentSignals(latestXSignals(35));
  const comparisons = presentSignals(comparisonSignals(25));
  const upgrades = presentSignals(upgradeSignals(25));
  const signals = latestSignals(30);
  const quotes = latestGpuQuotes(25);

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <EnrichedImage id="pulse-signals" locale={locale} />
      <p style={{ color: "var(--muted)", maxWidth: "46rem" }}>{t("intro")}</p>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
        {t("synced")} {syncedAt.slice(0, 16).replace("T", " ")} UTC
        {newest ? ` · ${t("newest")} ${formatAge(newest, locale)}` : ""} · {intake?.provider ?? "cache"}
        {intake?.plan ? ` · ${intake.plan}` : ""} · {t("disclaimer")}
      </p>
      <div className="hero-actions" style={{ marginTop: "1rem" }}>
        <Link href="/install" className="btn btn-primary">
          {t("install")}
        </Link>
        <Link href="/creator" className="btn">
          {t("creator")}
        </Link>
        <a
          className="btn"
          href="https://x.com/search?q=Strata%20vs%20llama.cpp"
          rel="noopener noreferrer"
        >
          {t("onX")}
        </a>
      </div>

      <h2 style={{ marginTop: "2rem" }}>{t("fresh")}</h2>
      <FreshSignals items={fresh} locale={locale} />

      <h2 style={{ marginTop: "2rem" }}>{t("xLatest")}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t("xLatestHint")}</p>
      {xFeed.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t("noX")}</p>
      ) : (
        <SignalList items={xFeed} locale={locale} />
      )}

      <p style={{ marginTop: "0.5rem" }}>
        <Link href="/benchmarks">{t("comparisons")}</Link>
        {" · "}
        <Link href="/releases">{t("upgrades")}</Link>
      </p>

      <h2 style={{ marginTop: "2.5rem" }}>{t("comparisons")}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t("comparisonsHint")}</p>
      {comparisons.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t("noComparisons")}</p>
      ) : (
        <SignalList items={comparisons} locale={locale} />
      )}

      <h2 style={{ marginTop: "2.5rem" }}>{t("upgrades")}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{t("upgradesHint")}</p>
      {upgrades.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t("noUpgrades")}</p>
      ) : (
        <SignalList items={upgrades} locale={locale} />
      )}

      <h2 style={{ marginTop: "2rem" }}>{t("gpuQuotes")}</h2>
      {quotes.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{t("noQuotes")}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.5rem" }}>{t("model")}</th>
                <th style={{ padding: "0.5rem" }}>{t("price")}</th>
                <th style={{ padding: "0.5rem" }}>{t("asOf")}</th>
                <th style={{ padding: "0.5rem" }}>{t("source")}</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem" }}>{q.model}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {q.currency === "CNY" ? "¥" : "$"}
                    {q.amount.toLocaleString(locale)}
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}> ({q.confidence})</span>
                  </td>
                  <td style={{ padding: "0.5rem" }}>{q.asOf.slice(0, 10)}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <a href={q.sourceUrl} rel="noopener noreferrer">
                      @{q.sourceAuthor}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details style={{ marginTop: "2.5rem" }}>
        <summary style={{ fontWeight: 600, cursor: "pointer" }}>{t("allSignals")}</summary>
        <SignalList items={signals} locale={locale} />
      </details>

      <details style={{ marginTop: "2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        <summary>{t("methods")}</summary>
        <ul>
          {(meta.methods ?? []).map((m) => (
            <li key={m}>{m}</li>
          ))}
          {(meta.openSourceAlternatives ?? []).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
