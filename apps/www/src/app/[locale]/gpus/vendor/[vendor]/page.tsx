import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  gpuCounts,
  getVendor,
  gpusOfVendor,
  seriesOfVendor,
  vramLabel,
  vendorLabel,
  vendorSlug,
} from "@/lib/gpus";
import { gpuPath, gpuSeriesPath, gpuVendorPath } from "@/lib/routes";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { seoMetadata } from "@/lib/seo-messages";

export function generateStaticParams() {
  return ["nvidia", "amd", "intel", "apple", "matrox", "3dfx", "xgi", "sis", "sony", "s3", "via"].map(
    (vendor) => ({ vendor }),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; vendor: string }>;
}) {
  const { locale, vendor } = await params;
  const key = getVendor(vendor);
  if (!key) return {};
  const t = await getTranslations({ locale, namespace: "gpus" });
  const list = gpusOfVendor(key);
  return seoMetadata(
    locale,
    "gpus",
    gpuVendorPath(vendorSlug(key)),
    true,
    t("vendorPageTitle", { vendor: vendorLabel[key], count: list.length }),
    t("vendorPageIntro", { vendor: vendorLabel[key], count: list.length }),
  );
}

/**
 * One vendor's catalogue, grouped by series.
 *
 * The catalogue has 3,000 rows; listing them all on one page would be a wall. Series headings
 * with a link each keep every model one click from the vendor page while the page itself stays
 * scannable, and give the crawler a trail from vendor → series → card.
 */
export default async function GpuVendorPage({
  params,
}: {
  params: Promise<{ locale: string; vendor: string }>;
}) {
  const { locale, vendor } = await params;
  setRequestLocale(locale);
  const key = getVendor(vendor);
  if (!key) notFound();

  const t = await getTranslations("gpus");
  const series = seriesOfVendor(key);
  const list = gpusOfVendor(key);
  const label = vendorLabel[key];

  // The newest family is what most visitors came for; older ones follow in year order.
  const newest = series.slice(0, 3);

  return (
    <div className="container page">
      {/* `/gpus/vendor` is a real index between the catalogue and each brand. */}
      <Breadcrumbs label={label} parents={[{ href: "/gpus/vendor", text: t("vendorIndexTitle") }]} />
      <h1>{t("vendorPageTitle", { vendor: label, count: list.length })}</h1>
      <p className="page-intro">{t("vendorPageIntro", { vendor: label, count: list.length })}</p>

      <h2>{t("seriesHeading")}</h2>
      <ul className="gpu-list">
        {series.map((entry) => (
          <li key={entry.slug}>
            <Link href={gpuSeriesPath(vendorSlug(key), entry.slug)}>{entry.series}</Link>
            <span className="meta"> {t("seriesCount", { count: entry.count, vram: entry.vramGbMax })}</span>
          </li>
        ))}
      </ul>

      {newest.map((entry) => {
        const cards = list.filter((gpu) => gpu.series === entry.series).slice(0, 24);
        return (
          <section key={`latest-${entry.slug}`}>
            <h2>{entry.series}</h2>
            <ul className="gpu-list">
              {cards.map((gpu) => (
                <li key={gpu.id}>
                  <Link href={gpuPath(gpu.slug)}>{gpu.name}</Link>
                  <span className="meta">
                    {" "}
                    {[vramLabel(gpu, t("sharedMemory")), gpu.year].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            {entry.count > cards.length ? (
              <p className="meta">
                <Link href={gpuSeriesPath(vendorSlug(key), entry.slug)}>
                  {t("seeAllInSeries", { count: entry.count })}
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}

      <p className="meta">
        <Link href="/gpus/vendor">{t("vendorIndexTitle")}</Link> · <Link href="/gpus">{t("title")}</Link>
      </p>
      <p className="meta">{t("summary", { total: gpuCounts.total, verified: gpuCounts.measured, runnable: gpuCounts.runnable })}</p>
    </div>
  );
}
