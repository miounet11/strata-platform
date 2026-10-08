"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import friendlyLinks from "@/data/friendly-links.json";

const UPSTREAM = "https://github.com/Niko1221/Strata";

export function SiteFooter() {
  const t = useTranslations("footer");
  const locale = useLocale();
  const lang = ["en", "zh", "ja"].includes(locale) ? locale : "en";

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="grid-3" style={{ marginBottom: "1.5rem" }}>
          <div>
            <strong>{t("engine")}</strong>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", lineHeight: 1.7 }}>
              <li>
                <a href={UPSTREAM} rel="noopener noreferrer">
                  Niko1221/Strata
                </a>
              </li>
              <li>
                <Link href="/install">{t("install")}</Link>
              </li>
              <li>
                <Link href="/benchmarks">{t("benchmarks")}</Link>
              </li>
              <li>
                <Link href="/download">{t("desktop")}</Link>
              </li>
            </ul>
          </div>
          <div>
            <strong>{t("creator")}</strong>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", lineHeight: 1.7 }}>
              <li>
                <Link href="/creator">{t("creatorFeed")}</Link>
              </li>
              <li>
                <a href="https://x.com/coldniko" rel="me noopener noreferrer">
                  @coldniko
                </a>
              </li>
            </ul>
          </div>
          <div>
            <strong>{t("friends")}</strong>
            <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0", lineHeight: 1.7 }}>
              {friendlyLinks.friends.map((f) => (
                <li key={f.url}>
                  <a href={f.url} rel="friend noopener noreferrer">
                    {f.name}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/links">{t("allLinks")}</Link>
              </li>
            </ul>
          </div>
        </div>
        <p style={{ margin: 0 }}>
          {t("tagline")} ·{" "}
          <a href={`https://stratat.com/${lang}`}>stratat.com</a>
        </p>
      </div>
    </footer>
  );
}
