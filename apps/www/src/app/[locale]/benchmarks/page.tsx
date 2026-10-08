import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { getBenchmarks } from "@/lib/benchmarks";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "benchmarks" });
  return siteMetadata(locale, t("title"), t("intro"), "/benchmarks");
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
    <div className="container container-wide" style={{ padding: "2rem 0 3rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{t("title")}</h1>
      <p className="lead" style={{ color: "var(--muted)", maxWidth: "46rem" }}>
        {t("intro")}
      </p>
      <p style={{ color: "var(--muted)" }}>
        {t("modelNote")}
        {" · "}
        <a href={data.source.url} rel="noopener noreferrer">
          {data.source.name}
        </a>
      </p>
      <p style={{ color: "var(--muted)" }}>{t("priceNote")}</p>
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
