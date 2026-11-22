import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getBenchmarks } from "@/lib/benchmarks";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { ORG_ID, siteEntityNodes } from "@/lib/site-entities";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";

export const revalidate = 1800;

/** The model every figure on the benchmark table was measured with. */
const MEASURED_MODEL = "Qwen3.8 Flash Next";

/**
 * The method page exists as its own URL because that is the shape an answer engine can cite.
 *
 * The benchmark table states its assumptions in a paragraph at the bottom of the table page.
 * A model quoting a payback figure cannot cite "the last paragraph of /benchmarks" as a source;
 * it can cite `/en/method`. The page also carries the part most benchmark pages omit: what the
 * numbers do *not* cover. A source that names its limits is the one a retrieval pipeline trusts
 * to qualify a claim, so leaving them out makes the figures look unverifiable.
 *
 * Every number below is read from `benchmarks.json`, so the method page cannot drift from the
 * table it describes.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return seoMetadata(locale, "method", "/method");
}

export default async function MethodPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("method");
  const data = getBenchmarks();
  const { defaults, source } = data;
  const url = `${SITE}/${locale}/method`;
  const datasetId = `${SITE}/${locale}/benchmarks#dataset`;

  const pageNode = pageLd(SITE, locale, "/method", t("title"), {
    description: t("description"),
    type: "WebPage",
  });

  // The method is part of the dataset's provenance, so it points at the Dataset node rather than
  // describing a competing one. `isBasedOn` runs the other way: the table cites this page as its
  // method, and both live in the same graph.
  const methodNode = {
    "@type": "TechArticle",
    "@id": nodeId(url, "article"),
    headline: t("title"),
    description: t("description"),
    inLanguage: locale,
    url,
    mainEntityOfPage: { "@id": nodeId(url, "webpage") },
    // Only `dateModified` is stated. The page has no publish date that can be observed, and
    // inventing one would be a false freshness signal; the method revision date is the sync date.
    dateModified: data.syncedAt,
    author: { "@id": `${SITE}/#person` },
    publisher: { "@id": ORG_ID },
    about: { "@id": datasetId },
    // `aboutModel` is not a schema.org property, so a consumer would drop it. The measurement
    // model belongs in `mentions` as a named Thing, which is a real property.
    mentions: [
      { "@type": "Thing", name: MEASURED_MODEL },
      { "@type": "Organization", name: source.name, url: source.url },
    ],
  };

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, methodNode])),
        }}
      />

      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("sourceTitle")}</h2>
        <p>
          {t("sourceBody", { name: source.name, license: source.license })}{" "}
          <a href={source.url} rel="noopener noreferrer">
            {source.name}
          </a>
          {source.methodology !== source.url ? (
            <>
              {" · "}
              <a href={source.methodology} rel="noopener noreferrer">
                {t("sourceMethod")}
              </a>
            </>
          ) : null}
        </p>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("methodTitle")}</h2>
        <ul>
          <li>{t("method1")}</li>
          <li>{t("method2")}</li>
          <li>{t("method3")}</li>
          <li>{t("method4")}</li>
        </ul>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("assumptionsTitle")}</h2>
        <p>{t("assumptionsIntro")}</p>
        {/* Rendered from the same defaults the table computes with. A method page that states
            assumptions in prose drifts the first time someone tunes a default. */}
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionReadingShare")}
              </th>
              <td>{Math.round(defaults.readingShare * 100)}%</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionActiveHours")}
              </th>
              <td>{defaults.activeHours} h</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionElectricity")}
              </th>
              <td>{defaults.electricityPerKwh}/kWh</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionHardwareLife")}
              </th>
              <td>{defaults.hardwareLifeYears} years</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionHost")}
              </th>
              <td>{defaults.hostAllowance}</td>
            </tr>
            <tr>
              <th scope="row" style={{ textAlign: "left", padding: "0.35rem 0.75rem 0.35rem 0" }}>
                {t("assumptionApi")}
              </th>
              <td>
                {defaults.apiReadingPerMM} / {defaults.apiWritingPerMM} {t("perMM")}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("limitsTitle")}</h2>
        <ul>
          <li>{t("limit1")}</li>
          <li>{t("limit2")}</li>
          <li>{t("limit3")}</li>
          <li>{t("limit4")}</li>
        </ul>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("freshnessTitle")}</h2>
        <p>{t("freshnessBody", { date: data.syncedAt.slice(0, 10) })}</p>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("citeTitle")}</h2>
        <p>{t("citeBody")}</p>
        <p className="meta">
          <Link href="/benchmarks">{t("backToBenchmarks")}</Link>
        </p>
      </section>
    </div>
  );
}
