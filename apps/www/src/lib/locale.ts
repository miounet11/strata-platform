import { routing, type Locale } from "@/i18n/routing";

/**
 * Route params and data files can hand us arbitrary strings ("opengraph-image",
 * a stale tag, …). Intl throws RangeError on those, so every formatter must
 * narrow to a supported locale first.
 */
export function resolveLocale(value: string | undefined | null): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  pt: "Português",
};

export function formatNumber(value: number, locale: string): string {
  return value.toLocaleString(resolveLocale(locale));
}
