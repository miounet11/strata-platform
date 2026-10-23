import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCreatorPost, getCreatorPulse, postExcerpt, postHeadline } from "@/lib/creator";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { SITE, siteMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return getCreatorPulse().posts.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const post = getCreatorPost(id);
  if (!post) return {};
  return siteMetadata(
    locale,
    postHeadline(post.title, 60),
    postExcerpt(post.title, post.body, 160) || postHeadline(post.title, 160),
    `/creator/updates/${post.id}`,
  );
}

export default async function CreatorUpdatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const post = getCreatorPost(id);
  if (!post) notFound();
  const t = await getTranslations("creator");
  const path = `/creator/updates/${post.id}`;
  const headline = postHeadline(post.title, 180);
  const excerpt = postExcerpt(post.title, post.body, 160);

  return (
    <article className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(SITE, locale, path, headline, { description: excerpt }),
              {
                "@type": "SocialMediaPosting",
                "@id": nodeId(`${SITE}/${locale}${path}`, "posting"),
                headline,
                ...(excerpt ? { description: excerpt } : {}),
                datePublished: post.publishedAt,
                url: post.url,
                inLanguage: locale,
                author: { "@type": "Person", name: "Strata" },
              },
            ]),
          ),
        }}
      />
      <p style={{ color: "var(--muted)" }}>
        <Link href="/creator">{t("title")}</Link> / {post.publishedAt.slice(0, 10)}
      </p>
      <h1>{postHeadline(post.title, 180)}</h1>
      <p style={{ color: "var(--muted)" }}>
        <a href={post.url} rel="me noopener noreferrer">
          {t("onX")}
        </a>
      </p>
      {postExcerpt(post.title, post.body, 8000) || post.body.length > 180 ? (
        <pre className="copy-block">{post.body}</pre>
      ) : null}
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>{t("relatedSoftware")}</h2>
        <ul>
          <li>
            <Link href="/install">{t("install")}</Link>
          </li>
          <li>
            <Link href="/download">{t("desktop")}</Link>
          </li>
          <li>
            <Link href="/releases">{t("releases")}</Link>
          </li>
          <li>
            <Link href="/models">{t("models")}</Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
