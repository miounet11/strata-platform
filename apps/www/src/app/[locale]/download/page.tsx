import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { engineVariantLabel, engineVariantRank, getDownloads } from "@/lib/downloads";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

type DesktopAsset = { name: string; platform: string; downloadUrl: string; sizeBytes: number };

function fmt(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Download", "Strata engine (Windows) and Desktop launcher for Windows and macOS.", "/download");
}

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("download");
  const tr = await getTranslations("releases");
  const downloads = getDownloads();
  const { engine, macEngine, syncedAt } = downloads;
  const desktopAssets: DesktopAsset[] = [...(downloads.desktop.assets ?? [])];

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <EnrichedImage id="download-desktop" locale={locale} />
      <p style={{ color: "var(--muted)", maxWidth: "44rem" }}>{t("intro")}</p>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
        {t("synced")} {syncedAt.slice(0, 16).replace("T", " ")} · {engine.tag}
      </p>

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>{t("windowsEngine")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("windowsEngineHint")}</p>
        <div className="hero-actions">
          {[...engine.assets]
            .sort((a, b) => engineVariantRank(a.name, a.variant) - engineVariantRank(b.name, b.variant))
            .map((a) => (
              <a key={a.name} className="btn btn-primary" href={a.downloadUrl} rel="noopener noreferrer">
                {engineVariantLabel(a.name, a.variant)} ({fmt(a.sizeBytes)})
              </a>
            ))}
        </div>
        <p style={{ marginTop: "0.75rem" }}>
          <Link href={`/releases/${engine.tag}`}>{t("releaseNotes")}</Link>
          {" · "}
          <a href={engine.url} rel="noopener noreferrer">
            {tr("readGithub")}
          </a>
        </p>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("macEngine")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("macEngineHint")}</p>
        <pre className="copy-block">{macEngine.setupCommand}</pre>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("desktopApp")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("desktopHint")}</p>
        {desktopAssets.length > 0 ? (
          <div className="hero-actions">
            {desktopAssets.map((a) => (
              <a key={a.name} className="btn btn-primary" href={a.downloadUrl}>
                {a.platform === "macos" ? "macOS" : "Windows"} — {a.name} ({fmt(a.sizeBytes)})
              </a>
            ))}
          </div>
        ) : (
          <div className="hero-actions">
            <a className="btn" href="https://github.com/Niko1221/Strata/archive/refs/heads/main.zip">
              {t("desktopFallbackZip")}
            </a>
          </div>
        )}
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: "0.75rem" }}>
          {t("desktopCi")}{" "}
          <a href="https://www.stratat.com/en/download">www.stratat.com</a>
        </p>
      </section>
    </div>
  );
}
