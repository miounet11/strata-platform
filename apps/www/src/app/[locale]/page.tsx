import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedAudio, EnrichedImage } from "@/components/EnrichedBlock";
import { FreshSignals } from "@/components/FreshSignals";
import { getReleases } from "@/lib/releases";
import { latestPosts, postHeadline } from "@/lib/creator";
import { comparisonSignals, latestXSignals, upgradeSignals, worthReading } from "@/lib/intelligence";
import { siteMetadata, softwareJsonLd } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(
    locale,
    "Local 125B AI",
    "Install Strata, download models, and connect Cursor or Claude Code to http://127.0.0.1:8080/v1.",
    "",
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tc = await getTranslations("creator");
  const tn = await getTranslations("nav");
  const tp = await getTranslations("pulse");
  const latest = getReleases().releases[0];
  const version = latest?.tag ?? "v0.1.40.3";
  const xCount = latestXSignals(8).length;
  const cmpCount = comparisonSignals(8).length;
  const upgCount = upgradeSignals(8).length;
  const jsonLd = softwareJsonLd();
  const fresh = worthReading(4);
  const freshIds = new Set(fresh.map((signal) => signal.id));
  const posts = latestPosts(12)
    .filter((post) => !freshIds.has(post.id) && !post.title.trim().startsWith("@"))
    .slice(0, 3);

  return (
    <div className="container hero">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="badge">{version}</p>
      <h1>{t("heroTitle")}</h1>
      <p className="lead">{t("heroSub")}</p>
      <EnrichedImage id="hero-home" locale={locale} className="hero-visual" />
      <EnrichedAudio id={locale === "zh" ? "tts-home-zh" : "tts-home-en"} locale={locale} />
      <div className="hero-actions">
        <Link href="/install" className="btn btn-primary">
          {t("ctaInstall")}
        </Link>
        <Link href={latest ? `/releases/${latest.tag}` : "/releases"} className="btn">
          {t("ctaRelease", { version })}
        </Link>
        <Link href="/community" className="btn">
          {t("ctaCommunity")}
        </Link>
        <Link href="/benchmarks" className="btn">
          {t("ctaBenchmarks")}
        </Link>
        <a
          className="btn"
          href="https://github.com/Niko1221/Strata"
          rel="noopener noreferrer"
        >
          {t("ctaGithub")}
        </a>
      </div>
      {latest ? (
        <section className="card" style={{ marginTop: "0.5rem" }}>
          <p className="badge">{latest.tag}</p>
          <h2 style={{ margin: "0.6rem 0 0.4rem" }}>
            <Link href={`/releases/${latest.tag}`}>{latest.name}</Link>
          </h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{releaseLead(latest.body ?? "")}</p>
          <div className="hero-actions">
            <Link href="/releases" className="btn btn-primary">
              {tn("releases")}
            </Link>
            <Link href="/download" className="btn">
              {tn("download")}
            </Link>
            <Link href="/benchmarks" className="btn">
              {tn("benchmarks")}
            </Link>
            <Link href="/pulse" className="btn">
              {tn("pulse")} · {xCount + cmpCount + upgCount}
            </Link>
          </div>
        </section>
      ) : null}
      {fresh.length ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{tp("fresh")}</h2>
          <FreshSignals items={fresh} locale={locale} />
          <Link href="/pulse" className="btn">
            {tn("pulse")}
          </Link>
        </section>
      ) : null}
      <div className="grid-3">
        <Link href="/install" className="card" style={{ display: "block", color: "inherit" }}>
          <EnrichedImage id="card-local" locale={locale} />
          <h3>{t("featureLocal")}</h3>
          <p>{t("featureLocalBody")}</p>
        </Link>
        <Link href="/benchmarks" className="card" style={{ display: "block", color: "inherit" }}>
          <EnrichedImage id="card-speed" locale={locale} />
          <h3>{t("featureSpeed")}</h3>
          <p>{t("featureSpeedBody")}</p>
        </Link>
        <Link href="/download" className="card" style={{ display: "block", color: "inherit" }}>
          <EnrichedImage id="card-agents" locale={locale} />
          <h3>{t("featureAgents")}</h3>
          <p>{t("featureAgentsBody")}</p>
        </Link>
      </div>
      <h2>{t("aiPromptTitle")}</h2>
      <pre className="copy-block">{t("aiPromptCopy")}</pre>
      <section style={{ marginTop: "2.5rem" }}>
        <h2>{tc("homeSection")}</h2>
        <p style={{ color: "var(--muted)" }}>{tc("homeSectionSub")}</p>
        <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
          {posts.map((p) => (
            <li key={p.id} className="card" style={{ marginBottom: "0.65rem", padding: "0.85rem 1rem" }}>
              <Link href={`/creator/updates/${p.id}`}>{postHeadline(p.title)}</Link>
            </li>
          ))}
        </ul>
        <Link href="/creator" className="btn" style={{ marginTop: "0.75rem" }}>
          {tc("viewAll")}
        </Link>
      </section>
    </div>
  );
}

function releaseLead(body: string) {
  const plain = body
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 280 ? `${plain.slice(0, 280)}…` : plain;
}
