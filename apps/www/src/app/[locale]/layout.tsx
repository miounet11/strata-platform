import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { guideLocaleMap } from "@/lib/articles";
import { SiteFooter } from "@/components/SiteFooter";
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
  const messages = await getMessages();
  // Guides are written per locale, not translated, so the switcher must only offer the
  // languages that actually published this slug. Resolved on the server, passed as data.
  const guideLocales = guideLocaleMap();
  const t = await getTranslations("nav");

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {/* Keyboard users must be able to jump the header on every page; `main` carries
              id="main-content" so this target exists everywhere, including the 404 body. */}
          <a href="#main-content" className="skip-link">
            {t("skipToContent")}
          </a>
          <SiteHeader guideLocales={guideLocales} />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
