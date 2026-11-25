import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SearchClient } from "@/components/SearchClient";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return seoMetadata(locale, "search", "/search");
}

export default async function SearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("search");
  const tn = await getTranslations("nav");
  const title = t("title");
  const url = `${SITE}/${locale}/search`;
  const pageId = nodeId(url, "webpage");

  const pageNode = pageLd(SITE, locale, "/search", title, {
    description: t("intro"),
    type: "SearchResultsPage",
  });
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { name: title, id: pageId },
  ]);

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, crumbLd])),
        }}
      />
      <Breadcrumbs label={title} />
      <h1>{title}</h1>
      <p className="page-intro">{t("intro")}</p>

      <SearchClient
        locale={locale}
        initialQuery=""
        labels={{
          placeholder: t("placeholder"),
          button: t("button"),
          allTypes: t("allTypes"),
          guides: tn("guides"),
          gpus: tn("gpus"),
          builds: t("filterBuild"),
          benchmarks: tn("benchmarks"),
          topics: tn("topics"),
          releases: tn("releases"),
          emptyPrompt: t("emptyPrompt"),
          noResults: t("noResults"),
          loading: t("loading"),
          popularHeading: t("popularHeading"),
          resultCount: t("resultCount"),
        }}
      />

      <section className="section">
        <h2>{t("browseHeading")}</h2>
        <div className="row">
          <Link href="/can-i-run" className="btn">
            {tn("canIRun")}
          </Link>
          <Link href="/best" className="btn">
            {tn("best")}
          </Link>
          <Link href="/guides" className="btn">
            {tn("guides")}
          </Link>
          <Link href="/gpus" className="btn">
            {tn("gpus")}
          </Link>
          <Link href="/benchmarks" className="btn">
            {tn("benchmarks")}
          </Link>
          <Link href="/topics" className="btn">
            {tn("topics")}
          </Link>
        </div>
      </section>
    </div>
  );
}
