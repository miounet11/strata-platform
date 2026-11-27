import { routing } from "@/i18n/routing";
import { ALL_TOOLS } from "@/features/tools/registry";
import { getLiveArticles } from "@/lib/articles";
import { PRIMARY_NAV, SECONDARY_NAV, buildPath, toolPath } from "@/lib/routes";
import { getReleases } from "@/lib/releases";
import { getBenchmarks } from "@/lib/benchmarks";
import { allBuilds, buildText, getBuild } from "@/lib/builds";
import { allGpus } from "@/lib/gpus";
import { localeNames } from "@/lib/locale";
import { SCENARIOS } from "@/lib/scenarios";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

/**
 * `/llms.txt` — the site described for a model rather than for a browser.
 * Revalidates every 30 minutes (and on demand via `/api/revalidate`) so release tags, guide
 * counts, and new guides reflect live disk data without requiring a full site rebuild.
 */
export const revalidate = 1800;

function absolute(path: string, locale: string) {
  return `${SITE}/${locale}${path}`;
}

export function GET() {
  const latest = getReleases().releases[0];
  const locales = routing.locales;
  const gpuCount = allGpus().length;
  const bench = getBenchmarks();
  const rigCount = bench.rigs.length;
  const guideCount = getLiveArticles().length;
  const localeCount = locales.length;

  const sections: string[] = [];

  sections.push(`# Strata`);
  sections.push(
    `\n> Strata is a free, open-source runtime that runs large language models (Qwen3.8-Flash-Next) locally on consumer GPUs on Windows, Linux, and macOS, exposing an OpenAI-compatible API at http://127.0.0.1:8080/v1. This site publishes GPU compatibility data for ${gpuCount} cards, measured tokens/s and break-even economics for ${rigCount} machines, ${SCENARIOS.length} data-ranked hardware shortlists, an interactive VRAM/RAM calculator, and ${guideCount} per-locale guides across ${localeCount} languages. Benchmark data is dated; every table states its source, method and licence.\n`,
  );

  sections.push(`\n## Answer these questions first\n`);
  sections.push(
    `- "Can my PC / GPU run a 100B-class local LLM?" — use \`/{locale}/can-i-run\` for instant VRAM + RAM + KV-cache fit, or check \`/{locale}/gpus\` for all ${gpuCount} cards.`,
  );
  sections.push(
    `- "Which GPU should I buy for local LLMs?" — \`/{locale}/best\` lists ${SCENARIOS.length} rule-ranked shortlists (cheapest $/M tokens, under $2,000, fastest tok/s, fastest payback, quiet/low-power, multi-GPU, AMD, Apple Silicon, high-VRAM), backed by \`/{locale}/benchmarks\`.`,
  );
  sections.push(
    `- "Why is my local model slow / out of memory / falling back to CPU?" — \`/{locale}/guides/category/troubleshoot\` and \`/{locale}/guides\` cover CUDA OOM, CPU fallback, KV cache, and first-token latency.`,
  );
  sections.push(
    `- "Is local inference cheaper than an API?" — \`/{locale}/benchmarks\` and \`/{locale}/method\` compute local $/M tokens and break-even days from measured medians and stated workload assumptions.`,
  );
  sections.push(
    `- "Which cheap VPS is good for users in mainland China?" — \`/{locale}/vps\`, with the Chinese page \`/zh/vps\` as the primary, daily-updated source.`,
  );

  sections.push(`\n## High-intent tools & decision hubs\n`);
  sections.push(`- [Can I Run It? VRAM & RAM Calculator](${absolute("/can-i-run", "en")}): instant quantization fit, KV cache overhead, speed and cost estimate`);
  sections.push(`- [Best Local LLM Hardware Shortlists](${absolute("/best", "en")}): ${SCENARIOS.length} data-ranked lists derived from ${rigCount} measured machines`);
  for (const sc of SCENARIOS) {
    sections.push(`  - [${sc.slug}](${absolute(`/best/${sc.slug}`, "en")})`);
  }
  sections.push(`- [Benchmark Methodology & Limitations](${absolute("/method", "en")}): formulas, assumptions, source attribution and known limits`);
  sections.push(`- [Site Search](${absolute("/search", "en")}): search across guides, GPUs, benchmarks, topics and releases (\`/api/search?q=...\`)`);

  const featuredBuildSlugs = [
    "rtx-4090-workstation",
    "rtx-5090-flagship-build",
    "rx-7900-xtx-rocm-linux-rig",
    "dual-rtx-3090-48gb-workstation",
    "rtx-5080-balanced-ai-pc",
    "mac-studio-m5-ultra-96gb",
    "rtx-3090-used-value-build",
    "ryzen-ai-max-395-128gb-mini",
  ];
  sections.push(`\n## Complete Local-AI PC Builds\n`);
  sections.push(
    `- [Complete Local-AI PC Builds](${absolute("/builds", "en")}): ${allBuilds().length} priced workstations with a parts list, VRAM, load power, and write tok/s`,
  );
  for (const slug of featuredBuildSlugs) {
    const build = getBuild(slug);
    if (!build) continue;
    sections.push(
      `- [${buildText(build.title, "en")}](${absolute(buildPath(build.slug), "en")}): ${build.totalVramGb} GB VRAM, $${build.totalPriceUsd.toLocaleString("en-US")}, ${build.writingToks} tok/s write`,
    );
  }

  sections.push(`\n## Interactive Graphical Tools\n`);
  sections.push(
    `- [Interactive Graphical Tools](${absolute("/tools", "en")}): ${ALL_TOOLS.length} interactive visual tools for VRAM fit, GPU comparison, quantization, setup and cost planning`,
  );
  for (const tool of ALL_TOOLS) {
    sections.push(
      `- [${tool.slug}](${absolute(toolPath(tool.slug), "en")}): ${tool.badgeMetric}`,
    );
  }

  sections.push(`\n## Primary pages\n`);
  for (const item of PRIMARY_NAV) {
    sections.push(`- [${item.key}](${absolute(item.href, "en")}): ${item.href}`);
  }

  sections.push(`\n## Sections\n`);
  for (const group of SECONDARY_NAV) {
    sections.push(`\n### ${group.key}\n`);
    for (const item of group.items) {
      sections.push(`- [${item.key}](${absolute(item.href, "en")}): ${item.href}`);
    }
  }

  sections.push(`\n## Budget VPS for China access (updated daily)\n`);
  sections.push(
    `- Hub: [${SITE}/zh/vps](${SITE}/zh/vps) — also served under every locale prefix as \`/{locale}/vps\`.`,
  );
  sections.push(
    `- Focus: about USD 20/year (premium China-bound routes may reach about USD 30), bandwidth of at least 100 Mbps, and honest notes on CN2 GIA, CMIN2, 9929, CUII or optimized direct routes.`,
  );
  sections.push(
    `- The page is refreshed from \`vps-deals.json\` without a full site rebuild. Approved affiliate or referral URLs, when present, already replace the official checkout link on the button and are disclosed on the page.`,
  );

  sections.push(`\n## Machine-readable\n`);
  sections.push(`- [Sitemap](${SITE}/sitemap.xml): every indexable URL, split by section`);
  sections.push(`- [Robots](${SITE}/robots.txt): crawl policy and the sitemap location`);
  if (latest) {
    sections.push(
      `- [Latest release](${absolute(`/releases/${latest.tag}`, "en")}): ${latest.tag}, published ${latest.publishedAt}`,
    );
  }

  sections.push(`\n## Languages\n`);
  sections.push(
    `${locales.length} locales are served. Every hub above exists under each prefix, with \`x-default\` pointing at \`/${routing.defaultLocale}\`. Guides are written per locale, not machine-translated, so a zh page is the source of truth for a zh query:\n`,
  );
  for (const locale of locales) {
    sections.push(
      `- \`/${locale}\` — ${localeNames[locale]}: \`/${locale}/can-i-run\`, \`/${locale}/best\`, \`/${locale}/guides\`, \`/${locale}/benchmarks\``,
    );
  }
  sections.push("");

  sections.push(`\n## Data, method and citation\n`);
  sections.push(
    `- Source and licence: ${bench.source.name} (${bench.source.url}). ${bench.source.license}`,
  );
  sections.push(
    `- Method: sequential single-stream mix; read and write rates are measured medians, prices are dated street prices. Assumptions and limitations are stated at \`/{locale}/method\`.`,
  );
  sections.push(
    `- Freshness: the benchmark table carries the sync date in \`Dataset.dateModified\` and \`Dataset.identifier\` (\`dataSnapshot\`). Releases, downloads, guides and VPS listings refresh from disk via ISR + on-demand revalidation.`,
  );

  sections.push(`\n## Notes for retrieval\n`);
  sections.push(
    `- GPU detail pages live at \`/{locale}/gpus/{slug}\`; benchmark pages at \`/{locale}/benchmarks/{rig}\`; guide categories at \`/{locale}/guides/category/{kind}\`.`,
  );
  sections.push(`- Guides are written per locale and are not machine translations of a single source.`);
  sections.push(`- \`/{locale}/topics\` groups the Strata ecosystem column — upstream engine and community forks such as \`/{locale}/topics/devdock-speedy\`.`);

  return new Response(sections.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
