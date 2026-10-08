"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const primary = [
  ["/", "home"],
  ["/releases", "releases"],
  ["/benchmarks", "benchmarks"],
  ["/pulse", "pulse"],
  ["/download", "download"],
  ["/install", "install"],
] as const;

const more = [
  ["/creator", "creator"],
  ["/models", "models"],
  ["/community", "community"],
  ["/issues", "issues"],
  ["/pulls", "pulls"],
  ["/links", "links"],
  ["/changelog", "changelog"],
  ["/dashboard", "dashboard"],
  ["/login", "login"],
  ["/register", "register"],
] as const;

export function SiteHeader() {
  const t = useTranslations("nav");
  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="logo">
          Strata
        </Link>
        <nav aria-label="Main">
          <ul>
            {primary.map(([href, key]) => (
              <li key={key}>
                <Link href={href}>{t(key)}</Link>
              </li>
            ))}
            <li>
              <details className="nav-more">
                <summary>{t("more")}</summary>
                <ul>
                  {more.map(([href, key]) => (
                    <li key={key}>
                      <Link href={href}>{t(key)}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
