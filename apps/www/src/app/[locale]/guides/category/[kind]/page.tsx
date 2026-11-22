import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RegisterLocales } from "@/components/LocaleAvailability";
import { getLiveArticles, getLiveArticlesByKind, liveGuideKinds } from "@/lib/articles";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { GUIDE_KINDS, guideCategoryPath, guidePath } from "@/lib/routes";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

const MAX_CATEGORY_LISTED = 120;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    liveGuideKinds(locale)
      .filter((kind) => (GUIDE_KINDS as readonly string[]).includes(kind))
      .map((kind) => ({ locale, kind })),
  );
}

function localesForKind(kind: string): string[] {
  return routing.locales.filter((locale) => getLiveArticlesByKind(locale, kind).length > 0);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; kind: string }>;
}): Promise<Metadata> {
  const { locale, kind } = await params;
  if (!(GUIDE_KINDS as readonly string[]).includes(kind)) return {};
  const articles = getLiveArticlesByKind(locale, kind);
  if (articles.length === 0) return {};
  const t = await getTranslations({ locale, namespace: "guides" });
  const kindsMap = t.raw("kinds") as Record<string, string>;
  const label = kindsMap[kind] ?? kind;
  const siblings = localesForKind(kind);
  return seoMetadata(
    locale,
    "guides",
    guideCategoryPath(kind),
    true,
    `${label} — ${t("title")}`,
    t("categoryIntro", { kind: label, count: articles.length }),
    siblings.length > 0 ? siblings : [locale],
  );
}

/**
 * Pillar page for one guide category (`/guides/category/<kind>`).
 *
 * `/guides` caps each group at `GUIDES_LISTED = 12` to stay under the HTML byte budget. Without
 * category hubs, the other 60+ guides in a large category had no browseable hub linking to them.
 */
export default async function GuideCategoryPage({
  params,
}: {
  params: Promise<{ locale: string; kind: string }>;
}) {
  const { locale, kind } = await params;
  setRequestLocale(locale);
  if (!(GUIDE_KINDS as readonly string[]).includes(kind)) notFound();
  const articles = getLiveArticlesByKind(locale, kind);
  if (articles.length === 0) notFound();

  const t = await getTranslations("guides");
  const tn = await getTranslations("nav");
  const kindsMap = t.raw("kinds") as Record<string, string>;
  const label = kindsMap[kind] ?? kind;
  const shown = articles.slice(0, MAX_CATEGORY_LISTED);
  const siblings = localesForKind(kind);
  const otherKinds = liveGuideKinds(locale).filter(
    (k) => k !== kind && (GUIDE_KINDS as readonly string[]).includes(k),
  );

  const url = `${SITE}/${locale}${guideCategoryPath(kind)}`;
  const pageId = nodeId(url, "webpage");
  const pageNode = pageLd(SITE, locale, guideCategoryPath(kind), `${label} — ${t("title")}`, {
    description: t("categoryIntro", { kind: label, count: articles.length }),
    type: "CollectionPage",
  });
  const listLd = {
    "@type": "ItemList",
    "@id": nodeId(url, "list"),
    name: label,
    numberOfItems: shown.length,
    inLanguage: locale,
    itemListElement: shown.slice(0, 50).map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: article.article.title,
      url: `${SITE}/${locale}${guidePath(article.slug)}`,
    })),
  };
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { path: "/guides", name: tn("guides") },
    { name: label, id: pageId },
  ]);

  // Also show total site guides count for context.
  const totalInLocale = getLiveArticles(locale).length;

  return (
    <div className="container page">
      <RegisterLocales locales={siblings.length > 0 ? siblings : [locale]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, listLd, crumbLd])),
        }}
      />

      <Breadcrumbs label={label} />
      <h1>{label}</h1>
      <p className="page-intro">{t("categoryIntro", { kind: label, count: articles.length })}</p>
      <p className="meta">
        {t("count", { n: articles.length })} · <Link href="/guides">{t("all")} ({totalInLocale})</Link>
        {" · "}
        <Link href="/can-i-run">{tn("canIRun")}</Link>
        {" · "}
        <Link href="/best">{tn("best")}</Link>
      </p>

      <ul className="guide-list">
        {shown.map((article) => (
          <li key={article.slug}>
            <Link href={guidePath(article.slug)}>{article.article.title}</Link>
            <p>{article.article.description}</p>
          </li>
        ))}
      </ul>

      {articles.length > shown.length ? (
        <p className="meta">{t("showing", { shown: shown.length, total: articles.length })}</p>
      ) : null}

      {otherKinds.length > 0 ? (
        <section className="section">
          <h2>{t("otherCategories")}</h2>
          <div className="row">
            {otherKinds.map((other) => (
              <Link key={other} href={guideCategoryPath(other)} className="btn">
                {kindsMap[other] ?? other}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
