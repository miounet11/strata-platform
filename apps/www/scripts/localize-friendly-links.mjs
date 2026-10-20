import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/data/friendly-links.json", import.meta.url);
const data = JSON.parse(readFileSync(path, "utf8"));

const extra = {
  "strata-upstream": {
    de: "Offizieller Open-Source-Engine und Installer",
    fr: "Moteur open source et installateur officiels",
    es: "Motor de código abierto e instalador oficial",
    pt: "Motor open source oficial e instalador",
  },
  "coldniko-x": {
    de: "Updates des Autors, Benchmarks und Release-News",
    fr: "Actualités de l'auteur, benchmarks et annonces de version",
    es: "Actualizaciones del autor, benchmarks y novedades de versión",
    pt: "Atualizações do autor, benchmarks e novidades de versão",
  },
  "project-maya": {
    de: "GLM-5.3-Flash (321B MoE) auf eigenen NVIDIA-GPUs — Engine, Server und Dashboard auf Basis von Strata",
    fr: "GLM-5.3-Flash (321B MoE) sur vos GPU NVIDIA — moteur, serveur et tableau de bord basés sur Strata",
    es: "GLM-5.3-Flash (321B MoE) en tus GPU NVIDIA: motor, servidor y panel basados en Strata",
    pt: "GLM-5.3-Flash (321B MoE) nas suas GPUs NVIDIA — motor, servidor e painel baseados no Strata",
  },
  JevCode: {
    de: "Typisierte KI-Bewertungen und Jev-Dokumentation",
    fr: "Évaluations IA typées et documentation Jev",
    es: "Evaluaciones de IA tipadas y documentación de Jev",
    pt: "Avaliações de IA tipadas e documentação do Jev",
  },
  Clavue: {
    de: "Agent-Werkzeuge für lokale LLM-Workflows",
    fr: "Outils d'agents alignés sur les workflows LLM locaux",
    es: "Herramientas de agentes para flujos de trabajo con LLM local",
    pt: "Ferramentas de agentes para fluxos de trabalho com LLM local",
  },
  "Qwen3.8-Flash-Next": {
    de: "Basismodell, das Strata lokal ausführt",
    fr: "Modèle de base exécuté localement par Strata",
    es: "Modelo base que Strata ejecuta en local",
    pt: "Modelo base que o Strata executa localmente",
  },
};

for (const item of [...data.reciprocal, ...data.friends]) {
  const add = extra[item.id] ?? extra[item.name];
  if (add) Object.assign(item.description, add);
}

data.linkToUs = {
  html: data.linkToUs.html,
  markdown: {
    en: data.linkToUs.markdown,
    zh: data.linkToUs.markdownZh,
    ja: data.linkToUs.markdownJa,
    de: "[Strata Plattform](https://stratat.com/de) — Qwen3.8-Flash-Next lokal auf deinem PC.",
    fr: "[Plateforme Strata](https://stratat.com/fr) — Qwen3.8-Flash-Next en local sur votre PC.",
    es: "[Plataforma Strata](https://stratat.com/es) — Qwen3.8-Flash-Next en local en tu PC.",
    pt: "[Plataforma Strata](https://stratat.com/pt) — Qwen3.8-Flash-Next local no seu PC.",
  },
};

writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log("friendly-links.json updated");
