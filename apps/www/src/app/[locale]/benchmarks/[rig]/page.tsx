import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { RelatedContent } from "@/components/RelatedContent";
import { getLiveArticles } from "@/lib/articles";
import { getGpu } from "@/lib/gpus";
import { guidePath, gpuPath } from "@/lib/routes";
import { getRig, getRigs } from "@/lib/benchmarks";
import { formatNumber } from "@/lib/locale";
import { siteMetadata } from "@/lib/seo";

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
  // Only rigs that are also catalogue cards have a spec page; the rest would link to a 404.
  const gpu = getGpu(rig.id);

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tnav("home") },
    { path: "/benchmarks", name: tnav("benchmarks") },
    { name: rig.name },
  ]);

  return (
    <div className="container container-wide page">
      {crumbLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      ) : null}
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
      <BenchmarkBoard focusId={rig.id} />

      {/* The reciprocal of the link from a GPU page to its measured rig: a reader who arrived at
          the numbers often wants the spec page they came from, or the guide behind the verdict. */}
      <RelatedContent
        items={[
          ...(gpu ? [{ href: gpuPath(gpu.slug), title: gpu.name, note: t("rigSpecNote") }] : []),
          ...getLiveArticles(locale)
            .filter((article) => article.kind === "hardware")
            .slice(0, 3)
            .map((article) => ({ href: guidePath(article.slug), title: article.article.title })),
        ]}
      />
    </div>
  );
}
