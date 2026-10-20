import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/AuthForm";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Sign in", "Strata account for downloads and bookmarks.", "/login", false);
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="container page">
      <h1>{t("loginTitle")}</h1>
      <p className="page-intro">{t("apiHint")}</p>
      <AuthForm mode="login" />
    </div>
  );
}
