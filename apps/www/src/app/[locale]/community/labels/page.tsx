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
  return siteMetadata(locale, "Labels", "Browse Strata issues and PRs by GitHub label.", "/community/labels");
}

export default async function LabelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");
  const { labels } = getCommunity();

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("labelsTitle")}</h1>
      <p style={{ color: "var(--muted)" }}>
        <Link href="/community">{t("hub")}</Link>
      </p>
      <ul style={{ columns: "2 280px", gap: "1rem", marginTop: "1.5rem", paddingLeft: "1.2rem" }}>
        {labels.map((l) => (
          <li key={l.slug} style={{ breakInside: "avoid", marginBottom: "0.5rem" }}>
            <Link href={`/community/labels/${l.slug}`}>{l.name}</Link>
            <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              {" "}
              ({l.issues.length + l.pulls.length})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
