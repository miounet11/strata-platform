import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { articleLocales, getArticle, getLiveArticles, localesForSlug } from "@/lib/articles";
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

/**
 * The generator emits a narrow markdown subset: `##` headings, pipe tables, `-` lists and
 * paragraphs. Rendering that directly keeps the content readable without pulling a parser in.
 */
function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim().length > 0);
        if (lines.length === 0) return null;

        if (lines[0].startsWith("## ")) {
          return (
            <section key={index}>
              <h2>{lines[0].slice(3).trim()}</h2>
              <Markdown source={lines.slice(1).join("\n")} />
            </section>
          );
        }
        if (lines.every((line) => line.trim().startsWith("|"))) {
          const rows = lines
            .filter((line) => !/^\|[\s:|-]+\|$/.test(line.trim()))
            .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
          const [head, ...body] = rows;
          return (
            <table key={index}>
              <thead>
                <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (lines.every((line) => /^[-*]\s/.test(line.trim()))) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{line.trim().replace(/^[-*]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{lines.join(" ")}</p>;
      })}
    </>
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
  const url = `${SITE}/${locale}/guides/${slug}`;

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
      {faqLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      ) : null}

      <p className="meta">
        <Link href="/topics">Guides</Link>
      </p>
      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
      <EnrichedImage id={`guide-${slug}`} locale={locale} className="page-visual" />

      <article className="article-body">
        <Markdown source={body} />
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
    </div>
  );
}
