import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getLiveTopics, getTopic, hasTopic, rigsForTopic, topicText } from "@/lib/topics";
import { seoMetadata } from "@/lib/seo-messages";

export function generateStaticParams() {
  // Editorial topics differ per locale, so only build the pairs that exist.
  return routing.locales.flatMap((locale) =>
    getLiveTopics(locale).map((topic) => ({ locale, slug: topic.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const topic = getTopic(slug);
  if (!topic || topic.status !== "live" || !hasTopic(topic, locale)) return {};
  const title = topicText(topic.title, locale);
  const description = topicText(topic.body, locale).slice(0, 180);
  const siblings = routing.locales.filter((code) => hasTopic(topic, code));
  return seoMetadata(locale, "topics", `/topics/${topic.slug}`, true, title, description, siblings);
}

function TopicHref({ href, children }: { href: string; children: string }) {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return (
      <a href={href} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <Link href={href}>{children}</Link>;
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const topic = getTopic(slug);
  if (!topic || topic.status !== "live" || !hasTopic(topic, locale)) notFound();
  const t = await getTranslations("topics");
  const title = topicText(topic.title, locale);
  const body = topicText(topic.body, locale);
  const rigs = rigsForTopic(topic);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description: body,
    url: `https://www.stratat.com/${locale}/topics/${topic.slug}`,
    isPartOf: { "@type": "WebSite", name: "Strata", url: "https://www.stratat.com" },
  };

  return (
    <div className="container page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="meta">
        <Link href="/topics">{t("title")}</Link>
      </p>
      <h1>{title}</h1>
      <p className="page-intro">{body}</p>
      {topic.links && topic.links.length > 0 ? (
        <ul>
          {topic.links.map((item) => (
            <li key={item.href}>
              <TopicHref href={item.href}>{topicText(item.label, locale) || item.href}</TopicHref>
            </li>
          ))}
        </ul>
      ) : null}
      {topic.filter ? (
        <section style={{ marginTop: "2rem" }}>
          <h2>{t("rigs")}</h2>
          {rigs.length === 0 ? <p className="meta">{t("emptyRigs")}</p> : null}
          <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
            {rigs.map((rig) => (
              <li key={rig.id} className="card">
                <Link href={`/benchmarks/${rig.id}`}>
                  <strong>{rig.name}</strong>
                </Link>
                <p className="meta" style={{ margin: "0.5rem 0 0" }}>
                  {rig.memory} GB · {rig.fit}
                </p>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/benchmarks">{t("openBench")}</Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
