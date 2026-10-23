import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedAudio, EnrichedImage } from "@/components/EnrichedBlock";
import { FreshSignals } from "@/components/FreshSignals";
import { getLiveArticles } from "@/lib/articles";
import { guidePath, releasePath } from "@/lib/routes";
import { getReleases } from "@/lib/releases";
import { latestPosts, postHeadline } from "@/lib/creator";
import { comparisonSignals, latestXSignals, upgradeSignals, worthReading } from "@/lib/intelligence";
import { jsonLdGraph } from "@/lib/jsonld";
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
  const tg = await getTranslations("guides");
  // Newest first: the homepage should surface what shipped today, not the archive. Guides are
  // per-locale, so this only ever lists the reader's own language.
  const homeGuides = [...getLiveArticles(locale)]
    .sort((a, b) => (a.publishAt < b.publishAt ? 1 : a.publishAt > b.publishAt ? -1 : a.order - b.order))
    .slice(0, 6);
  const latest = getReleases().releases[0];
  const version = latest?.tag ?? "v0.1.40.3";
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([jsonLd])) }}
      />
      <p className="badge">{version}</p>
      <h1>{t("heroTitle")}</h1>
      <p className="lead">{t("heroSub")}</p>
      <div className="hero-actions">
        <Link href="/install" className="btn btn-primary btn-lg">
          {t("ctaInstall")}
        </Link>
        <Link href={latest ? releasePath(latest.tag) : "/releases"} className="btn btn-lg">
          {t("ctaRelease", { version })}
        </Link>
      </div>
      <div className="hero-links">
        <Link href="/benchmarks">{t("ctaBenchmarks")}</Link>
        <span aria-hidden>·</span>
        <Link href="/community">{t("ctaCommunity")}</Link>
        <span aria-hidden>·</span>
        <a href="https://github.com/Niko1221/Strata" rel="noopener noreferrer">
          {t("ctaGithub")}
        </a>
      </div>
      <EnrichedImage id="hero-home" locale={locale} className="hero-visual" />
      <EnrichedAudio id={locale === "zh" ? "tts-home-zh" : "tts-home-en"} locale={locale} />

      {latest ? (
        <section className="card" style={{ marginTop: "1.5rem" }}>
          <p className="badge" style={{ margin: 0 }}>{latest.tag}</p>
          <h2 style={{ margin: "0.6rem 0 0.4rem" }}>
            <Link href={releasePath(latest.tag)}>{latest.name}</Link>
          </h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{releaseLead(latest.body ?? "")}</p>
          <div className="row">
            <Link href="/download" className="btn btn-primary">
              {tn("download")}
            </Link>
            <Link href="/releases" className="btn">
              {tn("releases")}
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid-3">
        <Link href="/install" className="card">
          <EnrichedImage id="card-local" locale={locale} />
          <h3>{t("featureLocal")}</h3>
          <p>{t("featureLocalBody")}</p>
        </Link>
        <Link href="/benchmarks" className="card">
          <EnrichedImage id="card-speed" locale={locale} />
          <h3>{t("featureSpeed")}</h3>
          <p>{t("featureSpeedBody")}</p>
        </Link>
        <Link href="/download" className="card">
          <EnrichedImage id="card-agents" locale={locale} />
          <h3>{t("featureAgents")}</h3>
          <p>{t("featureAgentsBody")}</p>
        </Link>
      </div>

      {fresh.length ? (
        <section className="section">
          <h2>{tp("fresh")}</h2>
          <FreshSignals items={fresh} locale={locale} />
          <Link href="/pulse" className="btn btn-quiet">
            {tn("pulse")} →
          </Link>
        </section>
      ) : null}

      {/* The homepage is the only page every crawler is guaranteed to fetch, so the hubs and the
          newest guides are listed here in full rather than left to the header menu. */}
      <section className="section">
        <h2>{tn("topics")}</h2>
        <p className="page-intro">{tg("homeIntro")}</p>
        {homeGuides.length > 0 ? (
          <ul className="list-plain" style={{ display: "grid", gap: "0.5rem" }}>
            {homeGuides.map((article) => (
              <li key={article.slug}>
                <Link href={guidePath(article.slug)}>{article.article.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          // Nothing published yet in this language: an empty list reads as a broken page, so the
          // section says so and sends the reader to the editorial topics instead.
          <p className="meta">{tg("empty")}</p>
        )}
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <Link href="/guides" className="btn btn-quiet">
            {tg("title")} →
          </Link>
          <Link href="/gpus" className="btn btn-quiet">
            {tn("gpus")} →
          </Link>
          <Link href="/gpus/vendor" className="btn btn-quiet">
            {tn("gpuBrands")} →
          </Link>
          <Link href="/topics" className="btn btn-quiet">
            {tg("editorial")} →
          </Link>
        </div>
      </section>

      <section className="section">
        <h2>{t("aiPromptTitle")}</h2>
        <pre className="copy-block">{t("aiPromptCopy")}</pre>
      </section>

      {posts.length ? (
        <section className="section">
          <h2>{tc("homeSection")}</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>{tc("homeSectionSub")}</p>
          <ul className="list-plain" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {posts.map((p) => (
              <li key={p.id} className="card" style={{ padding: "0.9rem 1.1rem" }}>
                <Link href={`/creator/updates/${p.id}`}>{postHeadline(p.title)}</Link>
              </li>
            ))}
          </ul>
          <Link href="/creator" className="btn btn-quiet" style={{ marginTop: "0.75rem" }}>
            {tc("viewAll")} →
          </Link>
        </section>
      ) : null}
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
