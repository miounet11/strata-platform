import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { getBenchmarks } from "@/lib/benchmarks";
import { seoMetadata } from "@/lib/seo-messages";

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
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: t("title"),
    description: t("intro"),
    url: `https://www.stratat.com/${locale}/benchmarks`,
    isBasedOn: data.source.url,
    creator: { "@type": "Organization", name: "Strata" },
  };

  return (
    <div className="container container-wide page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <p className="meta">
        {t("modelNote")}
        {" · "}
        <a href={data.source.url} rel="noopener noreferrer">
          {data.source.name}
        </a>
        {" · "}
        {t("priceNote")}
      </p>
      <BenchmarkBoard />
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
