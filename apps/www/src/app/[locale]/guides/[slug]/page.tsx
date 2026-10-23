import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Markdown } from "@/components/Markdown";
import { RelatedContent, relatedArticles } from "@/components/RelatedContent";
import { articleLocales, getArticle, getLiveArticles, localesForSlug } from "@/lib/articles";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { allGpus } from "@/lib/gpus";
import { linkifyMentions } from "@/lib/internal-links";
import { seoMetadata } from "@/lib/seo-messages";

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
  // A guide that names cards ("the 4090 does this at 30 tok/s") is the best inbound link those
  // catalogue pages will ever get, so the first mention of each card becomes one. Capped at
  // three: past that the prose reads as a link farm and the extra edges carry no new signal.
  const linkedBody = linkifyMentions(
    body,
    allGpus().map((gpu) => ({ name: gpu.name, slug: gpu.slug })),
    { limit: 3 },
  );
  const url = `${SITE}/${locale}/guides/${slug}`;
  const tn = await getTranslations({ locale, namespace: "nav" });

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: locale,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: article.publishAt,
    dateModified: article.generatedAt ?? article.publishAt,
    author: { "@type": "Organization", name: "Stratat" },
    publisher: { "@type": "Organization", name: "Stratat", url: SITE },
  };

  // Labels come from `nav.*` so the structured trail matches the visible one in every language.
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { path: "/guides", name: tn("guides") },
    { name: title },
  ]);

  const faqLd =
    faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  const others = articleLocales()
    .filter((code) => code !== locale)
    .map((code) => ({ code, hit: getArticle(code, slug) }))
    .filter((entry) => entry.hit);

  return (
    <div className="container page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      {crumbLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      ) : null}
      {faqLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      ) : null}

      <Breadcrumbs label={title} />
      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
      <EnrichedImage id={`guide-${slug}`} locale={locale} className="page-visual" />

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
