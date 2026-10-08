import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { engineVariantLabel } from "@/lib/downloads";
import { getRelease, getReleases, releaseLead } from "@/lib/releases";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

export function generateStaticParams() {
  return getReleases().releases.map((release) => ({ tag: release.tag }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; tag: string }>;
}) {
  const { locale, tag } = await params;
  const release = getRelease(tag);
  if (!release) return {};
  const description = releaseLead(release.body ?? "", 160) || `${release.name} release notes.`;
  return siteMetadata(locale, release.name, description, `/releases/${release.tag}`);
}

export default async function ReleaseVersionPage({
  params,
}: {
  params: Promise<{ locale: string; tag: string }>;
}) {
  const { locale, tag } = await params;
  setRequestLocale(locale);
  const release = getRelease(tag);
  if (!release) notFound();
  const t = await getTranslations("releases");
  const releases = getReleases().releases;
  const index = releases.findIndex((item) => item.tag === release.tag);
  const newer = index > 0 ? releases[index - 1] : null;
  const older = index >= 0 && index < releases.length - 1 ? releases[index + 1] : null;
  const assets = release.assets ?? [];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Strata",
    softwareVersion: release.tag.replace(/^v/i, ""),
    datePublished: release.publishedAt,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, Linux",
    description: releaseLead(release.body ?? "", 280),
    url: `${site}/${locale}/releases/${release.tag}`,
    downloadUrl: release.url,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <article className="container" style={{ padding: "2rem 0 3rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p style={{ color: "var(--muted)" }}>
        <Link href="/releases">{t("title")}</Link>
        {" / "}
        {release.tag}
      </p>
      <h1 style={{ marginBottom: "0.4rem" }}>
        {release.name} {index === 0 ? <span className="badge">{t("latest")}</span> : null}
      </h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        <time dateTime={release.publishedAt}>{release.publishedAt.slice(0, 10)}</time>
      </p>
      {assets.length > 0 ? (
        <section>
          <h2>{t("downloads")}</h2>
          <ul style={{ margin: "0.5rem 0 1rem", paddingLeft: "1.2rem" }}>
            {assets.map((asset) => (
              <li key={asset.name}>
                <a href={asset.downloadUrl} rel="noopener noreferrer">
                  {engineVariantLabel(asset.name)}
                </a>{" "}
                ({Math.round(asset.size / 1024 / 1024)} MiB)
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2>{t("notes")}</h2>
        <ReleaseNotes body={release.body ?? ""} />
      </section>
      <p style={{ marginTop: "1.25rem" }}>
        <a href={release.url} rel="noopener noreferrer">
          {t("readGithub")}
        </a>
      </p>
      <p style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {newer ? <Link href={`/releases/${newer.tag}`}>{t("newer")}: {newer.tag}</Link> : null}
        {older ? <Link href={`/releases/${older.tag}`}>{t("older")}: {older.tag}</Link> : null}
      </p>
    </article>
  );
}
