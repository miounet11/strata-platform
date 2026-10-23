import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardPanel } from "@/components/DashboardPanel";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "dashboard", "/dashboard", false);
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const pageTitle = t("title");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/dashboard", pageTitle, { type: "WebPage" })])) }}
      />

      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <DashboardPanel />
    </div>
  );
}
