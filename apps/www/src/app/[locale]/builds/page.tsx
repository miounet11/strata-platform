import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BuildExplorer, type BuildExplorerRow } from "@/components/BuildExplorer";
import { EnrichedImage } from "@/components/EnrichedImage";
import { BUILD_TIERS, allBuilds, buildText } from "@/lib/builds";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { buildPath } from "@/lib/routes";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "builds" });
  return seoMetadata(locale, "builds", "/builds", true, t("title"), t("intro"));
}

export default async function BuildsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("builds");
  const tn = await getTranslations("nav");
  const title = t("title");
  const intro = t("intro");
  const builds = allBuilds();

  const rows: BuildExplorerRow[] = builds.map((build) => ({
    slug: build.slug,
    tier: build.tier,
    vendor: build.vendor,
    gpuModel: build.gpuModel,
    gpuCount: build.gpuCount,
    totalVramGb: build.totalVramGb,
    systemRamGb: build.systemRamGb,
    writingToks: build.writingToks,
    readingToks: build.readingToks,
    loadWatts: build.loadWatts,
    noiseDbA: build.noiseDbA,
    totalPriceUsd: build.totalPriceUsd,
    localCostPerMM: build.localCostPerMM,
    breakEvenDays: build.breakEvenDays,
    recommendedQuant: build.recommendedQuant,
    title: buildText(build.title, locale),
    tagline: buildText(build.tagline, locale),
  }));

  const pageUrl = `${SITE}/${locale}/builds`;
  const pageId = nodeId(pageUrl, "webpage");
  const pageNode = pageLd(SITE, locale, "/builds", title, {
    description: intro,
    type: "CollectionPage",
  });
  const listLd = {
    "@type": "ItemList",
    "@id": nodeId(pageUrl, "list"),
    name: title,
    numberOfItems: builds.length,
    itemListElement: builds.map((build, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: buildText(build.title, locale),
      url: `${SITE}/${locale}${buildPath(build.slug)}`,
    })),
  };
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { name: title, id: pageId },
  ]);

  const tiers = {
    budget: t("tiers.budget"),
    "sweet-spot": t("tiers.sweet-spot"),
    "dual-gpu": t("tiers.dual-gpu"),
    workstation: t("tiers.workstation"),
    "compact-unified": t("tiers.compact-unified"),
    flagship: t("tiers.flagship"),
  };
  const vendors = {
    nvidia: t("vendors.nvidia"),
    amd: t("vendors.amd"),
    apple: t("vendors.apple"),
  };

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), pageNode, listLd, crumbLd])),
        }}
      />
      <Breadcrumbs label={title} />
      <h1>{title}</h1>
      <p className="page-intro">{intro}</p>
      <EnrichedImage id="builds-hero" locale={locale} className="page-visual" />

      <BuildExplorer
        builds={rows}
        labels={{
          search: t("search"),
          searchPlaceholder: t("searchPlaceholder"),
          tier: t("tier"),
          vendor: t("vendor"),
          minVram: t("minVram"),
          maxBudget: t("maxBudget"),
          sort: t("sort"),
          all: t("all"),
          tiers,
          vendors,
          anyBudget: t("anyBudget"),
          sortCost: t("sortCost"),
          sortSpeed: t("sortSpeed"),
          sortPrice: t("sortPrice"),
          sortVram: t("sortVram"),
          sortPower: t("sortPower"),
          compare: t("compare"),
          compareHint: t("compareHint"),
          compareLimit: t("compareLimit"),
          clearCompare: t("clearCompare"),
          empty: t("empty"),
          price: t("price"),
          vram: t("vram"),
          systemRam: t("systemRam"),
          write: t("write"),
          read: t("read"),
          watts: t("watts"),
          noise: t("noise"),
          costPerM: t("costPerM"),
          breakEven: t("breakEven"),
          quant: t("quant"),
          view: t("view"),
          days: t("days"),
          na: t("na"),
        }}
      />

      <section className="section">
        <h2>{t("directoryTitle")}</h2>
        {BUILD_TIERS.map((tier) => {
          const group = builds.filter((build) => build.tier === tier);
          if (group.length === 0) return null;
          return (
            <div key={tier}>
              <h3>{tiers[tier]}</h3>
              <ul className="gpu-list">
                {group.map((build) => (
                  <li key={build.slug}>
                    <Link href={buildPath(build.slug)}>{buildText(build.title, locale)}</Link>
                    <span className="meta">
                      {" "}
                      {build.totalVramGb} GB · ${build.totalPriceUsd.toLocaleString("en-US")} · {build.writingToks} tok/s
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <div className="row">
        <Link href="/can-i-run" className="btn">
          {tn("canIRun")}
        </Link>
        <Link href="/gpus" className="btn">
          {tn("gpus")}
        </Link>
        <Link href="/benchmarks" className="btn">
          {tn("benchmarks")}
        </Link>
        <Link href="/best" className="btn">
          {tn("best")}
        </Link>
      </div>
    </div>
  );
}
