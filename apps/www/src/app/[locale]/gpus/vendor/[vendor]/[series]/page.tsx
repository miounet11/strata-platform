import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getVendor,
  gpusOfSeries,
  seriesOfVendor,
  vendorLabel,
  vendorSlug,
} from "@/lib/gpus";
import { gpuPath, gpuSeriesPath, gpuVendorPath } from "@/lib/routes";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";

export function generateStaticParams() {
  const vendors = ["nvidia", "amd", "intel", "apple", "matrox", "3dfx", "xgi", "sis", "sony", "s3", "via"];
  return vendors.flatMap((vendor) => {
    const key = getVendor(vendor);
    if (!key) return [];
    return seriesOfVendor(key).map((entry) => ({ vendor, series: entry.slug }));
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; vendor: string; series: string }>;
}) {
  const { locale, vendor, series } = await params;
  const key = getVendor(vendor);
  if (!key) return {};
  const cards = gpusOfSeries(key, series);
  if (!cards.length) return {};
  const name = cards[0].series;
  const t = await getTranslations({ locale, namespace: "gpus" });
  return seoMetadata(
    locale,
    "gpus",
    gpuSeriesPath(vendor, series),
    true,
    t("seriesPageTitle", { series: name, count: cards.length }),
    t("seriesPageIntro", { series: name, vendor: vendorLabel[key], count: cards.length }),
  );
}

/**
 * Every card in one family.
 *
 * This is the page that makes the size of the catalogue useful rather than overwhelming: a
 * reader comparing 4080 against 4090 gets the whole family on one screen, and each entry links
 * to its own detail page instead of forcing a search.
 */
export default async function GpuSeriesPage({
  params,
}: {
  params: Promise<{ locale: string; vendor: string; series: string }>;
}) {
  const { locale, vendor, series } = await params;
  setRequestLocale(locale);
  const key = getVendor(vendor);
  if (!key) notFound();

  const cards = gpusOfSeries(key, series);
  if (!cards.length) notFound();

  const t = await getTranslations("gpus");
  const name = cards[0].series;
  const siblings = seriesOfVendor(key).filter((entry) => entry.slug !== series);

  const title = t("seriesPageTitle", { series: name, count: cards.length });

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGraph([
              pageLd(SITE, locale, gpuSeriesPath(vendorSlug(key), series), title, { type: "CollectionPage" }),
            ]),
          ),
        }}
      />
      <Breadcrumbs
        label={name}
        parents={[
          { href: "/gpus/vendor", text: t("vendorIndexTitle") },
          { href: gpuVendorPath(vendorSlug(key)), text: vendorLabel[key] },
        ]}
      />
      <h1>{t("seriesPageTitle", { series: name, count: cards.length })}</h1>
      <p className="page-intro">
        {t("seriesPageIntro", { series: name, vendor: vendorLabel[key], count: cards.length })}
      </p>

      <table className="gpu-table">
        <thead>
          <tr>
            <th>{t("tableModel")}</th>
            <th>{t("tableVram")}</th>
            <th>{t("tableBandwidth")}</th>
            <th>{t("tableYear")}</th>
            <th>{t("tableSupport")}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((gpu) => (
            <tr key={gpu.id}>
              <td>
                <Link href={gpuPath(gpu.slug)}>{gpu.name}</Link>
              </td>
              <td>{gpu.vramGb > 0 ? `${gpu.vramGb} GB` : t("sharedMemory")}</td>
              <td>{gpu.bandwidthGbs > 0 ? `${gpu.bandwidthGbs} GB/s` : "—"}</td>
              <td>{gpu.year || "—"}</td>
              <td>{t(gpu.support === "verified" ? "verified" : gpu.support === "supported" ? "supported" : "notSupported")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("otherSeriesHeading")}</h2>
      <ul className="gpu-list">
        {siblings.slice(0, 20).map((entry) => (
          <li key={entry.slug}>
            <Link href={gpuSeriesPath(vendorSlug(key), entry.slug)}>{entry.series}</Link>
            <span className="meta"> {t("seriesCount", { count: entry.count, vram: entry.vramGbMax })}</span>
          </li>
        ))}
      </ul>

      <p className="meta">
        <Link href={gpuVendorPath(vendorSlug(key))}>{vendorLabel[key]}</Link> ·{" "}
        <Link href="/gpus/vendor">{t("vendorIndexTitle")}</Link> · <Link href="/gpus">{t("title")}</Link>
      </p>
    </div>
  );
}
