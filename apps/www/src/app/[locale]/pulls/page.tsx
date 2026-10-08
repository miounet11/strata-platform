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
    "Pull requests",
    "Strata engine pull requests — perf, fixes, docs, and community benchmarks.",
    "/pulls",
  );
}

export default async function PullsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");
  const { pulls } = getCommunity();
  const sorted = [...pulls].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("pullsTitle")}</h1>
      <p style={{ color: "var(--muted)" }}>
        <Link href="/community">{t("hub")}</Link> · {pulls.length} {t("items")}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "1.5rem 0 0", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {sorted.map((pr) => (
          <li key={pr.number} className="card" style={{ padding: "0.85rem 1rem" }}>
            <Link href={`/pulls/${pr.number}`} style={{ color: "inherit", fontWeight: 600 }}>
              #{pr.number} {pr.title}
            </Link>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.35rem" }}>
              <span className="badge">{pr.state}{pr.draft ? " draft" : ""}</span> · @{pr.author} ·{" "}
              {pr.comments} {t("comments")} · {pr.updatedAt.slice(0, 10)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
