import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ClientMessages } from "@/components/ClientMessages";
import { RelatedContent } from "@/components/RelatedContent";
import { guidesForRig } from "@/lib/articles";
import { computeEconomics, defaultWorkload, getBenchmarks, getRig, getRigs } from "@/lib/benchmarks";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { getGpu } from "@/lib/gpus";
import { jsonLdGraph, nodeId } from "@/lib/jsonld";
import { formatNumber } from "@/lib/locale";
import { guidePath, gpuPath, rigPath } from "@/lib/routes";
import { rigStanding } from "@/lib/scenarios";
import { siteMetadata } from "@/lib/seo";
import { ORG_ID, WEBSITE_ID, siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

export function generateStaticParams() {
  return getRigs().map((rig) => ({ rig: rig.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; rig: string }>;
}) {
  const { locale, rig: id } = await params;
  const rig = getRig(id);
  const t = await getTranslations({ locale, namespace: "benchmarks" });
  if (!rig) return {};
  return siteMetadata(
    locale,
    rig.name,
    `${rig.name}: ${rig.memory} GB, ${rig.readingToks} read tok/s, ${rig.writingToks} write tok/s. ${t("intro")}`,
    `/benchmarks/${rig.id}`,
  );
}

export default async function BenchmarkRigPage({
  params,
}: {
  params: Promise<{ locale: string; rig: string }>;
}) {
  const { locale, rig: id } = await params;
  setRequestLocale(locale);
  const rig = getRig(id);
  if (!rig) notFound();
  const t = await getTranslations("benchmarks");
  const tnav = await getTranslations({ locale, namespace: "nav" });
  const gpu = getGpu(rig.id);
  const allRigs = getRigs();
  const standing = rigStanding(rig, allRigs);
  const econ4h = computeEconomics(rig, { ...defaultWorkload(), activeHours: 4 });
  const data = getBenchmarks();

  const url = `${SITE}/${locale}/benchmarks/${rig.id}`;
  const pageId = nodeId(url, "webpage");
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tnav("home") },
    { path: "/benchmarks", name: tnav("benchmarks") },
    { name: rig.name, id: pageId },
  ]);

  const verdictLead =
    rig.localCostPerMM != null && rig.breakEvenDays != null && standing.costRank != null
      ? t("rigVerdictMeasured", {
          name: rig.name,
          write: formatNumber(rig.writingToks, locale),
          cost: rig.localCostPerMM.toFixed(3),
          costRank: standing.costRank,
          total: standing.totalMeasured,
          days: formatNumber(rig.breakEvenDays, locale),
        })
      : t("rigVerdictPending", {
          name: rig.name,
          memory: rig.memory,
          write: formatNumber(rig.writingToks, locale),
          read: formatNumber(Math.round(rig.readingToks), locale),
        });

  const faqEntries = [
    {
      q: t("rigFaqSpeedQ", { name: rig.name }),
      a: t("rigFaqSpeedA", {
        name: rig.name,
        read: formatNumber(Math.round(rig.readingToks), locale),
        write: formatNumber(rig.writingToks, locale),
        memory: rig.memory,
        date: data.syncedAt.slice(0, 10),
      }),
    },
    ...(rig.breakEvenDays != null && econ4h.breakEvenDays != null
      ? [
          {
            q: t("rigFaqWorthQ", { name: rig.name }),
            a: t("rigFaqWorthA", {
              name: rig.name,
              cost: rig.localCostPerMM?.toFixed(3) ?? "—",
              days24: formatNumber(rig.breakEvenDays, locale),
              days4: formatNumber(econ4h.breakEvenDays, locale),
            }),
          },
        ]
      : []),
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

  const rigGuides = guidesForRig(locale, rig.id, rig.name, 4);

  return (
    <div className="container container-wide page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              ...siteEntityNodes(),
              {
                "@type": "WebPage",
                "@id": pageId,
                url,
                name: rig.name,
                description: verdictLead,
                inLanguage: locale,
                isPartOf: { "@id": WEBSITE_ID },
                publisher: { "@id": ORG_ID },
                isBasedOn: { "@id": `${SITE}/${locale}/benchmarks#dataset` },
              },
              faqLd,
              crumbLd,
            ]),
          ),
        }}
      />
      <Breadcrumbs label={rig.name} />
      <h1>{rig.name}</h1>
      <p style={{ color: "var(--muted)" }}>
        {rig.memory} GB · {rig.form}
        {rig.cardPrice != null
          ? ` · $${formatNumber(rig.cardPrice, locale)} ${t("colCard")}`
          : ""}
        {rig.rigTotal != null
          ? ` · $${formatNumber(rig.rigTotal, locale)} ${t("colRig")}`
          : ` · ${t("pending")}`}
      </p>

      <section className="card" style={{ margin: "1.25rem 0 1.5rem", maxWidth: "56rem" }}>
        <h2 style={{ marginTop: 0 }}>{t("rigDecisionTitle")}</h2>
        <p style={{ marginBottom: "0.75rem" }}>{verdictLead}</p>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--muted)" }}>
          <li>
            {t("rigStandingLine", {
              speedRank: standing.speedRank,
              totalRigs: allRigs.length,
              powerRank: standing.powerRank,
              watts: rig.powerWatts,
            })}
          </li>
          {standing.cheaperAlternative ? (
            <li>
              {t("rigSkipCheaper")}{" "}
              <Link href={rigPath(standing.cheaperAlternative.id)}>
                {standing.cheaperAlternative.name}
              </Link>{" "}
              (${formatNumber(standing.cheaperAlternative.rigTotal ?? 0, locale)})
            </li>
          ) : null}
          {standing.fasterAlternative ? (
            <li>
              {t("rigSkipFaster")}{" "}
              <Link href={rigPath(standing.fasterAlternative.id)}>
                {standing.fasterAlternative.name}
              </Link>{" "}
              ({formatNumber(standing.fasterAlternative.writingToks, locale)} tok/s)
            </li>
          ) : null}
        </ul>
        <p className="meta" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          <Link href="/can-i-run">{tnav("canIRun")} →</Link>
          {" · "}
          <Link href="/best">{tnav("best")} →</Link>
          {" · "}
          <Link href="/method">{tnav("method")} →</Link>
        </p>
      </section>

      <ClientMessages namespaces={["benchmarks"]}>
        <BenchmarkBoard focusId={rig.id} />
      </ClientMessages>

      <section className="section" style={{ maxWidth: "46rem" }}>
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

      <RelatedContent
        items={[
          ...(gpu ? [{ href: gpuPath(gpu.slug), title: gpu.name, note: t("rigSpecNote") }] : []),
          ...rigGuides.map((article) => ({ href: guidePath(article.slug), title: article.article.title })),
        ]}
      />
    </div>
  );
}
