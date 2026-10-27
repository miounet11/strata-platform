import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity, getIssue, getLabel, getPull } from "@/lib/community";
import { LISTED } from "@/lib/page-budget";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE, siteMetadata } from "@/lib/seo";

export function generateStaticParams() {
  const { labels } = getCommunity();
  return labels.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const label = getLabel(slug);
  if (!label) return {};
  return siteMetadata(
    locale,
    `Label: ${label.name}`,
    label.description || `Strata issues and pull requests tagged ${label.name}.`,
    `/community/labels/${label.slug}`,
  );
}

export default async function LabelDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const label = getLabel(slug);
  if (!label) notFound();
  const t = await getTranslations("community");
  // One label can hold 1,600+ entries; listing them all made this page 870 KB. The newest
  // LISTED of each kind stay here and the rest are one GitHub search away — every entry still
  // has its own detail page in the sitemap, so nothing becomes unreachable for a crawler.
  const byUpdate = (a: { updatedAt: string }, b: { updatedAt: string }) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  const labelIssues = label.issues
    .flatMap((n) => getIssue(n) ?? [])
    .sort(byUpdate)
    .slice(0, LISTED);
  const labelPulls = label.pulls
    .flatMap((n) => getPull(n) ?? [])
    .sort(byUpdate)
    .slice(0, LISTED);
  const githubLabel = `${getCommunity().repo}/issues?q=label%3A%22${encodeURIComponent(label.name)}%22`;

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(SITE, locale, `/community/labels/${label.slug}`, `Label: ${label.name}`, {
                description: label.description || undefined,
                type: "CollectionPage",
              }),
            ]),
          ),
        }}
      />
      <p style={{ color: "var(--muted)" }}>
        <Link href="/community/labels">{t("labels")}</Link> / {label.name}
      </p>
      <h1>{label.name}</h1>
      {label.description ? <p style={{ color: "var(--muted)" }}>{label.description}</p> : null}
      {label.issues.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("issues")}</h2>
          <ul>
            {labelIssues.map((issue) => (
              <li key={issue.number}>
                <Link href={`/issues/${issue.number}`}>
                  #{issue.number} {issue.title}
                </Link>
              </li>
            ))}
          </ul>
          {label.issues.length > labelIssues.length ? (
            <p className="meta">
              {t("showingNewest", { shown: labelIssues.length, total: label.issues.length })}
            </p>
          ) : null}
        </section>
      ) : null}
      {label.pulls.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("pulls")}</h2>
          <ul>
            {labelPulls.map((pr) => (
              <li key={pr.number}>
                <Link href={`/pulls/${pr.number}`}>
                  #{pr.number} {pr.title}
                </Link>
              </li>
            ))}
          </ul>
          {label.pulls.length > labelPulls.length ? (
            <p className="meta">
              {t("showingNewest", { shown: labelPulls.length, total: label.pulls.length })} ·{" "}
              <a href={githubLabel} rel="noopener noreferrer">
                {t("seeAllOnGithub", { total: label.issues.length + label.pulls.length })}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
