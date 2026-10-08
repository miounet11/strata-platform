import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCommunity, getIssue, getLabel, getPull } from "@/lib/community";
import { siteMetadata } from "@/lib/seo";

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

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <p style={{ color: "var(--muted)" }}>
        <Link href="/community/labels">{t("labels")}</Link> / {label.name}
      </p>
      <h1>{label.name}</h1>
      {label.description ? <p style={{ color: "var(--muted)" }}>{label.description}</p> : null}
      {label.issues.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("issues")}</h2>
          <ul>
            {label.issues.map((n) => {
              const issue = getIssue(n);
              if (!issue) return null;
              return (
                <li key={n}>
                  <Link href={`/issues/${n}`}>
                    #{n} {issue.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {label.pulls.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("pulls")}</h2>
          <ul>
            {label.pulls.map((n) => {
              const pr = getPull(n);
              if (!pr) return null;
              return (
                <li key={n}>
                  <Link href={`/pulls/${n}`}>
                    #{n} {pr.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
