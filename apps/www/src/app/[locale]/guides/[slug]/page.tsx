import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RegisterLocales } from "@/components/LocaleAvailability";
import { Markdown } from "@/components/Markdown";
import { RelatedContent, relatedArticles } from "@/components/RelatedContent";
import { getArticle, getLiveArticles, localesForSlug } from "@/lib/articles";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { allGpus } from "@/lib/gpus";
import { jsonLdGraph, nodeId } from "@/lib/jsonld";
import { findMentions, linkifyMentions } from "@/lib/internal-links";
import { GUIDE_KINDS, guideCategoryPath } from "@/lib/routes";
import { seoMetadata } from "@/lib/seo-messages";
import { ORG_ID, PERSON_ID, WEBSITE_ID, siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

export function generateStaticParams() {
  // Articles are written per language, so only build the pairs that actually exist.
  return routing.locales.flatMap((locale) =>
    getLiveArticles(locale).map((article) => ({ locale, slug: article.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const article = getArticle(locale, slug);
  if (!article) return {};
  const siblings = localesForSlug(slug).filter((code): code is (typeof routing.locales)[number] =>
    routing.locales.includes(code as (typeof routing.locales)[number]),
  );
  return seoMetadata(
    locale,
    "topics",
    `/guides/${slug}`,
    true,
    article.article.title,
    article.article.description,
    siblings.length > 0 ? siblings : [locale],
  );
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = getArticle(locale, slug);
  if (!article) notFound();

  const { title, description, body, faq } = article.article;
  const siblings = localesForSlug(slug).filter((code): code is (typeof routing.locales)[number] =>
    routing.locales.includes(code as (typeof routing.locales)[number]),
  );
  const gpus = allGpus().map((gpu) => ({ name: gpu.name, slug: gpu.slug }));
  const linkedBody = linkifyMentions(body, gpus, { limit: 3 });
  const mentionedGpus = findMentions(body, gpus, { limit: 8 }).map((mention) => ({
    name: mention.title,
    slug: mention.href.replace(/^\/gpus\//, ""),
  }));
  const url = `${SITE}/${locale}/guides/${slug}`;
  const tn = await getTranslations({ locale, namespace: "nav" });
  const tg = await getTranslations({ locale, namespace: "guides" });
  const kindsMap = tg.raw("kinds") as Record<string, string>;
  const hasCategory = (GUIDE_KINDS as readonly string[]).includes(article.kind);
  const kindLabel = kindsMap[article.kind] ?? article.kind;
  const updatedIso = article.generatedAt ?? article.publishedAt ?? article.publishAt;

  const pageId = nodeId(url, "webpage");
  const articleLd = {
    "@type": "Article",
    "@id": nodeId(url, "article"),
    headline: title,
    description,
    inLanguage: locale,
    url,
    mainEntityOfPage: { "@id": pageId },
    datePublished: article.publishedAt ?? article.publishAt,
    dateModified: updatedIso,
    author: { "@id": PERSON_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { path: "/guides", name: tn("guides") },
    ...(hasCategory ? [{ path: guideCategoryPath(article.kind), name: kindLabel }] : []),
    { name: title, id: pageId },
  ]);

  const webPageLd = {
    "@type": "WebPage",
    "@id": pageId,
    url,
    name: title,
    description,
    inLanguage: locale,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@type": "Thing", name: kindLabel },
    mentions: mentionedGpus.map((gpu) => ({
      "@type": "Product",
      name: gpu.name,
      url: `${SITE}/${locale}/gpus/${gpu.slug}`,
    })),
  };

  const faqLd =
    faq.length > 0
      ? {
          "@type": "FAQPage",
          "@id": nodeId(url, "faq"),
          name: `FAQ: ${title}`,
          inLanguage: locale,
          isPartOf: { "@id": pageId },
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  return (
    <div className="container page" data-page="guide">
      <RegisterLocales locales={siblings.length > 0 ? siblings : [locale]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([...siteEntityNodes(), webPageLd, articleLd, crumbLd, faqLd]),
          ),
        }}
      />

      <Breadcrumbs
        label={title}
        parents={hasCategory ? [{ href: guideCategoryPath(article.kind), text: kindLabel }] : undefined}
      />
      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
      {updatedIso ? (
        <p className="meta">
          {kindLabel} · <time dateTime={updatedIso}>{updatedIso.slice(0, 10)}</time>
        </p>
      ) : null}
      <EnrichedImage guideSlug={slug} locale={locale} className="page-visual" />

      <article className="article-body">
        <Markdown source={linkedBody} />
      </article>

      {faq.length > 0 ? (
        <section>
          <h2>FAQ</h2>
          {faq.map((item) => (
            <div key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
      ) : null}

      <RelatedContent items={relatedArticles(locale, slug, article.kind)} />
    </div>
  );
}
