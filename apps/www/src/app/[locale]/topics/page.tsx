import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLiveTopics, topicText } from "@/lib/topics";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "topics", "/topics");
}

export default async function TopicsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("topics");
  const topics = getLiveTopics(locale);

  const pageTitle = t("title");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/topics", pageTitle, { type: "CollectionPage" })])) }}
      />

      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <EnrichedImage id="topics-hero" locale={locale} className="page-visual" />
      <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
        {topics.map((topic) => (
          <li key={topic.slug} className="card">
            <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.5rem" }}>
              <Link href={`/topics/${topic.slug}`}>{topicText(topic.title, locale)}</Link>
            </h2>
            <p className="meta" style={{ margin: 0 }}>
              {topicText(topic.body, locale)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
