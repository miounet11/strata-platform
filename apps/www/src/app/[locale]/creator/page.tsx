import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCreatorPulse, postExcerpt, postHeadline } from "@/lib/creator";
import { jsonLdGraph } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { EnrichedImage } from "@/components/EnrichedBlock";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "creator", "/creator");
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("creator");
  const { profile, posts, interactions, syncedAt } = getCreatorPulse();

  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE}/${locale}/creator#person`,
    name: profile.name,
    url: profile.xUrl,
    sameAs: [profile.xUrl, profile.github, profile.strataRepo, profile.telegram],
    jobTitle: "Strata engine author",
  };

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([personLd])) }}
      />
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <EnrichedImage id="creator-hero" locale={locale} className="page-visual" />
      <div className="hero-actions" style={{ marginTop: "1rem" }}>
        <a className="btn btn-primary" href={profile.xUrl} rel="me noopener noreferrer">
          @coldniko
        </a>
        <a className="btn" href={profile.strataRepo} rel="noopener noreferrer">
          GitHub Strata
        </a>
        <a className="btn" href={profile.telegram} rel="noopener noreferrer">
          Telegram
        </a>
        <Link href="/links" className="btn">
          {t("friendLinks")}
        </Link>
      </div>
      <p className="meta" style={{ marginTop: "1rem" }}>
        {t("synced")} {syncedAt.slice(0, 16).replace("T", " ")} UTC
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>{t("posts")}</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {posts.map((post) => (
            <li key={post.id} className="card" style={{ padding: "1rem" }}>
              <Link href={`/creator/updates/${post.id}`} style={{ fontWeight: 600, color: "inherit" }}>
                {postHeadline(post.title)}
              </Link>
              {postExcerpt(post.title, post.body) ? (
                <p className="meta" style={{ margin: "0.5rem 0" }}>
                  {postExcerpt(post.title, post.body)}
                </p>
              ) : null}
              <div className="meta" style={{ marginTop: "0.5rem" }}>
                {post.publishedAt.slice(0, 10)} ·{" "}
                {post.tags.map((tag) => (
                  <span key={tag} className="badge" style={{ marginRight: "0.25rem" }}>
                    {tag}
                  </span>
                ))}{" "}
                <a href={post.url} rel="noopener noreferrer">
                  {t("onX")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {interactions.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <h2>{t("interactions")}</h2>
          <ul style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            {interactions.map((item) => (
              <li key={item.id}>
                <strong style={{ color: "var(--text)" }}>{postHeadline(item.title, 120)}</strong>
                {postExcerpt(item.title, item.body, 180) ? ` — ${postExcerpt(item.title, item.body, 180)}` : ""}{" "}
                {item.relatedUrl ? (
                  <a href={item.relatedUrl} rel="noopener noreferrer">
                    source
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
