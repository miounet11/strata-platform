import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { seoMetadata } from "@/lib/seo-messages";
import { jsonLdGraph, pageLd } from "@/lib/jsonld";
import { SITE } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "login", "/login", false);
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  const pageTitle = t("loginTitle");

  return (
    <div className="container page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdGraph([pageLd(SITE, locale, "/login", pageTitle, { type: "WebPage" })])) }}
      />

      <h1>{t("loginTitle")}</h1>
      <p className="page-intro">{t("apiHint")}</p>
      <AuthForm mode="login" />
    </div>
  );
}
