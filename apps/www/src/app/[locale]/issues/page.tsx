import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity } from "@/lib/community";
import { LISTED } from "@/lib/page-budget";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "issues", "/issues");
}

export default async function IssuesListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");
  const { issues, repo } = getCommunity();
  const sorted = [...issues].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const shown = sorted.slice(0, LISTED);

  const pageTitle = t("issuesTitle");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/issues", pageTitle, { type: "CollectionPage" })])) }}
      />

      <h1>{t("issuesTitle")}</h1>
      <p className="page-intro">
        <Link href="/community">{t("hub")}</Link> · {issues.length} {t("items")}
      </p>
      <ul className="list-plain" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {shown.map((issue) => (
          <li key={issue.number} className="card" style={{ padding: "0.85rem 1rem" }}>
            <Link href={`/issues/${issue.number}`} style={{ color: "inherit", fontWeight: 600 }}>
              {issue.title}
            </Link>
            <div className="meta" style={{ marginTop: "0.35rem" }}>
              <span className="badge">{issue.state}</span> · @{issue.author} · {issue.comments}{" "}
              {t("comments")} · {issue.updatedAt.slice(0, 10)}
            </div>
          </li>
        ))}
      </ul>
      {sorted.length > shown.length ? (
        <p className="meta" style={{ marginTop: "1.25rem" }}>
          {t("showingNewest", { shown: shown.length, total: sorted.length })} ·{" "}
          <a href={`${repo}/issues`} rel="noopener noreferrer">
            {t("seeAllOnGithub", { total: sorted.length })}
          </a>
        </p>
      ) : null}
    </div>
  );
}
