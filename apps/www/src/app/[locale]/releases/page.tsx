import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getReleases, releaseLead } from "@/lib/releases";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tag = getReleases().releases[0]?.tag ?? "v0.1.40.3";
  return siteMetadata(locale, "Releases", `Strata engine release notes from ${tag} back.`, "/releases");
}

export default async function ReleasesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("releases");
  const releasesData = getReleases();
  const { releases } = releasesData;

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <p style={{ color: "var(--muted)" }}>
        Synced {releasesData.syncedAt.slice(0, 10)} · {releases.length} versions
        {releases[0] ? ` · ${t("latest")} ${releases[0].tag}` : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1.5rem" }}>
        {releases.map((release, index) => (
          <article key={release.tag} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
                <Link href={`/releases/${release.tag}`}>{release.name}</Link>{" "}
                {index === 0 ? <span className="badge">{t("latest")}</span> : null}
              </h2>
              <time dateTime={release.publishedAt} style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                {release.publishedAt?.slice(0, 10)}
              </time>
            </div>
            <p style={{ color: "var(--muted)" }}>{releaseLead(release.body ?? "")}</p>
            <p style={{ margin: "0.75rem 0 0" }}>
              <Link href={`/releases/${release.tag}`}>{t("notes")}</Link>
              {" · "}
              <a href={release.url} rel="noopener noreferrer">
                {t("readGithub")}
              </a>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
