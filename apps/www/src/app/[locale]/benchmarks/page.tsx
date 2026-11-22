import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { ClientMessages } from "@/components/ClientMessages";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { getBenchmarks } from "@/lib/benchmarks";
import { jsonLdGraph } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { ORG_ID, siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "benchmarks", "/benchmarks");
}

export default async function BenchmarksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("benchmarks");
  const data = getBenchmarks();
  const jsonLd = {
    "@type": "Dataset",
    "@id": `${SITE}/${locale}/benchmarks#dataset`,
    name: t("title"),
    description: t("intro"),
    url: `${SITE}/${locale}/benchmarks`,
    inLanguage: locale,
    // A dataset is only citable if its terms are stated where the numbers live. Without
    // `license` and `dateModified` an assistant can quote a figure but cannot say where it came
    // from or whether it is current, so it quotes a source that states both instead.
    license: data.source.license,
    creator: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isBasedOn: data.source.url,
    isAccessibleForFree: true,
    dateModified: data.syncedAt,
    // GEO: an assistant citing a number must be able to name the snapshot it came from, otherwise
    // the quote is untraceable once the table changes. `version` is deliberately not used: schema
    // .org treats it as an editorial/software version number, and filling it with the sync
    // timestamp would only restate `dateModified`. A typed identifier records the same fact
    // without pretending to be a version string.
    identifier: {
      "@type": "PropertyValue",
      propertyID: "dataSnapshot",
      value: data.syncedAt,
    },
    // `citation` carries an `@id` so consumers that follow node references can resolve it instead
    // of depending on every consumer to inline the object.
    citation: {
      "@type": "CreativeWork",
      "@id": `${data.source.url}#source`,
      name: data.source.name,
      url: data.source.url,
    },
    variableMeasured: [
      { "@type": "PropertyValue", name: "reading tokens per second", unitText: "tokens/s" },
      { "@type": "PropertyValue", name: "writing tokens per second", unitText: "tokens/s" },
      { "@type": "PropertyValue", name: "local cost", unitText: "USD per million tokens" },
      { "@type": "PropertyValue", name: "break-even", unitText: "days" },
    ],
  };

  return (
    <div className="container container-wide page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), jsonLd])) }}
      />
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <EnrichedImage id="bench-hero" locale={locale} className="page-visual" />
      <p className="meta">
        {t("modelNote")}
        {" · "}
        <a href={data.source.url} rel="noopener noreferrer">
          {data.source.name}
        </a>
        {" · "}
        {t("priceNote")}
      </p>
      <ClientMessages namespaces={["benchmarks"]}>
        <BenchmarkBoard />
      </ClientMessages>
      <Methodology />
    </div>
  );
}

async function Methodology() {
  const t = await getTranslations("benchmarks");
  return (
    <section style={{ marginTop: "2rem", maxWidth: "46rem" }}>
      <h2>{t("methodology")}</h2>
      <ul>
        <li>{t("method1")}</li>
        <li>{t("method2")}</li>
        <li>{t("method3")}</li>
        <li>{t("method4")}</li>
      </ul>
    </section>
  );
}
