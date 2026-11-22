import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { getBenchmarks } from "@/lib/benchmarks";
import { jsonLdGraph, nodeId } from "@/lib/jsonld";
import { formatNumber } from "@/lib/locale";
import { rigPath } from "@/lib/routes";
import { SCENARIOS, getScenario, scenarioRigs } from "@/lib/scenarios";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { ORG_ID, siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export function generateStaticParams() {
  return SCENARIOS.map((scenario) => ({ slug: scenario.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const scenario = getScenario(slug);
  if (!scenario) return {};
  const items = await getTranslations({ locale, namespace: "scenarios.items" });
  return seoMetadata(
    locale,
    "best",
    `/best/${slug}`,
    true,
    items(`${scenario.key}.seoTitle`),
    items(`${scenario.key}.seoDescription`),
  );
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const scenario = getScenario(slug);
  if (!scenario) notFound();

  const t = await getTranslations("best");
  const items = await getTranslations("scenarios.items");
  const tb = await getTranslations("benchmarks");
  const tnav = await getTranslations("nav");
  const data = getBenchmarks();
  const rigs = scenarioRigs(scenario);
  const winner = rigs[0];

  const url = `${SITE}/${locale}/best/${scenario.slug}`;
  const pageId = nodeId(url, "webpage");
  const title = items(`${scenario.key}.title`);

  const listLd = {
    "@type": "ItemList",
    "@id": nodeId(url, "list"),
    name: title,
    description: items(`${scenario.key}.summary`),
    numberOfItems: rigs.length,
    inLanguage: locale,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: rigs.map((rig, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: rig.name,
      url: `${SITE}/${locale}${rigPath(rig.id)}`,
    })),
  };

  const pageNode = {
    "@type": "WebPage",
    "@id": pageId,
    url,
    name: title,
    description: items(`${scenario.key}.summary`),
    inLanguage: locale,
    isPartOf: { "@id": `${SITE}/#website` },
    publisher: { "@id": ORG_ID },
    isBasedOn: { "@id": `${SITE}/${locale}/benchmarks#dataset` },
    about: { "@type": "Thing", name: items(`${scenario.key}.about`) },
  };

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tnav("home") },
    { path: "/best", name: t("title") },
    { name: title, id: pageId },
  ]);

  const faqEntries = [
    ...(winner
      ? [
          {
            q: t("faqTopPickQ", { title }),
            a: t("faqTopPickA", {
              name: winner.name,
              write: formatNumber(winner.writingToks, locale),
              memory: winner.memory,
              cost: winner.localCostPerMM != null ? `$${winner.localCostPerMM.toFixed(3)}` : "—",
              days:
                winner.breakEvenDays != null
                  ? `${formatNumber(winner.breakEvenDays, locale)} ${tb("daysShort")}`
                  : "—",
            }),
          },
        ]
      : []),
    {
      q: t("faqWhyCount", { count: rigs.length }),
      a: t("faqWhyCountAnswer"),
    },
    {
      q: t("faqWhereData"),
      a: t("faqWhereDataAnswer", {
        source: data.source.name,
        date: data.syncedAt.slice(0, 10),
      }),
    },
  ];

  const faqLd = {
    "@type": "FAQPage",
    "@id": nodeId(url, "faq"),
    inLanguage: locale,
    isPartOf: { "@id": pageId },
    mainEntity: faqEntries.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const otherScenarios = SCENARIOS.filter((s) => s.slug !== scenario.slug);

  return (
    <div className="container container-wide page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, listLd, faqLd, crumbLd])),
        }}
      />
      <Breadcrumbs label={title} />

      <h1>{title}</h1>
      <p className="page-intro">{items(`${scenario.key}.summary`)}</p>
      <p className="meta">
        {items(`${scenario.key}.rule`)} · {t("synced", { date: data.syncedAt.slice(0, 10) })}
      </p>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{tb("colHardware")}</th>
              <th scope="col">{tb("colMemory")}</th>
              <th scope="col">{tb("colReading")}</th>
              <th scope="col">{tb("colWriting")}</th>
              <th scope="col">{tb("colPower")}</th>
              <th scope="col">{tb("colRig")}</th>
              <th scope="col">{tb("colLocal")}</th>
              <th scope="col">{tb("colBreakEven")}</th>
            </tr>
          </thead>
          <tbody>
            {rigs.map((rig, index) => (
              <tr key={rig.id}>
                <td>{index + 1}</td>
                <th scope="row" style={{ textAlign: "left" }}>
                  <Link href={rigPath(rig.id)}>{rig.name}</Link>
                </th>
                <td>{rig.memory} GB</td>
                <td>{formatNumber(Math.round(rig.readingToks), locale)}</td>
                <td>{formatNumber(rig.writingToks, locale)}</td>
                <td>{rig.powerWatts} W</td>
                <td>
                  {rig.rigTotal == null ? tb("pending") : `$${formatNumber(rig.rigTotal, locale)}`}
                </td>
                <td>
                  {rig.localCostPerMM == null
                    ? "—"
                    : `$${rig.localCostPerMM.toFixed(3)}`}
                </td>
                <td>
                  {rig.breakEvenDays == null
                    ? "—"
                    : `${formatNumber(rig.breakEvenDays, locale)} ${tb("daysShort")}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>{t("limitsTitle")}</h2>
        <ul>
          <li>{items(`${scenario.key}.limit`)}</li>
          <li>{t("limitShared")}</li>
        </ul>
        <p className="meta">
          {t("methodNote")} <Link href="/method">{t("methodLink")}</Link>
          {" · "}
          <Link href="/can-i-run">{tnav("canIRun")}</Link>
          {" · "}
          <Link href="/benchmarks">{t("allBenchmarks")}</Link>
          {" · "}
          <Link href="/guides">{t("guidesLink")}</Link>
        </p>
      </section>

      <section style={{ maxWidth: "46rem", marginTop: "2rem" }}>
        <h2>FAQ</h2>
        <dl className="vps-faq">
          {faqEntries.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="section">
        <h2>{t("title")}</h2>
        <div className="row">
          {otherScenarios.map((other) => (
            <Link key={other.slug} href={`/best/${other.slug}`} className="btn">
              {items(`${other.key}.title`)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
