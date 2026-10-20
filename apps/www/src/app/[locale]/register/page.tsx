import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Register", "Create a Strata platform account.", "/register", false);
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
