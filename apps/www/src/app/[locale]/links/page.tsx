import { getTranslations, setRequestLocale } from "next-intl/server";
import linksData from "@/data/friendly-links.json";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { seoMetadata } from "@/lib/seo-messages";

function loc(locale: string, record: Record<string, string>): string {
  return record[locale] ?? record.en ?? "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "links", "/links");
}

export default async function LinksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("links");

  return (
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <EnrichedImage id="links-hero" locale={locale} className="page-visual" />

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("reciprocal")}</h2>
        <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
          {linksData.reciprocal.map((item) => (
            <li key={item.id} className="card">
              <a href={item.url} rel={item.rel === "author" ? "me noopener noreferrer" : "noopener noreferrer"}>
                <strong>{item.name}</strong>
              </a>
              <p className="meta" style={{ margin: "0.5rem 0 0" }}>
                {loc(locale, item.description)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("friends")}</h2>
        <ul style={{ lineHeight: 1.8 }}>
          {linksData.friends.map((item) => (
            <li key={item.url}>
              <a href={item.url} rel="friend noopener noreferrer">
                {item.name}
              </a>
              <span className="meta"> — {loc(locale, item.description)}</span>
            </li>
          ))}
        </ul>
        <p className="meta" style={{ marginTop: "1rem" }}>{t("jevcodeNote")}</p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("linkToUs")}</h2>
        <p>{t("linkToUsHint")}</p>
        <pre className="copy-block">
          {linksData.linkToUs.markdown[locale as keyof typeof linksData.linkToUs.markdown] ??
            linksData.linkToUs.markdown.en}
        </pre>
      </section>
    </div>
  );
}
