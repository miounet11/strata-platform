import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { getReleases } from "@/lib/releases";
import { mediaUrl } from "@/lib/media";

/**
 * One card image for every page. Sharing a single image is a deliberate trade: 43k pages with a
 * per-page card would need 43k renders, and an empty card (`og:image` absent) is worse than a
 * generic one. The manifest's hero is 1024x576, so the declared size is the real one — stating
 * 1200x630 for a 1024x576 file makes some clients letterbox it.
 */
const OG_IMAGE = "/media/enriched/hero-home.png";
const OG_IMAGE_WIDTH = 1024;
const OG_IMAGE_HEIGHT = 576;

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

/** OG locales need a region subtag; Intl wants a bare language tag. */
const OG_LOCALES: Record<string, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
  de: "de_DE",
  fr: "fr_FR",
  es: "es_ES",
  pt: "pt_BR",
};

const SITE_NAME = "Strata";

export function siteMetadata(
  locale: string,
  title: string,
  description: string,
  path = "",
  index = true,
  availableLocales: readonly string[] = routing.locales,
): Metadata {
  const url = `${SITE}/${locale}${path}`;
  const languages: Record<string, string> = Object.fromEntries(
    availableLocales.map((code) => [code, `${SITE}/${code}${path}`]),
  );
  // A visitor whose language has no version gets the default rather than the 404 the locale
  // router would otherwise pick. The sitemap emits the same entry, so the two cannot disagree.
  //
  // The guard is `> 0`, not `> 1`. A page that exists in a single locale still needs to name
  // that locale in the hreflang set: without any `hreflang` a crawler cannot tell "this page
  // exists in English only" from "this page forgot to declare its alternates", and the
  // `/en/guides` index has exactly one locale with articles.
  if (availableLocales.length > 0) {
    const fallback = availableLocales.includes(routing.defaultLocale)
      ? routing.defaultLocale
      : availableLocales[0];
    languages["x-default"] = `${SITE}/${fallback}${path}`;
  }
  const ogLocale = OG_LOCALES[locale] ?? OG_LOCALES.en;
  // Resolved through mediaUrl so the card follows NEXT_PUBLIC_MEDIA_BASE to the CDN. A local
  // path would 404 for every scraper once media stopped being served from the app.
  const ogImage = mediaUrl(OG_IMAGE);
  return {
    // Without this, Next resolves a relative `og:image` against `http://localhost:3000`, which
    // is the default it falls back to at build time. Canonical is already absolute, so this keeps
    // every URL a scraper sees on the same host.
    metadataBase: new URL(SITE),
    title: `${title} · ${SITE_NAME}`,
    description,
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: url, languages },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: availableLocales
        .filter((code) => code !== locale)
        .map((code) => OG_LOCALES[code])
        .filter(Boolean),
      type: "website",
      images: ogImage ? [{ url: ogImage, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE}/#software`,
    name: "Strata",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    downloadUrl: "https://github.com/Niko1221/Strata/releases/latest",
    softwareVersion: (getReleases().releases[0]?.tag ?? "v0.1.40.3").replace(/^v/i, ""),
    description:
      "Run Qwen3.8-Flash-Next locally on consumer GPUs with an OpenAI-compatible API.",
  };
}
