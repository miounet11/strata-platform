import { routing } from "@/i18n/routing";
import { getReleases } from "@/lib/releases";
import { SITE } from "@/lib/seo";

/**
 * Site-wide entity graph: Organization, WebSite and SoftwareApplication.
 *
 * These three nodes used to be absent or restated inline on every page, which means a crawler
 * saw the same product described by a different anonymous node each time. Naming them once with
 * a stable `@id` lets every page reference `#organization` / `#website` / `#software` instead of
 * repeating them, so an AI answer can attribute a fact to one entity rather than to a string.
 *
 * `alternateName` matters more than it looks: an assistant asked about "Strata local LLM" and
 * one asked about "Strata desktop app" are asking about the same thing, and the alias is what
 * lets the entity resolution join them.
 */
export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;
export const SOFTWARE_ID = `${SITE}/#software`;
export const PERSON_ID = `${SITE}/#person`;

const GITHUB = "https://github.com/Niko1221/Strata";
const CREATOR_X = "https://x.com/coldniko";

/** The product's own aliases, as people actually type them. */
const SOFTWARE_ALIASES = [
  "Strata",
  "Strata Desktop",
  "Strata local AI",
  "Strata local LLM",
  "Strata OpenAI-compatible server",
];

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Strata",
    alternateName: ["Strata Desktop", "Strata local AI"],
    url: SITE,
    logo: { "@type": "ImageObject", url: `${SITE}/media/enriched/hero-home.png` },
    sameAs: [GITHUB, CREATOR_X],
    founder: { "@id": PERSON_ID },
  };
}

export function personLd() {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: "Niko Veit",
    alternateName: "coldniko",
    url: CREATOR_X,
    sameAs: [CREATOR_X, "https://github.com/Niko1221", "https://t.me/veit06"],
    knowsAbout: [
      "local large language model inference",
      "GPU memory bandwidth",
      "quantization",
      "OpenAI-compatible APIs",
    ],
  };
}

export function websiteLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: "Strata",
    alternateName: ["stratat.com"],
    url: SITE,
    inLanguage: routing.locales,
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}/en/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareLd() {
  const release = getReleases().releases[0];
  return {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: "Strata",
    alternateName: SOFTWARE_ALIASES,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Local LLM runtime",
    operatingSystem: "Windows, Linux",
    url: SITE,
    downloadUrl: `${GITHUB}/releases/latest`,
    softwareVersion: (release?.tag ?? "v0.1.40.3").replace(/^v/i, ""),
    datePublished: release?.publishedAt,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: "https://github.com/Niko1221/Strata/blob/main/LICENSE",
    isAccessibleForFree: true,
    description:
      "Run Qwen3.8-Flash-Next locally on consumer GPUs behind an OpenAI-compatible API on http://127.0.0.1:8080/v1.",
    publisher: { "@id": ORG_ID },
    author: { "@id": PERSON_ID },
  };
}

/**
 * The nodes every page should carry. Pages add their own WebPage/Article node and reference
 * these by `@id`, so the graph root stays a single description of who publishes the page.
 */
export function siteEntityNodes(): Record<string, unknown>[] {
  return [organizationLd(), personLd(), websiteLd(), softwareLd()];
}
