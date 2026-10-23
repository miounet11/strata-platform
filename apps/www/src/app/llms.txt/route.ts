import { routing } from "@/i18n/routing";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/routes";
import { getReleases } from "@/lib/releases";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

/**
 * `/llms.txt` — the site described for a model rather than for a browser.
 *
 * The convention (llmstxt.org) is an H1, a one-line blockquote summary, then markdown link
 * sections. The point is not marketing: an assistant that can read this answers "what is this
 * site, and where do the real pages live" without fetching and parsing 43k HTML documents.
 *
 * Generated from the same `routes.ts` the navigation and sitemap use, so a page cannot be
 * public in one place and missing here. Cached because it changes only when the route model or
 * the latest release does.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

function absolute(path: string, locale: string) {
  return `${SITE}/${locale}${path}`;
}

export function GET() {
  const latest = getReleases().releases[0];
  const locales = routing.locales;

  const sections: string[] = [];

  sections.push(`# Strata`);
  sections.push(
    `\n> Strata runs large language models locally on consumer GPUs and exposes them through an OpenAI-compatible API. Documentation, GPU compatibility data, benchmark results and release notes live on this site.\n`,
  );

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
    `${locales.length} locales are served: ${locales.join(", ")}. Every page above exists under each prefix (\`/${locales[0]}/...\`, \`/${locales[1]}/...\`), with \`x-default\` pointing at \`/${routing.defaultLocale}\`.\n`,
  );

  sections.push(`\n## Notes for retrieval\n`);
  sections.push(
    `- GPU detail pages live at \`/{locale}/gpus/{slug}\`; benchmark pages at \`/{locale}/benchmarks/{rig}\`.`,
  );
  sections.push(`- Guides are written per locale and are not machine translations of a single source.`);
  sections.push(`- Media (images, audio) is served from \`https://file.stratat.com\`.\n`);

  return new Response(sections.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
