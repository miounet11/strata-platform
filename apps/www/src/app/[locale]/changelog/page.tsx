import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { changelogLead, getChangelog } from "@/lib/changelog";
import { getReleases } from "@/lib/releases";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { seoMetadata } from "@/lib/seo-messages";
import { releasePath } from "@/lib/routes";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const meta = await seoMetadata(locale, "changelog", "/changelog");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      types: { "application/rss+xml": `${site}/changelog/rss.xml` },
    },
  };
}

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");
  const tr = await getTranslations("releases");
  const { items, syncedAt, feedUrl } = getChangelog();
  // The changelog is fed by the GitHub Atom feed, which carries tags the releases index does not
  // have (Atom says `v0.2.1.1`, releases say `v0.2.1`). Trusting the tag alone produced links to
  // two release pages that do not exist, so a row only links to a release that is really there.
  const releaseTags = new Set(getReleases().releases.map((release) => release.tag));

  const pageTitle = t("title");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/changelog", pageTitle, { type: "CollectionPage" })])) }}
      />

      <h1>{t("title")}</h1>
      <p className="page-intro">
        {t("intro")}{" "}
        <a href={feedUrl} rel="noopener noreferrer">
          GitHub Atom
        </a>
      </p>
      <EnrichedImage id="changelog-hero" locale={locale} className="page-visual" />
      <p className="meta">
        {t("synced")} {syncedAt.slice(0, 16).replace("T", " ")} UTC
      </p>
      <ul style={{ listStyle: "none", padding: 0, marginTop: "1.5rem" }}>
        {items.map((item) => {
          const lead = changelogLead(item.summary);
          return (
          <li
            key={item.id}
            style={{
              borderBottom: "1px solid var(--border)",
              padding: "1rem 0",
            }}
          >
            {releaseTags.has(item.tag) ? (
              <Link href={releasePath(item.tag)} style={{ fontWeight: 600 }}>
                {item.title}
              </Link>
            ) : (
              // No release page for this tag: the title stays text and the Atom link below is the
              // place to read it, rather than a 404 that ends the crawl.
              <span style={{ fontWeight: 600 }}>{item.title}</span>
            )}
            <span style={{ color: "var(--muted)", marginLeft: 8 }}>{item.publishedAt.slice(0, 10)}</span>
            {lead ? (
              <p style={{ margin: "0.5rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>{lead}</p>
            ) : null}
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem" }}>
              <a href={item.url} rel="noopener noreferrer">
                {tr("readGithub")}
              </a>
            </p>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
