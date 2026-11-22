import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CanIRunCalculator, type HardwarePreset } from "@/components/CanIRunCalculator";
import modelsData from "@/data/models.json";
import { getRigs } from "@/lib/benchmarks";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import {
  evaluateHardware,
  HARDWARE_TIERS,
  type ModelVariantSpec,
} from "@/lib/can-i-run";
import { allGpus } from "@/lib/gpus";
import { jsonLdGraph, nodeId } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { ORG_ID, SOFTWARE_ID, WEBSITE_ID, siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return seoMetadata(locale, "canIRun", "/can-i-run");
}

function buildPresets(): HardwarePreset[] {
  const rigs = getRigs();
  const gpus = allGpus();
  const gpuById = new Map(gpus.map((g) => [g.id, g]));
  const presets: HardwarePreset[] = [];

  for (const rig of rigs) {
    const gpu = gpuById.get(rig.id);
    const unified = rig.vendor === "apple" || /unified/i.test(rig.form);
    presets.push({
      id: `rig-${rig.id}`,
      name: rig.name,
      vendor: rig.vendor,
      vramGb: rig.memory,
      ramGb: unified ? rig.memory : Math.max(64, rig.memory * 2),
      unifiedMemory: unified,
      bandwidthGbs: gpu?.bandwidthGbs,
      measuredReadTps: rig.readingToks,
      measuredWriteTps: rig.writingToks,
      powerWatts: rig.powerWatts,
      rigPriceUsd: rig.rigTotal,
      rigId: rig.id,
      gpuSlug: gpu?.slug,
    });
  }

  // Add common consumer cards that are frequently asked about even when unmeasured.
  const extras: Array<{ slugMatch: string; ramGb: number }> = [
    { slugMatch: "geforce-rtx-4060-8gb", ramGb: 32 },
    { slugMatch: "geforce-rtx-4060-ti-16gb", ramGb: 64 },
    { slugMatch: "geforce-rtx-4080-super", ramGb: 64 },
    { slugMatch: "geforce-rtx-3060-12gb", ramGb: 48 },
  ];
  for (const extra of extras) {
    const gpu = gpus.find((g) => g.slug.includes(extra.slugMatch));
    if (!gpu || presets.some((p) => p.gpuSlug === gpu.slug)) continue;
    presets.push({
      id: `gpu-${gpu.slug}`,
      name: gpu.name,
      vendor: gpu.vendor,
      vramGb: gpu.vramGb,
      ramGb: extra.ramGb,
      unifiedMemory: false,
      bandwidthGbs: gpu.bandwidthGbs,
      powerWatts: gpu.powerWatts ?? 350,
      gpuSlug: gpu.slug,
    });
  }

  return presets;
}

export default async function CanIRunPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("canIRun");
  const tn = await getTranslations("nav");
  const variants = modelsData.variants as ModelVariantSpec[];
  const presets = buildPresets();

  const tierRows = HARDWARE_TIERS.map((tier) => ({
    tier,
    verdict: evaluateHardware(
      {
        vramGb: tier.vramGb,
        ramGb: tier.ramGb,
        unifiedMemory: tier.unifiedMemory,
        contextK: 32,
        bandwidthGbs: tier.bandwidthGbs,
      },
      variants,
    ),
  }));

  const url = `${SITE}/${locale}/can-i-run`;
  const pageId = nodeId(url, "webpage");
  const title = t("title");

  const webAppLd = {
    "@type": "WebApplication",
    "@id": nodeId(url, "app"),
    name: title,
    description: t("intro"),
    url,
    inLanguage: locale,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": SOFTWARE_ID },
  };

  const faqEntries = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
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

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { name: title, id: pageId },
  ]);

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
                name: title,
                description: t("intro"),
                inLanguage: locale,
                isPartOf: { "@id": WEBSITE_ID },
              },
              webAppLd,
              faqLd,
              crumbLd,
            ]),
          ),
        }}
      />

      <Breadcrumbs label={title} />
      <h1>{title}</h1>
      <p className="page-intro">{t("intro")}</p>

      <CanIRunCalculator
        presets={presets}
        variants={variants}
        labels={{
          presetLabel: t("presetLabel"),
          customOption: t("customOption"),
          vramLabel: t("vramLabel"),
          ramLabel: t("ramLabel"),
          unifiedLabel: t("unifiedLabel"),
          contextLabel: t("contextLabel"),
          hoursLabel: t("hoursLabel"),
          electricityLabel: t("electricityLabel"),
          verdictCanRun: t("verdictCanRun"),
          verdictCannotRun: t("verdictCannotRun"),
          bestQuantLabel: t("bestQuantLabel"),
          kvOverheadLabel: t("kvOverheadLabel"),
          speedLabel: t("speedLabel"),
          costLabel: t("costLabel"),
          paybackLabel: t("paybackLabel"),
          daysUnit: t("daysUnit"),
          evidenceMeasured: t("evidenceMeasured"),
          evidenceEstimated: t("evidenceEstimated"),
          bottleneckVram: t("bottleneckVram"),
          bottleneckRam: t("bottleneckRam"),
          bottleneckUnified: t("bottleneckUnified"),
          colQuant: t("colQuant"),
          colStatus: t("colStatus"),
          colVramNeed: t("colVramNeed"),
          colRamNeed: t("colRamNeed"),
          colDownload: t("colDownload"),
          colSpeed: t("colSpeed"),
          statusRecommended: t("statusRecommended"),
          statusFits: t("statusFits"),
          statusTight: t("statusTight"),
          statusNeedsRam: t("statusNeedsRam"),
          statusNeedsVram: t("statusNeedsVram"),
          seeRig: t("seeRig"),
          seeGpu: t("seeGpu"),
          installCta: t("installCta"),
          downloadCta: t("downloadCta"),
        }}
      />

      <section className="section">
        <h2>{t("tierTableTitle")}</h2>
        <p className="page-intro">{t("tierTableIntro")}</p>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t("tierColHardware")}</th>
                <th className="num">{t("vramLabel")}</th>
                <th className="num">{t("ramLabel")}</th>
                <th>{t("bestQuantLabel")}</th>
                <th className="num">{t("colSpeed")}</th>
              </tr>
            </thead>
            <tbody>
              {tierRows.map(({ tier, verdict }) => (
                <tr key={tier.id}>
                  <td>{tier.exampleCards}</td>
                  <td className="num">
                    {tier.vramGb} GB{tier.unifiedMemory ? "*" : ""}
                  </td>
                  <td className="num">{tier.ramGb} GB</td>
                  <td>
                    {verdict.bestVariant ? (
                      <strong>{verdict.bestVariant.variant.name}</strong>
                    ) : (
                      <span className="meta">{t("statusNeedsVram")}</span>
                    )}
                  </td>
                  <td className="num">
                    {verdict.bestVariant?.estimatedWriteTps != null
                      ? `~${verdict.bestVariant.estimatedWriteTps} tok/s`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="meta" style={{ marginTop: "0.75rem" }}>
          {t("tierFootnote")}{" "}
          <Link href="/best">{tn("best")} →</Link>
          {" · "}
          <Link href="/benchmarks">{tn("benchmarks")} →</Link>
          {" · "}
          <Link href="/gpus">{tn("gpus")} →</Link>
          {" · "}
          <Link href="/method">{tn("method")} →</Link>
        </p>
      </section>

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
    </div>
  );
}
