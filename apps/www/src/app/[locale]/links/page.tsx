import { getTranslations, setRequestLocale } from "next-intl/server";
import linksData from "@/data/friendly-links.json";
import { siteMetadata } from "@/lib/seo";

type LocaleKey = "en" | "zh" | "ja";

function loc(locale: string, record: Record<string, string>): string {
  const key = (["en", "zh", "ja"].includes(locale) ? locale : "en") as LocaleKey;
  return record[key] ?? record.en;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Friendly links", "Reciprocal links — Strata, creator, JevCode, Clavue, and partners.", "/links");
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
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <p style={{ color: "var(--muted)", maxWidth: "42rem" }}>{t("intro")}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("reciprocal")}</h2>
        <ul className="grid-3" style={{ listStyle: "none", padding: 0 }}>
          {linksData.reciprocal.map((item) => (
            <li key={item.id} className="card">
              <a href={item.url} rel={item.rel === "author" ? "me noopener noreferrer" : "noopener noreferrer"}>
                <strong>{item.name}</strong>
              </a>
              <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.5rem 0 0" }}>
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
              <span style={{ color: "var(--muted)" }}> — {loc(locale, item.description)}</span>
            </li>
          ))}
        </ul>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "1rem" }}>{t("jevcodeNote")}</p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("linkToUs")}</h2>
        <p>{t("linkToUsHint")}</p>
        <pre className="copy-block">{linksData.linkToUs.markdown}</pre>
        <pre className="copy-block">{linksData.linkToUs.markdownZh}</pre>
        <pre className="copy-block">{linksData.linkToUs.markdownJa}</pre>
      </section>
    </div>
  );
}
