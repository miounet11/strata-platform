import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  allGpus,
  compatLevel,
  getGpu,
  recommendedVariant,
  rivals,
  seriesSiblings,
  seriesSlug,
  vramLabel,
  variantLabel,
  vendorLabel,
  vendorSlug,
} from "@/lib/gpus";
import { getRig } from "@/lib/benchmarks";
import { guidesMentioning } from "@/lib/articles";
import { guidePath, gpuPath, gpuSeriesPath, gpuVendorPath, rigPath } from "@/lib/routes";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { RelatedContent } from "@/components/RelatedContent";
import { siteMetadata } from "@/lib/seo";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

export function generateStaticParams() {
  return allGpus().map((gpu) => ({ slug: gpu.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const gpu = getGpu(slug);
  if (!gpu) return {};
  const t = await getTranslations({ locale, namespace: "gpus" });
  const variant = recommendedVariant(gpu);
  return siteMetadata(
    locale,
    `${gpu.name} — ${t("title")}`,
    variant
      ? t("metaRuns", { name: gpu.name, vram: gpu.vramGb, quant: variant.name })
      : t("metaTooSmall", { name: gpu.name, vram: gpu.vramGb }),
    `/gpus/${gpu.slug}`,
  );
}

export default async function GpuPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const gpu = getGpu(slug);
  if (!gpu) notFound();

  const t = await getTranslations("gpus");
  const tnav = await getTranslations({ locale, namespace: "nav" });
  const variant = recommendedVariant(gpu);
  const level = compatLevel(gpu);
  // Only nine cards have a measured rig; the rest would point at a 404 from this link.
  const measured = Boolean(getRig(gpu.id));
  // Empty when the card's name already carries the figure ("RTX 4060 Ti 16GB").
  const capacity = vramLabel(gpu, t("sharedMemory"));
  // Same-VRAM cards from other vendors: the comparison a buyer actually makes, and the reason
  // the catalogue interlinks at all instead of being 101 dead ends.
  const comparisons = rivals(gpu).map((other) => ({
    href: gpuPath(other.slug),
    title: other.name,
    note: [vramLabel(other, t("sharedMemory")), `${other.readingTps} tok/s`].filter(Boolean).join(" · "),
  }));

  // Card-to-card within the series, and card-to-guide: the two directions the catalogue was
  // missing. Most cards are linked from their series list and nowhere else, so without these
  // the page is a leaf with no internal traffic and no reason for a crawler to revisit it.
  const siblings = seriesSiblings(gpu).map((other) => ({
    href: gpuPath(other.slug),
    title: other.name,
    note: vramLabel(other, t("sharedMemory")),
  }));
  const mentions = guidesMentioning(locale, gpu.name).map((article) => ({
    href: guidePath(article.slug),
    title: article.article.title,
  }));

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tnav("home") },
    { path: "/gpus", name: tnav("gpus") },
    { path: gpuVendorPath(vendorSlug(gpu.vendor)), name: vendorLabel[gpu.vendor] },
    { path: gpuSeriesPath(vendorSlug(gpu.vendor), seriesSlug(gpu.series)), name: gpu.series },
    { name: gpu.name },
  ]);

  // The trail is already emitted as BreadcrumbList; this adds the hardware facts a crawler
  // would otherwise have to read off the table. `Product` with a brand and category lets the
  // page be understood as a specific piece of hardware rather than a generic article.
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: gpu.name,
    brand: { "@type": "Brand", name: vendorLabel[gpu.vendor] },
    category: "Graphics processing unit",
    url: `${SITE}/${locale}${gpuPath(gpu.slug)}`,
    ...(gpu.year ? { releaseDate: String(gpu.year) } : {}),
    ...(gpu.vramGb > 0
      ? { additionalProperty: [
          { "@type": "PropertyValue", name: "Memory", value: `${gpu.vramGb} GB` },
          { "@type": "PropertyValue", name: "Memory bandwidth", value: `${gpu.bandwidthGbs} GB/s` },
        ] }
      : {}),
    isPartOf: {
      "@type": "CollectionPage",
      name: gpu.series,
      url: `${SITE}/${locale}${gpuSeriesPath(vendorSlug(gpu.vendor), seriesSlug(gpu.series))}`,
    },
  };

  return (
    <div className="container page">
      {crumbLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
      <Breadcrumbs
        label={gpu.name}
        parents={[
          { href: gpuVendorPath(vendorSlug(gpu.vendor)), text: vendorLabel[gpu.vendor] },
          { href: gpuSeriesPath(vendorSlug(gpu.vendor), seriesSlug(gpu.series)), text: gpu.series },
        ]}
      />
      <h1>{gpu.name}</h1>
      <p className="meta">
        <Link href={gpuVendorPath(vendorSlug(gpu.vendor))}>{vendorLabel[gpu.vendor]}</Link>
        {" · "}
        <Link href={gpuSeriesPath(vendorSlug(gpu.vendor), seriesSlug(gpu.series))}>{gpu.series}</Link>
        {gpu.arch && gpu.arch !== gpu.series ? ` · ${gpu.arch}` : ""}
        {capacity ? ` · ${capacity}` : ""}
        {gpu.year ? ` · ${gpu.year}` : ""}
      </p>

      <section className={`gpu-verdict gpu-verdict-${level}`}>
        <h2>{t("verdictTitle")}</h2>
        {variant ? (
          <>
            <p className="gpu-verdict-main">
              {t("verdictRuns", { base: "Qwen3.8-Flash-Next", quant: variant.name })}
            </p>
            <p>{t("verdictDownload", { size: variant.downloadGb, ram: variant.ramGbMin })}</p>
            <p className="meta">{t("verdictVariant", { variant: variantLabel[gpu.variant] ?? gpu.variant })}</p>
          </>
        ) : (
          <p className="gpu-verdict-main">{t("verdictTooSmall", { vram: gpu.vramGb })}</p>
        )}
      </section>

      <h2>{t("specs")}</h2>
      <table>
        <tbody>
          <tr>
            <th>{t("specVram")}</th>
            <td>{gpu.vramGb} GB</td>
          </tr>
          <tr>
            <th>{t("specBandwidth")}</th>
            <td>{gpu.bandwidthGbs} GB/s</td>
          </tr>
          <tr>
            <th>{t("specRead")}</th>
            <td>{gpu.readingTps} tok/s</td>
          </tr>
          <tr>
            <th>{t("specWrite")}</th>
            <td>{gpu.writingTps} tok/s</td>
          </tr>
          {gpu.powerWatts != null && (
            <tr>
              <th>{t("specPower")}</th>
              <td>{gpu.powerWatts} W</td>
            </tr>
          )}
          <tr>
            <th>{t("specEvidence")}</th>
            <td>{gpu.evidence === "measured" ? t("badgeMeasured") : t("badgeEstimated")}</td>
          </tr>
        </tbody>
      </table>

      <p className="meta">
        {gpu.evidence === "measured" ? t("noteMeasured") : t("noteEstimated")}
      </p>

      {measured ? (
        <p>
          <Link href={rigPath(gpu.id)}>{t("seeBenchmark")}</Link>
        </p>
      ) : (
        // Most cards in the catalogue have no measured rig, so linking one would 404 from 92 of
        // the 101 pages. The table is the honest destination: it shows what was actually measured.
        <p>
          <Link href="/benchmarks">{t("seeBenchmarkAll")}</Link>
        </p>
      )}

      <RelatedContent title={t("compare")} items={comparisons} />
      <RelatedContent title={t("sameSeries")} items={siblings} />
      <RelatedContent title={t("mentionedIn")} items={mentions} />
    </div>
  );
}
