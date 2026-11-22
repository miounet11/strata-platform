import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getLiveArticles } from "@/lib/articles";
import { GUIDE_KINDS, guideCategoryPath, guideKindOrder, guidePath } from "@/lib/routes";
import { GUIDES_LISTED } from "@/lib/page-budget";
import { siteMetadata, SITE } from "@/lib/seo";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  const published = [...new Set(getLiveArticles().map((article) => article.locale))];
  return siteMetadata(
    locale,
    t("guides.title"),
    t("guides.description"),
    "/guides",
    published.includes(locale),
    published.length > 0 ? published : [locale],
  );
}

export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("guides");
  const tn = await getTranslations("nav");
  const kindsMap = t.raw("kinds") as Record<string, string>;

  const articles = getLiveArticles(locale).sort(
    (a, b) => guideKindOrder(a.kind) - guideKindOrder(b.kind) || a.order - b.order,
  );

  const groups = GUIDE_KINDS.map((kind) => {
    const items = articles.filter((article) => article.kind === kind);
    return { kind, items: items.slice(0, GUIDES_LISTED), total: items.length };
  }).filter((group) => group.items.length > 0);

  const otherAll = articles.filter((article) => !(GUIDE_KINDS as readonly string[]).includes(article.kind));
  const other = otherAll.slice(0, GUIDES_LISTED);

  const pageTitle = t("title");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              ...siteEntityNodes(),
              pageLd(SITE, locale, "/guides", pageTitle, { type: "CollectionPage" }),
            ]),
          ),
        }}
      />

      <Breadcrumbs label={t("title")} />
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <p className="meta">
        {t("count", { n: articles.length })} · <Link href="/can-i-run">{tn("canIRun")}</Link>
        {" · "}
        <Link href="/best">{tn("best")}</Link>
        {" · "}
        <Link href="/search">{tn("search")}</Link>
      </p>

      {groups.length > 0 ? (
        <div className="row" style={{ marginTop: "1rem" }}>
          {groups.map((group) => (
            <Link key={group.kind} href={guideCategoryPath(group.kind)} className="btn">
              {kindsMap[group.kind] ?? group.kind} ({group.total})
            </Link>
          ))}
        </div>
      ) : null}

      {articles.length === 0 ? <p className="meta">{t("empty")}</p> : null}

      {groups.map((group) => (
        <section className="section" key={group.kind}>
          <h2>
            <Link href={guideCategoryPath(group.kind)} style={{ color: "inherit" }}>
              {kindsMap[group.kind] ?? group.kind}
            </Link>
          </h2>
          <ul className="guide-list">
            {group.items.map((article) => (
              <li key={article.slug}>
                <Link href={guidePath(article.slug)}>{article.article.title}</Link>
                <p>{article.article.description}</p>
              </li>
            ))}
          </ul>
          {group.total > group.items.length ? (
            <p className="meta">
              {t("showing", { shown: group.items.length, total: group.total })} ·{" "}
              <Link href={guideCategoryPath(group.kind)}>{t("viewAllCategory")} →</Link>
            </p>
          ) : null}
        </section>
      ))}

      {other.length > 0 ? (
        <section className="section">
          <h2>{t("all")}</h2>
          <ul className="guide-list">
            {other.map((article) => (
              <li key={article.slug}>
                <Link href={guidePath(article.slug)}>{article.article.title}</Link>
                <p>{article.article.description}</p>
              </li>
            ))}
          </ul>
          {otherAll.length > other.length ? (
            <p className="meta">{t("showing", { shown: other.length, total: otherAll.length })}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
