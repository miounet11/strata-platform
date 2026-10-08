import { EnrichedCode, EnrichedImage } from "@/components/EnrichedBlock";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getReleases } from "@/lib/releases";
import { siteMetadata } from "@/lib/seo";

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Install", "One-click Strata setup for Windows and Linux.", "/install");
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
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <EnrichedImage id="install-guide" locale={locale} />
      <EnrichedCode id="demo-api-curl" locale={locale} />
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2>{t("windows")}</h2>
        <ol>
          <li>
            Clone or download{" "}
            <a href="https://github.com/Niko1221/Strata">Niko1221/Strata</a>
          </li>
          <li>Double-click <code>START-HERE.bat</code></li>
          <li>Accept recommended model, context, and vision defaults</li>
          <li>Open <code>http://127.0.0.1:8080</code> when the model is ready</li>
        </ol>
        <p>
          Update engine: <code>UPDATE.bat</code> · {version} bundles CUDA 13 / HIP zips on GitHub
          Releases.
        </p>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("linux")}</h2>
        <pre className="copy-block">{`git clone https://github.com/Niko1221/Strata.git
cd Strata
./setup.sh`}</pre>
        <p>Re-run <code>./setup.sh</code> to start; <code>./update.sh</code> for engine updates.</p>
      </section>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("desktopApp")}</h2>
        <p>{t("desktopHint")}</p>
        <p>
          Build from this repo: <code>pnpm --filter @stratat/desktop tauri:build</code> (requires Rust).
        </p>
      </section>
      <h2 style={{ marginTop: "2rem" }}>{home("aiPromptTitle")}</h2>
      <pre className="copy-block">{home("aiPromptCopy")}</pre>
    </div>
  );
}
