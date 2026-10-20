import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity } from "@/lib/community";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(
    locale,
    "GitHub Issues",
    "All Strata engine issues — troubleshooting, features, and community reports.",
    "/issues",
  );
}

export default async function IssuesListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");
  const { issues } = getCommunity();
  const sorted = [...issues].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="container page">
      <h1>{t("issuesTitle")}</h1>
      <p className="page-intro">
        <Link href="/community">{t("hub")}</Link> · {issues.length} {t("items")}
      </p>
      <ul className="list-plain" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {sorted.map((issue) => (
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
    </div>
  );
}
