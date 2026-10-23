import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { vendorSummaries, gpuCounts } from "@/lib/gpus";
import { gpuVendorPath } from "@/lib/routes";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gpus" });
  return seoMetadata(locale, "gpus", "/gpus/vendor", true, t("vendorIndexTitle"), t("vendorIndexIntro"));
}

/**
 * Brand index: the page a reader lands on when they know the maker but not the model.
 *
 * It exists separately from `/gpus` because that page is a filter over 3,000 rows — a crawler
 * sees one URL, and a reader sees a table. Here each vendor is a real link with a real count.
 */
export default async function GpuVendorIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gpus");
  const vendors = vendorSummaries();

  const title = t("vendorIndexTitle");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([pageLd(SITE, locale, "/gpus/vendor", title, { description: t("vendorIndexIntro"), type: "CollectionPage" })]),
          ),
        }}
      />
      <Breadcrumbs label={title} />
      <h1>{t("vendorIndexTitle")}</h1>
      <p className="page-intro">{t("vendorIndexIntro")}</p>
      <p className="meta">{t("summary", { total: gpuCounts.total, verified: gpuCounts.measured, runnable: gpuCounts.runnable })}</p>

      <ul className="gpu-list">
        {vendors.map((vendor) => (
          <li key={vendor.vendor}>
            <Link href={gpuVendorPath(vendor.slug)}>{vendor.label}</Link>
            <span className="meta">
              {" "}
              {t("vendorCount", { count: vendor.count, year: vendor.year })}
            </span>
          </li>
        ))}
      </ul>

      <p className="meta">
        <Link href="/gpus">{t("title")}</Link>
      </p>
    </div>
  );
}
