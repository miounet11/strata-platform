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
    <div className="container page">
      <h1>{t("title")}</h1>
      <p className="page-intro">
        <a href={modelsData.huggingface} rel="noopener noreferrer">
          {modelsData.baseModel}
        </a>
      </p>
      <div className="table-scroll" style={{ marginTop: "1.5rem" }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t("title")}</th>
              <th>{t("ram")}</th>
              <th>{t("vram")}</th>
              <th>{t("size")}</th>
              <th className="num">RTX 5070 tok/s</th>
              <th>{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {modelsData.variants.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{v.name}</strong>
                  <div className="meta">{v.description}</div>
                </td>
                <td>{v.ramGbMin} GB+</td>
                <td>{v.vramGbMin} GB+</td>
                <td>~{v.downloadGb} GB</td>
                <td className="num">{v.outputTps5070}</td>
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
      </div>
      <p className="meta" style={{ marginTop: "1.5rem" }}>
        <a href="https://github.com/Niko1221/Strata/blob/main/docs/MODELS.md">docs/MODELS.md</a>
      </p>
      <EnrichedImage id="models-vram" locale={locale} />
      <EnrichedCode id="demo-openai-python" locale={locale} />
    </div>
  );
}
