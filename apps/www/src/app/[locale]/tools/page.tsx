import { getTranslations, setRequestLocale } from "next-intl/server";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ToolsHubClient, type ToolsHubLabels } from "@/components/tools/ToolsHubClient";
import { ALL_TOOLS } from "@/features/tools/registry";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { toolPath } from "@/lib/routes";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return seoMetadata(locale, "tools", "/tools");
}

export default async function ToolsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tools");
  const tn = await getTranslations("nav");
  const title = t("title");
  const intro = t("intro");
  const pageUrl = `${SITE}/${locale}/tools`;
  const pageId = nodeId(pageUrl, "webpage");
  const pageNode = pageLd(SITE, locale, "/tools", title, {
    description: intro,
    type: "CollectionPage",
  });
  const listLd = {
    "@type": "ItemList",
    "@id": nodeId(pageUrl, "list"),
    name: title,
    numberOfItems: ALL_TOOLS.length,
    itemListElement: ALL_TOOLS.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: t(`items.${tool.slug}.title`),
      url: `${SITE}/${locale}${toolPath(tool.slug)}`,
    })),
  };
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { name: title, id: pageId },
  ]);

  const labels: ToolsHubLabels = {
    eyebrow: t("eyebrow"),
    title,
    intro,
    searchPlaceholder: t("searchPlaceholder"),
    allCategories: t("allCategories"),
    openTool: t("openTool"),
    relatedTitle: t("relatedTitle"),
    reset: t("reset"),
    copyShare: t("copyShare"),
    copied: t("copied"),
    ctaDefault: t("ctaDefault"),
    categories: {
      memory: t("categories.memory"),
      hardware: t("categories.hardware"),
      models: t("categories.models"),
      setup: t("categories.setup"),
      economics: t("categories.economics"),
      diagnostics: t("categories.diagnostics"),
    },
    priority: { P0: t("priority.P0"), P1: t("priority.P1"), P2: t("priority.P2") },
    items: Object.fromEntries(
      ALL_TOOLS.map((tool) => [
        tool.slug,
        {
          title: t(`items.${tool.slug}.title`),
          tagline: t(`items.${tool.slug}.tagline`),
          cta: t(`items.${tool.slug}.cta`),
        },
      ]),
    ),
  };

  return (
    <div className="container page tool-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, listLd, crumbLd])),
        }}
      />
      <Breadcrumbs label={title} />
      <p className="eyebrow">{labels.eyebrow}</p>
      <h1>{title}</h1>
      <p className="page-intro">{intro}</p>
      <ToolsHubClient labels={labels} />
    </div>
  );
}
