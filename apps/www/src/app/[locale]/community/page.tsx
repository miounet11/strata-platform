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
    "Community hub",
    "Strata GitHub issues, pull requests, and labels — mirrored for search and local AI docs.",
    "/community",
  );
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");
  const { counts, syncedAt, repo } = getCommunity();

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("hubTitle")}</h1>
      <p style={{ color: "var(--muted)", maxWidth: "42rem" }}>
        {t("hubIntro")}{" "}
        <a href={repo} rel="noopener noreferrer">
          github.com/Niko1221/Strata
        </a>
        . {t("synced")} {syncedAt.slice(0, 10)}.
      </p>
      <div className="grid-3" style={{ marginTop: "1.5rem" }}>
        <Link href="/issues" className="card" style={{ display: "block", color: "inherit" }}>
          <h3>{t("issues")}</h3>
          <p>{counts.issues} {t("items")}</p>
        </Link>
        <Link href="/pulls" className="card" style={{ display: "block", color: "inherit" }}>
          <h3>{t("pulls")}</h3>
          <p>{counts.pulls} {t("items")}</p>
        </Link>
        <Link href="/community/labels" className="card" style={{ display: "block", color: "inherit" }}>
          <h3>{t("labels")}</h3>
          <p>{counts.labels} {t("topics")}</p>
        </Link>
      </div>
      <section style={{ marginTop: "2rem" }}>
        <h2>{t("whyMirror")}</h2>
        <ul style={{ color: "var(--muted)", lineHeight: 1.7 }}>
          <li>{t("why1")}</li>
          <li>{t("why2")}</li>
          <li>{t("why3")}</li>
        </ul>
      </section>
    </div>
  );
}
