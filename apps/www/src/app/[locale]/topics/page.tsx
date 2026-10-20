import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getLiveTopics, topicText } from "@/lib/topics";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "topics" });
  return siteMetadata(locale, t("title"), t("intro"), "/topics");
}

export default async function TopicsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("topics");
  const topics = getLiveTopics();

  return (
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
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
