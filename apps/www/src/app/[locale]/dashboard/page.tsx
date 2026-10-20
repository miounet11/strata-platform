import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardPanel } from "@/components/DashboardPanel";
import { seoMetadata } from "@/lib/seo-messages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "dashboard", "/dashboard", false);
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  return (
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <DashboardPanel />
    </div>
  );
}
