import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EnrichedImage } from "@/components/EnrichedBlock";
import { engineVariantLabel, engineVariantRank, getDownloads } from "@/lib/downloads";
import { seoMetadata } from "@/lib/seo-messages";

export const revalidate = 1800;

type DesktopAsset = { name: string; platform: string; downloadUrl: string; sizeBytes: number };

/** Our client builds live in this repo, published by .github/workflows/desktop-build.yml. */
const DESKTOP_REPO = "miounet11/strata-platform";

const PLATFORM_LABEL: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

function fmt(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "download", "/download");
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
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">{t("intro")}</p>
      <p className="meta">
        {t("synced")} {syncedAt.slice(0, 16).replace("T", " ")} · {engine.tag}
      </p>

      <section className="card section">
        <h2 style={{ marginTop: 0 }}>{t("windowsEngine")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("windowsEngineHint")}</p>
        <div className="hero-actions">
          {engine.assets
            .filter((a) => a.platform === "windows")
            .sort((a, b) => engineVariantRank(a.name, a.variant) - engineVariantRank(b.name, b.variant))
            .map((a) => (
              <a key={a.name} className="btn btn-primary btn-lg" href={a.downloadUrl} rel="noopener noreferrer">
                {engineVariantLabel(a.name, a.variant)} ({fmt(a.sizeBytes)})
              </a>
            ))}
        </div>
        <p className="meta" style={{ marginBottom: 0 }}>
          <Link href={`/releases/${engine.tag}`}>{t("releaseNotes")}</Link>
          {" · "}
          <a href={engine.url} rel="noopener noreferrer">
            {tr("readGithub")}
          </a>
        </p>
      </section>

      <section className="card section">
        <h2 style={{ marginTop: 0 }}>{t("macEngine")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("macEngineHint")}</p>
        <div className="hero-actions">
          {engine.assets
            .filter((a) => a.platform === "linux" || a.platform === "macos")
            .sort(
              (a, b) =>
                engineVariantRank(a.name, a.variant) - engineVariantRank(b.name, b.variant) ||
                a.name.localeCompare(b.name),
            )
            .map((a) => (
              <a key={a.name} className="btn" href={a.downloadUrl} rel="noopener noreferrer">
                {a.platform === "macos" ? "macOS" : "Linux"} · {engineVariantLabel(a.name, a.variant)}
              </a>
            ))}
        </div>
        <pre className="copy-block">{macEngine.setupCommand}</pre>
      </section>

      <section className="card section">
        <h2 style={{ marginTop: 0 }}>{t("desktopApp")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("desktopHint")}</p>
        {desktopAssets.length > 0 ? (
          <div className="hero-actions">
            {desktopAssets.map((a) => (
              <a key={a.name} className="btn btn-primary" href={a.downloadUrl}>
                {PLATFORM_LABEL[a.platform] ?? a.platform} — {a.name} ({fmt(a.sizeBytes)})
              </a>
            ))}
          </div>
        ) : (
          <div className="hero-actions">
            <a className="btn" href={`https://github.com/${DESKTOP_REPO}/releases`}>
              {t("desktopFallbackZip")}
            </a>
          </div>
        )}
        <p className="meta" style={{ marginBottom: 0 }}>
          {t("desktopCi")}{" "}
          <a href="https://www.stratat.com/en/download">www.stratat.com</a>
        </p>
      </section>

      <EnrichedImage id="download-desktop" locale={locale} />
    </div>
  );
}
