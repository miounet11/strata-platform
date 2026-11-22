import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { SCENARIOS, scenarioRigs } from "@/lib/scenarios";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "best", "/best");
}

/**
 * The scenario index. Each entry states what it ranks by and how many machines qualify, so the
 * page carries the answer a reader is looking for (a defensible short list) rather than only a
 * menu of links.
 */
export default async function BestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("best");
  const items = await getTranslations("scenarios.items");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              ...siteEntityNodes(),
              pageLd(SITE, locale, "/best", t("title"), {
                description: t("intro"),
                type: "CollectionPage",
              }),
            ]),
          ),
        }}
      />

      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>

      <ul className="grid-2" style={{ listStyle: "none", padding: 0 }}>
        {SCENARIOS.map((scenario) => {
          const rigs = scenarioRigs(scenario);
          return (
            <li key={scenario.slug} className="card">
              <h2 style={{ fontSize: "1.15rem", margin: "0 0 0.5rem" }}>
                <Link href={`/best/${scenario.slug}`}>{items(`${scenario.key}.title`)}</Link>
              </h2>
              {/* The count is the list's own size, read from the data, so the index cannot
                  promise a short list the detail page does not have. */}
              <p className="meta" style={{ margin: 0 }}>
                {t("count", { count: rigs.length })} · {items(`${scenario.key}.rule`)}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="meta" style={{ marginTop: "2rem" }}>
        {t("methodNote")} <Link href="/method">{t("methodLink")}</Link>
      </p>
    </div>
  );
}
