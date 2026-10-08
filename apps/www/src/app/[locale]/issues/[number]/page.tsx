import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { CommunityBody } from "@/components/CommunityBody";
import { excerpt, getCommunity, getIssue, relatedLinks } from "@/lib/community";
import { siteMetadata } from "@/lib/seo";

export function generateStaticParams() {
  const { issues } = getCommunity();
  return issues.map((i) => ({ number: String(i.number) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params;
  const issue = getIssue(Number(number));
  if (!issue) return {};
  return siteMetadata(locale, `Issue #${issue.number}`, excerpt(issue.body || issue.title), `/issues/${issue.number}`);
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ locale: string; number: string }>;
}) {
  const { locale, number } = await params;
  setRequestLocale(locale);
  const issue = getIssue(Number(number));
  if (!issue) notFound();
  const t = await getTranslations("community");
  const related = relatedLinks(issue);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: issue.title,
    url: issue.htmlUrl,
    datePublished: issue.createdAt,
    dateModified: issue.updatedAt,
    author: { "@type": "Person", name: issue.author },
  };

  return (
    <article className="container" style={{ padding: "2rem 0 3rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p style={{ color: "var(--muted)" }}>
        <Link href="/issues">{t("issues")}</Link> / #{issue.number}
      </p>
      <h1>
        #{issue.number} {issue.title}
      </h1>
      <EnrichedImage id={`issue-${issue.number}`} locale={locale} />
      <p style={{ color: "var(--muted)" }}>
        {issue.state} · @{issue.author} · {issue.comments} {t("comments")} ·{" "}
        <a href={issue.htmlUrl} rel="noopener noreferrer">
          {t("onGithub")}
        </a>
      </p>
      {issue.labels.length > 0 ? (
        <p style={{ marginTop: "0.75rem" }}>
          {issue.labels.map((l) => (
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
        <CommunityBody body={issue.body} />
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
