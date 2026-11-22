import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LocaleAvailabilityProvider } from "@/components/LocaleAvailability";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const allMessages = (await getMessages()) as Record<string, Record<string, unknown>>;
  // Only send the tiny layout namespaces (`nav`, `footer`, plus `community.labelsTitle` used
  // in the footer) into every page's RSC payload. Sending the entire `messages/*.json` plus
  // `guideLocaleMap()` inflated every page by ~50-100 KB and tripped the 180 KB HTML budget.
  const layoutMessages = {
    nav: allMessages.nav,
    footer: allMessages.footer,
    community: { labelsTitle: allMessages.community?.labelsTitle },
  };
  const t = await getTranslations("nav");

  return (
    <html lang={locale}>
      <head>
        {/* The body face is read on every paint, so it is fetched ahead of the stylesheet's
            own request rather than discovered late. `crossOrigin` is required even same-origin:
            font requests are always CORS-mode and would otherwise be fetched twice. */}
        <link
          rel="preload"
          href="/fonts/inter-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={layoutMessages}>
          <LocaleAvailabilityProvider>
            {/* Keyboard users must be able to jump the header on every page; `main` carries
                id="main-content" so this target exists everywhere, including the 404 body. */}
            <a href="#main-content" className="skip-link">
              {t("skipToContent")}
            </a>
            <SiteHeader />
            <main id="main-content">{children}</main>
            <SiteFooter />
          </LocaleAvailabilityProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
