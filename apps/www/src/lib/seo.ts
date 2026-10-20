import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { getReleases } from "@/lib/releases";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

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
): Metadata {
  const url = `${SITE}/${locale}${path}`;
  const languages = Object.fromEntries(
    routing.locales.map((code) => [code, `${SITE}/${code}${path}`]),
  );
  const ogLocale = OG_LOCALES[locale] ?? OG_LOCALES.en;
  return {
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
      alternateLocale: Object.values(OG_LOCALES).filter((code) => code !== ogLocale),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
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
