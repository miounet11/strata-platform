import { getTranslations } from "next-intl/server";
import { siteMetadata } from "@/lib/seo";

/**
 * Most pages describe themselves with the same copy in every locale, so the
 * title/description live in `messages/*.json` under `seo.<key>`.
 */
export async function seoMetadata(
  locale: string,
  key: string,
  path: string,
  index = true,
  title?: string,
  description?: string,
  availableLocales?: readonly string[],
) {
  const t = await getTranslations({ locale, namespace: "seo" });
  return siteMetadata(
    locale,
    title ?? t(`${key}.title`),
    description ?? t(`${key}.description`),
    path,
    index,
    availableLocales,
  );
}
