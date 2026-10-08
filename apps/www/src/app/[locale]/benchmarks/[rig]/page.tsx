import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BenchmarkBoard } from "@/components/BenchmarkBoard";
import { getRig, getRigs } from "@/lib/benchmarks";
import { siteMetadata } from "@/lib/seo";

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

  return (
    <div className="container container-wide" style={{ padding: "2rem 0 3rem" }}>
      <p style={{ color: "var(--muted)" }}>
        <Link href="/benchmarks">{t("back")}</Link>
      </p>
      <h1>{rig.name}</h1>
      <p style={{ color: "var(--muted)" }}>
        {rig.memory} GB · {rig.form}
        {rig.cardPrice != null
          ? ` · $${rig.cardPrice.toLocaleString(locale)} ${t("colCard")}`
          : ""}
        {rig.rigTotal != null
          ? ` · $${rig.rigTotal.toLocaleString(locale)} ${t("colRig")}`
          : ` · ${t("pending")}`}
      </p>
      <BenchmarkBoard focusId={rig.id} />
    </div>
  );
}
