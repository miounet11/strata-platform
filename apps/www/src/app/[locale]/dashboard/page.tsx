import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardPanel } from "@/components/DashboardPanel";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Dashboard", "Bookmarks and download history for your Strata account.", "/dashboard", false);
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
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <p style={{ color: "var(--muted)", maxWidth: "40rem" }}>{t("intro")}</p>
      <DashboardPanel />
    </div>
  );
}
