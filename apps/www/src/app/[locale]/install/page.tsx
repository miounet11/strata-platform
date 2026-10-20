import { EnrichedCode, EnrichedImage } from "@/components/EnrichedBlock";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getReleases } from "@/lib/releases";
import { seoMetadata } from "@/lib/seo-messages";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return seoMetadata(locale, "install", "/install");
}

export default async function InstallPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("install");
  const home = await getTranslations("home");
  const version = getReleases().releases[0]?.tag ?? "v0.1.40.3";

  return (
    <div className="container page">
      <h1>{t("title")}</h1>
      <EnrichedImage id="install-guide" locale={locale} />
      <section className="card section">
        <h2>{t("windows")}</h2>
        <ol style={{ lineHeight: 1.8 }}>
          <li>
            Download or clone{" "}
            <a href="https://github.com/Niko1221/Strata">Niko1221/Strata</a>
          </li>
          <li>
            Double-click <code>START-HERE.bat</code>
          </li>
          <li>Accept the recommended model and settings</li>
          <li>
            When it's ready, open <code>http://127.0.0.1:8080</code>
          </li>
        </ol>
        <p className="meta" style={{ marginBottom: 0 }}>
          Update later with <code>UPDATE.bat</code> · {version}
        </p>
      </section>
      <section className="card section">
        <h2>{t("linux")}</h2>
        <pre className="copy-block">{`git clone https://github.com/Niko1221/Strata.git
cd Strata
./setup.sh`}</pre>
        <p className="meta" style={{ marginBottom: 0 }}>
          Run <code>./setup.sh</code> again to start; <code>./update.sh</code> to update.
        </p>
      </section>
      <section className="card section">
        <h2>{t("desktopApp")}</h2>
        <p style={{ color: "var(--muted)" }}>{t("desktopHint")}</p>
        <p className="meta" style={{ marginBottom: 0 }}>
          Build from this repo: <code>pnpm --filter @stratat/desktop tauri:build</code> (requires Rust).
        </p>
      </section>
      <section className="section">
        <h2>{home("aiPromptTitle")}</h2>
        <pre className="copy-block">{home("aiPromptCopy")}</pre>
      </section>
      <EnrichedCode id="demo-api-curl" locale={locale} />
    </div>
  );
}
