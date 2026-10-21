import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  allGpus,
  compatLevel,
  getGpu,
  recommendedVariant,
  variantLabel,
  vendorLabel,
} from "@/lib/gpus";
import { siteMetadata } from "@/lib/seo";

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
  const variant = recommendedVariant(gpu);
  const level = compatLevel(gpu);

  return (
    <div className="container page">
      <p style={{ color: "var(--muted)" }}>
        <Link href="/gpus">{t("back")}</Link>
      </p>
      <h1>{gpu.name}</h1>
      <p className="meta">
        {vendorLabel[gpu.vendor]} · {gpu.arch} · {gpu.vramGb} GB · {gpu.year}
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

      <p>
        <Link href={`/benchmarks/${gpu.id}`}>{t("seeBenchmark")}</Link>
      </p>
    </div>
  );
}
