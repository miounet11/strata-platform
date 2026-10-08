import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CommunityBody } from "@/components/CommunityBody";
import { excerpt, getCommunity, getPull, relatedLinks } from "@/lib/community";
import { siteMetadata } from "@/lib/seo";

export function generateStaticParams() {
  const { pulls } = getCommunity();
  return pulls.map((p) => ({ number: String(p.number) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params;
  const pr = getPull(Number(number));
  if (!pr) return {};
  return siteMetadata(locale, `PR #${pr.number}`, excerpt(pr.body || pr.title), `/pulls/${pr.number}`);
}

export default async function PullDetailPage({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const pr = getPull(Number(number));
  if (!pr) notFound();
  const t = await getTranslations("community");
  const related = relatedLinks(pr);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: pr.title,
    url: pr.htmlUrl,
    datePublished: pr.createdAt,
    dateModified: pr.updatedAt,
    author: { "@type": "Person", name: pr.author },
  };

  return (
    <article className="container" style={{ padding: "2rem 0 3rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p style={{ color: "var(--muted)" }}>
        <Link href="/pulls">{t("pulls")}</Link> / #{pr.number}
      </p>
      <h1>
        #{pr.number} {pr.title}
      </h1>
      <p style={{ color: "var(--muted)" }}>
        {pr.state}
        {pr.mergedAt ? ` · merged ${pr.mergedAt.slice(0, 10)}` : ""}
        {pr.draft ? " · draft" : ""} · @{pr.author} · {pr.comments} {t("comments")} ·{" "}
        <a href={pr.htmlUrl} rel="noopener noreferrer">
          {t("onGithub")}
        </a>
      </p>
      {pr.labels.length > 0 ? (
        <p style={{ marginTop: "0.75rem" }}>
          {pr.labels.map((l) => (
            <Link
              key={l.name}
              href={`/community/labels/${("slug" in l && l.slug) || l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
              className="badge"
              style={{ marginRight: "0.35rem" }}
            >
              {l.name}
            </Link>
          ))}
        </p>
      ) : null}
      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("description")}</h2>
        <CommunityBody body={pr.body} />
      </section>
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h3>{t("relatedOnSite")}</h3>
        <ul>
          {related.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 0 }}>{t("relatedHint")}</p>
      </section>
    </article>
  );
}
