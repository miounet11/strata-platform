import type { Metadata } from "next";
import { getReleases } from "@/lib/releases";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stratat.com";

export function siteMetadata(
  locale: string,
  title: string,
  description: string,
  path = "",
  index = true,
): Metadata {
  const url = `${SITE}/${locale}${path}`;
  return {
    title: `${title} · Strata`,
    description,
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE}/en${path}`,
        zh: `${SITE}/zh${path}`,
        ja: `${SITE}/ja${path}`,
        de: `${SITE}/de${path}`,
        fr: `${SITE}/fr${path}`,
        es: `${SITE}/es${path}`,
        pt: `${SITE}/pt${path}`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Strata",
      locale,
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
