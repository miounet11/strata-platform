import { getTranslations, setRequestLocale } from "next-intl/server";
import { GpuExplorer } from "@/components/GpuExplorer";
import { allGpus, gpuCounts } from "@/lib/gpus";
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

  // Only the fields the filter needs cross to the client; the page keeps the full catalogue.
  const rows = allGpus().map((gpu) => ({
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
    </div>
  );
}
