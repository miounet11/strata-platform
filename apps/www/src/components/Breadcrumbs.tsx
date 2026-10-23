"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { hubKeyFor, STATIC_PATHS } from "@/lib/routes";

/**
 * The trail above a page's title.
 *
 * It is derived from the pathname rather than passed in per page: a page cannot forget to
 * declare where it sits, and a detail page added later (`/gpus/<slug>`, `/releases/<tag>`) gets
 * a correct trail without touching this file. The final crumb is the page itself and is not a
 * link, so a crawler never sees a page pointing at its own URL as its parent.
 *
 * The same trail is emitted as `BreadcrumbList` JSON-LD by `breadcrumbJsonLd` in
 * `lib/breadcrumbs`, so the visible navigation and the structured data cannot disagree.
 */
export function Breadcrumbs({
  label,
  parents,
}: {
  label?: string;
  /**
   * Intermediate levels the pathname cannot express, e.g. a card's vendor and series.
   *
   * `/gpus/rtx-4090` says nothing about which vendor or family the card belongs to, yet both
   * have pages. Without these the trail skips two real hubs and every card has one fewer
   * inbound link.
   */
  parents?: Array<{ href: string; text: string }>;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return null;

  const hub = parts[0];
  const hubKey = hubKeyFor(pathname);
  const isHub = parts.length === 1;
  // The hub name is only a link when we are on a child page; on the hub itself it is the current
  // page and renders as plain text, matching the last-crumb rule below.
  const trail: Array<{ href: string | null; text: string }> = [{ href: "/", text: t("home") }];

  if (hubKey && (STATIC_PATHS as readonly string[]).includes(`/${hub}`)) {
    trail.push({ href: isHub ? null : `/${hub}`, text: t(hubKey) });
  }

  for (const parent of parents ?? []) {
    if (parent.text.trim()) trail.push({ href: parent.href, text: parent.text });
  }

  const leaf = label?.trim();
  if (!isHub && leaf) trail.push({ href: null, text: leaf });

  // A single crumb (the home page) is not a trail worth showing.
  if (trail.length < 2) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => (
          <li key={`${crumb.text}-${index}`}>
            {crumb.href ? <Link href={crumb.href}>{crumb.text}</Link> : <span aria-current="page">{crumb.text}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
