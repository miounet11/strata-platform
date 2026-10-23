import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity } from "@/lib/community";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "community", "/community");
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

  const pageTitle = t("hubTitle");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/community", pageTitle, { type: "CollectionPage" })])) }}
      />

      <h1>{t("hubTitle")}</h1>
      <p className="page-intro">
        {t("hubIntro")}{" "}
        <a href={repo} rel="noopener noreferrer">
          github.com/Niko1221/Strata
        </a>
        . {t("synced")} {syncedAt.slice(0, 10)}.
      </p>
      <EnrichedImage id="community-hero" locale={locale} className="page-visual" />
      <div className="grid-3">
        <Link href="/issues" className="card">
          <h3>{t("issues")}</h3>
          <p>
            {counts.issues} {t("items")}
          </p>
        </Link>
        <Link href="/pulls" className="card">
          <h3>{t("pulls")}</h3>
          <p>
            {counts.pulls} {t("items")}
          </p>
        </Link>
        <Link href="/community/labels" className="card">
          <h3>{t("labels")}</h3>
          <p>
            {counts.labels} {t("topics")}
          </p>
        </Link>
      </div>
      <section className="section">
        <h2>{t("whyMirror")}</h2>
        <ul style={{ color: "var(--muted)", lineHeight: 1.8 }}>
          <li>{t("why1")}</li>
          <li>{t("why2")}</li>
          <li>{t("why3")}</li>
        </ul>
      </section>
    </div>
  );
}
