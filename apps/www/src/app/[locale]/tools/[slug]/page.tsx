import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AgentStudioTool } from "@/features/tools/agent-studio/AgentStudioTool";
import { BenchmarkScatterTool } from "@/features/tools/benchmark-scatter/BenchmarkScatterTool";
import { GpuCompareTool } from "@/features/tools/gpu-compare/GpuCompareTool";
import { InstallWizardTool } from "@/features/tools/install-wizard/InstallWizardTool";
import { MultiGpuPlannerTool } from "@/features/tools/multi-gpu-planner/MultiGpuPlannerTool";
import { PcBuilderTool } from "@/features/tools/pc-builder/PcBuilderTool";
import { QuantExplorerTool } from "@/features/tools/quant-explorer/QuantExplorerTool";
import { RoiCalculatorTool } from "@/features/tools/roi-calculator/RoiCalculatorTool";
import { TroubleshooterTool } from "@/features/tools/troubleshooter/TroubleshooterTool";
import { VramVisualizerTool } from "@/features/tools/vram-visualizer/VramVisualizerTool";
import { getToolsBundle } from "@/features/tools/data-adapters";
import { ALL_TOOLS, getTool } from "@/features/tools/registry";
import type { ToolSlug } from "@/features/tools/types";
import type { ToolsBundle } from "@/features/tools/types";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { jsonLdGraph, nodeId, pageLd } from "@/lib/jsonld";
import { siteMetadata, SITE } from "@/lib/seo";
import { seoMetadata } from "@/lib/seo-messages";
import { siteEntityNodes } from "@/lib/site-entities";
import { buildPath, toolPath } from "@/lib/routes";

export const revalidate = 1800;

export function generateStaticParams() {
  return ALL_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const t = await getTranslations({ locale, namespace: "tools" });
  const title = t(`items.${tool.slug}.title`);
  return siteMetadata(
    locale,
    title,
    t(`items.${tool.slug}.tagline`),
    toolPath(tool.slug),
  );
}

const COMPONENTS: Record<
  ToolSlug,
  (props: { bundle: ToolsBundle; labels?: Record<string, string>; relatedLabels?: Record<string, string> }) => React.JSX.Element
> = {
  "vram-visualizer": VramVisualizerTool,
  "gpu-compare": GpuCompareTool,
  "quant-explorer": QuantExplorerTool,
  "install-wizard": InstallWizardTool,
  "benchmark-scatter": BenchmarkScatterTool,
  "multi-gpu-planner": MultiGpuPlannerTool,
  "pc-builder": PcBuilderTool,
  troubleshooter: TroubleshooterTool,
  "roi-calculator": RoiCalculatorTool,
  "agent-studio": AgentStudioTool,
};

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const tool = getTool(slug);
  if (!tool) notFound();
  const t = await getTranslations("tools");
  const tn = await getTranslations("nav");

  // Bundle is assembled strictly on the server; never shipped as static HTML payload.
  const bundle = await getToolsBundle(locale);
  const labels: Record<string, string> = {
    title: t(`items.${tool.slug}.title`),
    tagline: t(`items.${tool.slug}.tagline`),
    subtitle: t(`items.${tool.slug}.tagline`),
    cta: t(`items.${tool.slug}.cta`),
    relatedTitle: t("relatedTitle"),
    reset: t("reset"),
    copyShare: t("copyShare"),
    copied: t("copied"),
    openTool: t("openTool"),
  };
  const relatedLabels: Record<string, string> = Object.fromEntries(
    tool.relatedSlugs.map((s) => [s, t(`items.${s}.title`)]),
  );

  const Tool = COMPONENTS[tool.slug];
  const title = labels.title;
  const pageUrl = `${SITE}/${locale}${toolPath(tool.slug)}`;
  const pageId = nodeId(pageUrl, "webpage");
  const crumbLd = breadcrumbJsonLd(SITE, locale, [
    { path: "", name: tn("home") },
    { path: "/tools", name: t("title") },
    { name: title, id: pageId },
  ]);
  const ld = jsonLdGraph([
    ...siteEntityNodes(),
    pageLd(SITE, locale, toolPath(tool.slug), title, {
      description: labels.tagline,
    }),
    crumbLd,
  ]);

  return (
    <div className="container page tool-detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Breadcrumbs label={title} />
      <p className="eyebrow">{t(`priority.${tool.priority}`)} · {t(`categories.${tool.category}`)}</p>
      <h1>{title}</h1>
      <p className="page-intro">{labels.tagline}</p>
      <div className="tool-panel">
        <Tool bundle={bundle} labels={labels} relatedLabels={relatedLabels} />
      </div>
      {tool.relatedSlugs.length > 0 ? (
        <section className="tool-related">
          <h2>{t("relatedTitle")}</h2>
          <div className="tool-hub-grid tool-hub-grid-small">
            {tool.relatedSlugs.map((related) => (
              <a key={related} className="tool-card" href={`/${locale}${toolPath(related)}`}>
                <h3>{t(`items.${related}.title`)}</h3>
                <p>{t(`items.${related}.tagline`)}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <p className="tool-detail-cta">
        <a href={`/${locale}${buildPath("rtx-4090-workstation")}`}>{labels.cta}</a>
      </p>
    </div>
  );
}
