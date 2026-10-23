import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getLiveArticles } from "@/lib/articles";
import { GUIDE_KINDS, guideKindOrder, guidePath } from "@/lib/routes";
import { siteMetadata } from "@/lib/seo";

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
  // Guides are written per language, so only the locales that actually have one advertise the
  // page. A locale without guides still renders (the navigation links here), but it is a list of
  // nothing — indexing six empty indexes costs crawl budget and reads as thin content.
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

  // Only the language's own articles: the generator writes per locale rather than translating,
  // so listing other languages' guides here would send readers to a page that does not exist.
  const articles = getLiveArticles(locale).sort(
    (a, b) => guideKindOrder(a.kind) - guideKindOrder(b.kind) || a.order - b.order,
  );

  const groups = GUIDE_KINDS.map((kind) => ({
    kind,
    items: articles.filter((article) => article.kind === kind),
  })).filter((group) => group.items.length > 0);

  // Anything with a kind the model file does not know about still gets listed, rather than
  // silently disappearing from the only index that links to it.
  const other = articles.filter((article) => !(GUIDE_KINDS as readonly string[]).includes(article.kind));

  return (
    <div className="container page">
      <Breadcrumbs label={t("title")} />
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <p className="meta">{t("count", { n: articles.length })}</p>

      {articles.length === 0 ? <p className="meta">{t("empty")}</p> : null}

      {groups.map((group) => (
        <section className="section" key={group.kind}>
          <h2>{t(`kinds.${group.kind}`)}</h2>
          <ul className="guide-list">
            {group.items.map((article) => (
              <li key={article.slug}>
                <Link href={guidePath(article.slug)}>{article.article.title}</Link>
                <p>{article.article.description}</p>
              </li>
            ))}
          </ul>
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
        </section>
      ) : null}
    </div>
  );
}
