import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { GpuExplorer } from "@/components/GpuExplorer";
import { allGpus, gpuCounts, vendorSlug, vendorSummaries } from "@/lib/gpus";
import { gpuVendorPath } from "@/lib/routes";
import { seoMetadata } from "@/lib/seo-messages";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gpus" });
  return seoMetadata(locale, "gpus", "/gpus", true, t("title"), t("intro"));
}

export default async function GpuIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gpus");

  // The live filter ships every row to the browser, so it gets the cards that can actually run
  // the model. The other 2,800 have no build, no filter value and no reason to cost bytes — they
  // are still published as detail pages and listed under their brand and series below.
  const rows = allGpus()
    .filter((gpu) => gpu.runnable || gpu.evidence === "measured")
    .map((gpu) => ({
      id: gpu.id,
      slug: gpu.slug,
      name: gpu.name,
      vendor: gpu.vendor,
      arch: gpu.arch,
      vramGb: gpu.vramGb,
      year: gpu.year,
      readingTps: gpu.readingTps,
      support: gpu.support,
      evidence: gpu.evidence,
    }));

  return (
    <div className="container container-wide page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <p className="meta">
        {t("summary", {
          total: gpuCounts.total,
          verified: gpuCounts.measured,
          runnable: gpuCounts.runnable,
        })}
      </p>

      <GpuExplorer
        gpus={rows}
        labels={{
          search: t("search"),
          vendor: t("vendor"),
          arch: t("arch"),
          minVram: t("minVram"),
          support: t("support"),
          sort: t("sort"),
          all: t("all"),
          sortVram: t("sortVram"),
          sortSpeed: t("sortSpeed"),
          sortYear: t("sortYear"),
          sortName: t("sortName"),
          verified: t("verified"),
          supported: t("supported"),
          notSupported: t("notSupported"),
          empty: t("empty"),
          detect: t("detect"),
          detectHint: t("detectHint"),
          detectFound: t("detectFound"),
          detectNone: t("detectNone"),
          badgeMeasured: t("badgeMeasured"),
          badgeEstimated: t("badgeEstimated"),
        }}
      />

      <p className="meta">{t("footer", { count: gpuCounts.estimated })}</p>

      {/* Server-rendered brand links: the filter above is client-side, so without this the
          3,000-card catalogue would have no crawlable path from its own index page. */}
      <section className="section">
        <h2>{t("vendorIndexTitle")}</h2>
        <ul className="gpu-list">
          {vendorSummaries().map((vendor) => (
            <li key={vendor.vendor}>
              <Link href={gpuVendorPath(vendor.slug)}>{vendor.label}</Link>
              <span className="meta"> {t("vendorCount", { count: vendor.count, year: vendor.year })}</span>
            </li>
          ))}
        </ul>
        <p className="meta">
          <Link href="/gpus/vendor">{t("vendorIndexTitle")} →</Link>
        </p>
      </section>
    </div>
  );
}
