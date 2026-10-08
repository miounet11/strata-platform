import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCreatorPulse, postExcerpt, postHeadline } from "@/lib/creator";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(
    locale,
    "From Niko Veit",
    "Posts and ecosystem interactions from @coldniko — Strata creator. CN, JP, and global audiences.",
    "/creator",
  );
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
    name: profile.name,
    url: profile.xUrl,
    sameAs: [profile.xUrl, profile.github, profile.strataRepo, profile.telegram],
    jobTitle: "Strata engine author",
  };

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }} />
      <h1>{t("title")}</h1>
      <p style={{ color: "var(--muted)", maxWidth: "44rem" }}>{t("intro")}</p>
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
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "1rem" }}>
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
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0.5rem 0" }}>
                  {postExcerpt(post.title, post.body)}
                </p>
              ) : null}
              <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.5rem" }}>
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
