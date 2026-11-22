"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { localeNames, resolveLocale } from "@/lib/locale";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/routes";
import { useAvailableLocales } from "./LocaleAvailability";

export function SiteHeader() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const active = resolveLocale(useLocale());

  // Pages that only exist in a subset of locales (`/guides/[slug]`, `/topics/[slug]`) register
  // their own locale list via `<RegisterLocales />`, keeping the site-wide layout payload small.
  const registered = useAvailableLocales();
  const locales: readonly string[] = registered?.length ? registered : routing.locales;

  function isCurrent(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="logo">
          Strata
        </Link>
        <nav aria-label="Main">
          <ul>
            {PRIMARY_NAV.map((item) => (
              <li key={item.key}>
                <Link href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>
                  {t(item.key)}
                </Link>
              </li>
            ))}
            <li>
              <details className="nav-more">
                <summary>{t("more")}</summary>
                <ul>
                  {SECONDARY_NAV.flatMap((group) =>
                    group.items.map((item) => (
                      <li key={`${group.key}-${item.key}`}>
                        <Link href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>
                          {t(item.key)}
                        </Link>
                      </li>
                    )),
                  )}
                </ul>
              </details>
            </li>
          </ul>
        </nav>
        <details className="nav-locale">
          <summary aria-label="Language">{active.toUpperCase()}</summary>
          <ul>
            {locales.map((code) => (
              <li key={code}>
                <Link
                  href={pathname}
                  locale={code}
                  aria-current={code === active ? "page" : undefined}
                >
                  {localeNames[code as keyof typeof localeNames] ?? code}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </header>
  );
}
