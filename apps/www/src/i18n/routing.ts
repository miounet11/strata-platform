import { defineRouting } from "next-intl/routing";

export const locales = ["en", "zh", "ja", "de", "fr", "es", "pt"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales: [...locales],
  defaultLocale: "en",
  localePrefix: "always",
  // HTML hreflang comes from siteMetadata (/en/...). next-intl's Link header used unprefixed /vps as x-default (404).
  alternateLinks: false,
});
