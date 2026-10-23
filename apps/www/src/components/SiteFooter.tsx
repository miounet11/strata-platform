"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import friendlyLinks from "@/data/friendly-links.json";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/routes";

const UPSTREAM = "https://github.com/Niko1221/Strata";

/** Route the primary row owns but the secondary groups do not, so the footer can add them once. */
const SECONDARY_HREFS = new Set(SECONDARY_NAV.flatMap((group) => group.items.map((item) => item.href)));
const PRIMARY_ONLY = PRIMARY_NAV.filter((item) => !SECONDARY_HREFS.has(item.href));

/**
 * The footer carries the full route map, not just a short list of highlights.
 *
 * The header hides the secondary rows behind a `<details>` menu: the markup is in the HTML, but
 * a reader has to open it to see the links and an HTML-only crawler following anchors from the
 * top of the page may not reach them. Rendering the same groups here, expanded, gives every
 * public page a direct link to every hub.
 *
 * The primary row is repeated too (minus what a group already lists) and `/community/labels` is
 * added: without it the label pages sit four clicks from the home page, which is deep enough
 * that a crawl of the site spends most of its budget there.
 */
export function SiteFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  // The labels index has no `nav.*` key; its own heading is the link text here.
  const community = useTranslations("community");
  const locale = useLocale();
  const lang = ["en", "zh", "ja"].includes(locale) ? locale : "en";

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          {SECONDARY_NAV.map((group) => (
            <div key={group.key}>
              <strong>{t(`groups.${group.key}`)}</strong>
              <ul>
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href}>{nav(item.key)}</Link>
                  </li>
                ))}
                {group.key === "site" ? (
                  <>
                    {PRIMARY_ONLY.map((item) => (
                      <li key={`primary-${item.key}`}>
                        <Link href={item.href}>{nav(item.key)}</Link>
                      </li>
                    ))}
                    <li>
                      <Link href="/community/labels">{community("labelsTitle")}</Link>
                    </li>
                  </>
                ) : null}
              </ul>
            </div>
          ))}
          <div>
            <strong>{t("creator")}</strong>
            <ul>
              <li>
                <Link href="/creator">{t("creatorFeed")}</Link>
              </li>
              <li>
                <Link href="/install">{t("install")}</Link>
              </li>
              <li>
                <a href={UPSTREAM} rel="noopener noreferrer">
                  GitHub · Niko1221/Strata
                </a>
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
            <ul>
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
