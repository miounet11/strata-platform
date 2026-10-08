import { getTranslations, setRequestLocale } from "next-intl/server";
import { EnrichedCode, EnrichedImage } from "@/components/EnrichedBlock";
import { ModelActions } from "@/components/ModelActions";
import modelsData from "@/data/models.json";
import { siteMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return siteMetadata(locale, "Models", "Strata quant sizes, RAM requirements, and download hints.", "/models");
}

export default async function ModelsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("models");

  return (
    <div className="container" style={{ padding: "2rem 0 3rem" }}>
      <h1>{t("title")}</h1>
      <EnrichedImage id="models-vram" locale={locale} />
      <EnrichedCode id="demo-openai-python" locale={locale} />
      <p style={{ color: "var(--muted)" }}>
        Base:{" "}
        <a href={modelsData.huggingface} rel="noopener noreferrer">
          {modelsData.baseModel}
        </a>
      </p>
      <table className="table" style={{ marginTop: "1.5rem" }}>
        <thead>
          <tr>
            <th>Variant</th>
            <th>{t("ram")}</th>
            <th>{t("vram")}</th>
            <th>{t("size")}</th>
            <th>RTX 5070 tok/s</th>
            <th>{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {modelsData.variants.map((v) => (
            <tr key={v.id}>
              <td>
                <strong>{v.name}</strong>
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{v.description}</div>
              </td>
              <td>{v.ramGbMin} GB+</td>
              <td>{v.vramGbMin} GB+</td>
              <td>~{v.downloadGb} GB</td>
              <td>{v.outputTps5070}</td>
              <td>
                <ModelActions
                  modelId={v.id}
                  modelName={v.name}
                  hfUrl={modelsData.huggingface}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "1.5rem", color: "var(--muted)" }}>
        Full matrix:{" "}
        <a href="https://github.com/Niko1221/Strata/blob/main/docs/MODELS.md">docs/MODELS.md</a>
      </p>
    </div>
  );
}
