import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EnrichedImage } from "@/components/EnrichedImage";
import { RelatedContent } from "@/components/RelatedContent";
import {
  allBuilds,
  annualPowerCostUsd,
  buildFaq,
  buildListText,
  buildText,
  getBuild,
  relatedBuilds,
  type WorkloadFit,
} from "@/lib/builds";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId } from "@/lib/jsonld";
import { buildPath, gpuPath, rigPath } from "@/lib/routes";
import { SITE, siteMetadata } from "@/lib/seo";
import { siteEntityNodes } from "@/lib/site-entities";

export const revalidate = 1800;

const BRAND: Record<string, string> = {
  nvidia: "NVIDIA",
  amd: "AMD",
  apple: "Apple",
};

export function generateStaticParams() {
  return allBuilds().map((build) => ({ slug: build.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const build = getBuild(slug);
  if (!build) return {};
  const t = await getTranslations({ locale, namespace: "builds" });
  const title = buildText(build.title, locale);
  return siteMetadata(locale, `${title} — ${t("title")}`, buildText(build.summary, locale), buildPath(build.slug));
}

function money(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function fitClass(fit: WorkloadFit): string {
  if (fit === "hybrid-offload") return "badge-warn";
  if (fit === "unified") return "badge-muted";
  return "badge-ok";
}

export default async function BuildPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const build = getBuild(slug);
  if (!build) notFound();

  const t = await getTranslations("builds");
  const tn = await getTranslations("nav");
  const title = buildText(build.title, locale);
  const tagline = buildText(build.tagline, locale);
  const summary = buildText(build.summary, locale);
  const faq = buildFaq(build, locale);
  const notes = buildListText(build.assemblyNotes, locale);
  const power4 = annualPowerCostUsd(build.loadWatts, build.idleWatts, 4);
  const power24 = annualPowerCostUsd(build.loadWatts, build.idleWatts, 24);
  const url = `${SITE}/${locale}${buildPath(build.slug)}`;
  const productId = nodeId(url, "product");

  const fitLabel = (fit: WorkloadFit) => {
    if (fit === "hybrid-offload") return t("fitHybrid");
    if (fit === "unified") return t("fitUnified");
    return t("fitFull");
  };

  const productLd = {
    "@type": "Product",
    "@id": productId,
    name: title,
    description: summary,
    category: "Local AI Workstation PC Build",
    brand: { "@type": "Brand", name: BRAND[build.vendor] ?? build.vendor },
    url,
    additionalProperty: [
      { "@type": "PropertyValue", name: "VRAM", value: `${build.totalVramGb} GB` },
      { "@type": "PropertyValue", name: "System RAM", value: `${build.systemRamGb} GB` },
      { "@type": "PropertyValue", name: "Total Price USD", value: String(build.totalPriceUsd) },
      { "@type": "PropertyValue", name: "Load Power W", value: String(build.loadWatts) },
      { "@type": "PropertyValue", name: "Write tok/s", value: String(build.writingToks) },
      { "@type": "PropertyValue", name: "Read tok/s", value: String(build.readingToks) },
    ],
  };

  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { path: "/builds", name: t("title") },
    { name: title, id: productId },
  ]);

  const faqLd = {
    "@type": "FAQPage",
    "@id": nodeId(url, "faq"),
    inLanguage: locale,
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const related = relatedBuilds(build, 4).map((other) => ({
    href: buildPath(other.slug),
    title: buildText(other.title, locale),
    note: `${other.totalVramGb} GB · ${money(other.totalPriceUsd)} · ${other.writingToks} tok/s`,
  }));

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLdGraph([...siteEntityNodes(), productLd, crumbLd, faqLd])),
        }}
      />
      <Breadcrumbs label={title} parents={[{ href: "/builds", text: t("title") }]} />
      <h1>{title}</h1>
      <p className="page-intro">{tagline}</p>
      <EnrichedImage id={build.heroImageId} locale={locale} className="page-visual" />

      <dl className="build-stats-grid">
        <div>
          <dt>{t("price")}</dt>
          <dd>{money(build.totalPriceUsd)}</dd>
        </div>
        <div>
          <dt>{t("vram")}</dt>
          <dd>
            {build.totalVramGb} GB + {build.systemRamGb} GB {t("systemRam")}
          </dd>
        </div>
        <div>
          <dt>{t("write")}</dt>
          <dd>{build.writingToks}</dd>
        </div>
        <div>
          <dt>{t("read")}</dt>
          <dd>{build.readingToks}</dd>
        </div>
        <div>
          <dt>{t("loadIdle")}</dt>
          <dd>
            {build.loadWatts} / {build.idleWatts} W
          </dd>
        </div>
        <div>
          <dt>{t("noise")}</dt>
          <dd>{build.noiseDbA} dBA</dd>
        </div>
        {build.localCostPerMM != null ? (
          <div>
            <dt>{t("costPerM")}</dt>
            <dd>{build.localCostPerMM.toLocaleString("en-US", { maximumFractionDigits: 3 })}</dd>
          </div>
        ) : null}
        {build.breakEvenDays != null ? (
          <div>
            <dt>{t("breakEven")}</dt>
            <dd>
              {build.breakEvenDays} {t("days")}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{t("annual4h")}</dt>
          <dd>{money(power4)}</dd>
        </div>
        <div>
          <dt>{t("annual24h")}</dt>
          <dd>{money(power24)}</dd>
        </div>
        <div>
          <dt>{t("recommended")}</dt>
          <dd>
            {build.recommendedQuant} · {build.maxContextK}K
          </dd>
        </div>
        <div>
          <dt>{t("runtime")}</dt>
          <dd>{build.runtime}</dd>
        </div>
        <div>
          <dt>{t("evidence")}</dt>
          <dd>
            <span className={build.evidence === "measured" ? "badge-ok" : "badge-muted"}>
              {build.evidence === "measured" ? t("evidenceMeasured") : t("evidenceEstimated")}
            </span>
          </dd>
        </div>
      </dl>

      <h2>{t("overview")}</h2>
      <p>{summary}</p>
      <div className="grid-2">
        <section className="card">
          <h2>{t("bestForTitle")}</h2>
          <p>{buildText(build.bestFor, locale)}</p>
        </section>
        <section className="card">
          <h2>{t("tradeoffsTitle")}</h2>
          <p>{buildText(build.tradeoffs, locale)}</p>
        </section>
      </div>

      <h2>{t("bomTitle")}</h2>
      <table className="build-bom-table">
        <thead>
          <tr>
            <th>{t("bomRole")}</th>
            <th>{t("bomModel")}</th>
            <th>{t("bomSpec")}</th>
            <th>{t("bomPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {build.bom.map((part) => (
            <tr key={`${part.role}-${part.model}`}>
              <td>{t(`roles.${part.role}`)}</td>
              <td>{part.model}</td>
              <td>{part.spec}</td>
              <td>{money(part.priceUsd)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3}>{t("bomTotal")}</th>
            <td>{money(build.totalPriceUsd)}</td>
          </tr>
        </tfoot>
      </table>

      <h2>{t("workloadsTitle")}</h2>
      <table className="build-bom-table">
        <thead>
          <tr>
            <th>{t("workloadModel")}</th>
            <th>{t("workloadQuant")}</th>
            <th>{t("workloadFit")}</th>
            <th>{t("workloadWrite")}</th>
            <th>{t("workloadContext")}</th>
          </tr>
        </thead>
        <tbody>
          {build.workloads.map((row) => (
            <tr key={`${row.model}-${row.quant}`}>
              <td>{row.model}</td>
              <td>{row.quant}</td>
              <td>
                <span className={fitClass(row.fit)}>{fitLabel(row.fit)}</span>
              </td>
              <td>{row.estWriteTps}</td>
              <td>{row.maxContextK}K</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("assemblyTitle")}</h2>
      <ol>
        {notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ol>

      <h2>{t("faqTitle")}</h2>
      {faq.map((item) => (
        <section key={item.q}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </section>
      ))}

      <div className="row">
        {build.gpuSlug ? (
          <Link href={gpuPath(build.gpuSlug)} className="btn">
            {t("seeGpu")}
          </Link>
        ) : null}
        {build.rigId ? (
          <Link href={rigPath(build.rigId)} className="btn">
            {t("seeRig")}
          </Link>
        ) : null}
        <Link href="/can-i-run" className="btn">
          {t("seeCanIRun")}
        </Link>
        <Link href="/builds" className="btn">
          {t("backToBuilds")}
        </Link>
      </div>

      <RelatedContent title={t("relatedBuilds")} items={related} />
    </div>
  );
}
