import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity } from "@/lib/community";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "pulls", "/pulls");
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

  const pageTitle = t("pullsTitle");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/pulls", pageTitle, { type: "CollectionPage" })])) }}
      />

      <h1>{t("pullsTitle")}</h1>
      <p className="page-intro">
        <Link href="/community">{t("hub")}</Link> · {pulls.length} {t("items")}
      </p>
      <ul className="list-plain" style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {sorted.map((pr) => (
          <li key={pr.number} className="card" style={{ padding: "0.85rem 1rem" }}>
            <Link href={`/pulls/${pr.number}`} style={{ color: "inherit", fontWeight: 600 }}>
              {pr.title}
            </Link>
            <div className="meta" style={{ marginTop: "0.35rem" }}>
              <span className="badge">{pr.state}{pr.draft ? " draft" : ""}</span> · @{pr.author} ·{" "}
              {pr.comments} {t("comments")} · {pr.updatedAt.slice(0, 10)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
