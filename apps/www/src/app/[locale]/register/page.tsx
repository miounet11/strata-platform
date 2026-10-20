import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { seoMetadata } from "@/lib/seo-messages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "register", "/register", false);
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="container page">
      <h1>{t("registerTitle")}</h1>
      <p className="page-intro">{t("apiHint")}</p>
      <AuthForm mode="register" />
    </div>
  );
}
