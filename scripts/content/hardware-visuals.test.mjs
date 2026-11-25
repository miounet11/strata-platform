import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROMPT_ENDING,
  assetNeedsRender,
  buildAltRecord,
  buildHardwarePrompt,
  collectVisualTargets,
  isAcceptableHardwarePrompt,
  isValidWebp,
  parseTasteJudgment,
  pickJudgedWebp,
  runHardwareCli,
  selectFlagshipGpus,
} from "../media/generate-hardware-visuals.mjs";
import {
  BUILD_GUIDE_TOPICS,
  buildGuidePrompt,
  runGuideCli,
  selectGuideJobs,
  validateGeneratedGuide,
} from "./generate-build-guides.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCALES = ["en", "zh", "ja", "de", "fr", "es", "pt"];
const BANNED = /\b(?:masterpiece|8k|ultra detailed)\b/i;

function webp(fill = 0) {
  const buf = Buffer.alloc(1024, fill);
  buf.write("RIFF", 0, "latin1");
  buf.write("WEBP", 8, "latin1");
  return buf;
}

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function cjkCount(text) {
  return (String(text).match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
}

function latinCount(text) {
  return (String(text).match(/[A-Za-z]/g) ?? []).length;
}

function fitDescription(seed, pad) {
  let text = seed.trim();
  while (text.length < 60) text += pad;
  if (text.length > 160) text = text.slice(0, 160).trimEnd();
  return text;
}

const LINKS =
  "See [the workstation](/builds/rtx-4090-workstation), [the RTX 4090](/gpus/rtx-4090), [the fit check](/can-i-run), and [the rig](/benchmarks/rtx4090).";
const TABLE = [
  "| Part | Measured value |",
  "| --- | --- |",
  "| Write speed | 109.3 tok/s |",
  "| Board power | 550 W |",
  "| Rig total | 4199 USD |",
].join("\n");
const FAQ = [
  {
    q: "Which card should this build buy first?",
    a: "Buy the measured 24 GB RTX 4090 first. The benchmark lists 109.3 write tokens per second at 550 watts.",
  },
  {
    q: "How many watts does that measured card draw?",
    a: "The benchmark rig lists 550 watts for the RTX 4090, so the power supply has to cover the board and the rest of the machine.",
  },
  {
    q: "Where do these token numbers come from?",
    a: "They come from the dated benchmark table for that rig. A vendor slogan is not a measurement.",
  },
];

function englishGuide() {
  let opening = "";
  const sentence = "A measured RTX card writes one hundred nine tokens each second and needs a real power supply. ";
  while (latinCount(opening) < 150) opening += sentence;
  let body = `${opening.trim()}\n\n${LINKS}\n\n## Parts that match the measurement\n\n**Buy the measured card first.** Cooling and power decide whether the desktop stays usable.\n\n## Power and airflow\n\n**Size the supply from the measured watts.** Leave headroom for the processor and the drives.\n\n${TABLE}\n`;
  while (body.length < 1300) body += "Add case airflow before raising the power limit. ";
  return {
    slug: "rtx-4090-pc-build-parts-list",
    title: "RTX 4090 parts list for a local LLM desktop",
    description: fitDescription(
      "Measured RTX 4090 parts, watts, and token rates for a local LLM desktop build.",
      " Use the benchmark table.",
    ),
    body,
    faq: FAQ.map((entry) => ({ ...entry })),
    imagePrompt: buildHardwarePrompt({ kind: "build", name: "RTX 4090 workstation", vendor: "nvidia" }),
  };
}

function cjkGuide(locale) {
  const unit =
    locale === "ja"
      ? "実測の書き込み速度と消費電力を先に確認してからカードを選びます。"
      : "先看实测写入速度和整机功耗，再决定显卡与电源。";
  let opening = "";
  while (cjkCount(opening) < 70) opening += unit;
  const headingA = locale === "ja" ? "## 部品" : "## 零件";
  const headingB = locale === "ja" ? "## 電源" : "## 电源";
  const lead = locale === "ja" ? "**二十四ギガバイトの実測カードを先に選びます。**" : "**先买实测过的二十四吉字节显卡。**";
  const next = locale === "ja" ? "**電源容量は実測ワットに余白を足します。**" : "**电源容量按实测瓦数留出余量。**";
  let body = `${opening}\n\n${LINKS}\n\n${headingA}\n\n${lead} ${unit.repeat(8)}\n\n${headingB}\n\n${next} ${unit.repeat(8)}\n\n${TABLE}\n`;
  while (cjkCount(body) < 780) body += unit;
  const title = locale === "ja" ? "二千ドル前後の自作パソコンでローカルモデルを動かす部品選び" : "两千美元档位本地大模型电脑的显卡与电源怎么选";
  const description = fitDescription(
    locale === "ja" ? "実測表の速度と消費電力だけを使って、自作パソコンのカードと電源の選び方を説明します。" : "本文只用实测表里的写入速度、功耗和整机价格，说明本地大模型电脑该如何选显卡和电源。",
    locale === "ja" ? "数値は実測表のままです。" : "数字只取实测表。",
  );
  return {
    slug: "rtx-4090-pc-build-parts-list",
    title,
    description,
    body,
    faq: FAQ.map((entry) => ({ ...entry })),
    imagePrompt: buildHardwarePrompt({ kind: "gpu", name: "RTX 4090", vendor: "nvidia" }),
  };
}

test("isValidWebp accepts a RIFF WEBP buffer of at least 1024 bytes", () => {
  const buf = webp(7);
  assert.equal(isValidWebp(buf), true);
  assert.equal(buf.length, 1024);
  assert.equal(buf.subarray(0, 4).toString("latin1"), "RIFF");
  assert.equal(buf.subarray(8, 12).toString("latin1"), "WEBP");
});

test("isValidWebp rejects PNG, empty, short, and non-WEBP buffers", () => {
  const png = Buffer.alloc(2048);
  png.write("\x89PNG", 0, "latin1");
  const short = Buffer.alloc(128);
  short.write("RIFF", 0, "latin1");
  short.write("WEBP", 8, "latin1");
  const wave = Buffer.alloc(1024);
  wave.write("RIFF", 0, "latin1");
  wave.write("WAVE", 8, "latin1");
  assert.equal(isValidWebp(png), false);
  assert.equal(isValidWebp(Buffer.alloc(0)), false);
  assert.equal(isValidWebp(short), false);
  assert.equal(isValidWebp(wave), false);
  assert.equal(isValidWebp(null), false);
  assert.equal(isValidWebp("RIFF"), false);
});

test("buildHardwarePrompt stays inside the Clavue Image v3.1 grammar", () => {
  const samples = [
    buildHardwarePrompt({ kind: "gpu", name: "RTX 4090", vendor: "nvidia", subtitle: "24 GB" }),
    buildHardwarePrompt({ kind: "build", name: "Dual 3090", gpuCount: 2, vendor: "nvidia" }),
    buildHardwarePrompt({ kind: "build", name: "Mac Studio M5 Ultra", formFactor: "Mac Studio", vendor: "apple" }),
    buildHardwarePrompt({ kind: "build", name: "Desk mini", formFactor: "mini" }),
    buildHardwarePrompt({}),
  ];
  assert.match(samples[1], /dual-GPU tower/);
  assert.match(samples[1], /open-frame matte-black PC workstation/);
  assert.match(samples[2], /compact Mac Studio/);
  assert.match(samples[3], /mini workstation/);
  assert.match(samples[0], /brushed aluminum graphics card/);
  for (const prompt of samples) {
    assert.ok(words(prompt).length >= 40, `expected >= 40 words, got ${words(prompt).length}`);
    assert.ok(prompt.endsWith(PROMPT_ENDING));
    assert.equal(BANNED.test(prompt), false);
    assert.match(prompt, /^Editorial hardware studio photograph/);
    assert.match(prompt, /controlled rim light/);
    assert.match(prompt, /50mm prime lens, shallow depth of field, 16:9 widescreen composition/);
    assert.equal(isAcceptableHardwarePrompt(prompt), true);
  }
});

test("buildAltRecord returns non-empty localized alt text for all 7 locales", () => {
  const alt = buildAltRecord("gpu", "RTX 4090");
  assert.deepEqual(Object.keys(alt).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.equal(typeof alt[locale], "string");
    assert.ok(alt[locale].includes("RTX 4090"));
    assert.ok(alt[locale].trim().length > 10);
  }
  assert.match(alt.zh, /显卡/);
  assert.match(alt.ja, /グラフィックカード/);
  assert.match(alt.de, /Grafikkarte/);
  assert.notEqual(alt.en, alt.fr);
  assert.notEqual(alt.es, alt.pt);
});

test("assetNeedsRender skips a valid WebP unless force is set", () => {
  const valid = webp(3);
  assert.equal(assetNeedsRender(valid, { force: false }), false);
  assert.equal(assetNeedsRender(valid, { force: true }), true);
  assert.equal(assetNeedsRender(null, {}), true);
  assert.equal(assetNeedsRender(Buffer.from("nope"), { force: false }), true);
});

test("pickJudgedWebp falls back to the first valid image when taste fails", () => {
  const first = webp(1);
  const second = webp(2);
  const junk = Buffer.from("not-an-image");
  assert.equal(pickJudgedWebp([first, second], { ok: false })[20], 1);
  assert.equal(pickJudgedWebp([junk, second], null)[20], 2);
  assert.equal(pickJudgedWebp([first, second], { ok: true, index: 1 })[20], 2);
  assert.equal(pickJudgedWebp([junk, junk], { ok: true, index: 0 }), null);
  assert.deepEqual(parseTasteJudgment(503, { best: 1 }), { ok: false });
  assert.deepEqual(parseTasteJudgment(200, { scores: [0.2, 0.9, 0.1] }), { ok: true, index: 1 });
});

test("selectFlagshipGpus dedupes catalog cards and caps the list at 24", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({
    slug: `measured-${index}`,
    name: `Measured ${index}`,
    vendor: "nvidia",
    evidence: "measured",
    vramGb: index,
    writingTps: index,
  }));
  assert.equal(selectFlagshipGpus(many).length, 24);

  const mixed = [
    { slug: "rtx-5070-ti", name: "RTX 5070 Ti", vendor: "nvidia", evidence: "measured", vramGb: 16, writingTps: 70 },
    { slug: "nvidia-geforce-rtx-5070-ti-16-gb-2025", name: "GeForce RTX 5070 Ti", vendor: "nvidia", evidence: "estimated", vramGb: 16 },
    { slug: "amd-radeon-rx-7900-xtx", name: "AMD Radeon RX 7900 XTX", vendor: "amd", evidence: "measured", vramGb: 24, writingTps: 75 },
    { slug: "amd-radeon-rx-7900-xt", name: "AMD Radeon RX 7900 XT", vendor: "amd", evidence: "estimated", vramGb: 20 },
    { slug: "amd-radeon-rx-7900-xt-20-gb-2022", name: "Radeon RX 7900 XT", vendor: "amd", evidence: "estimated", vramGb: 20 },
    { slug: "intel-uhd", name: "UHD Graphics", vendor: "intel", evidence: "measured", vramGb: 1, bus: "system-shared" },
    { slug: "mac-studio-m5-ultra-96-gb", name: "Mac Studio M5 Ultra 96 GB", vendor: "apple", evidence: "estimated", vramGb: 96 },
  ];
  const slugs = selectFlagshipGpus(mixed).map((gpu) => gpu.slug);
  assert.deepEqual(slugs.filter((slug) => slug === "rtx-5070-ti"), ["rtx-5070-ti"]);
  assert.ok(slugs.includes("amd-radeon-rx-7900-xtx"));
  assert.ok(slugs.includes("amd-radeon-rx-7900-xt"));
  assert.equal(slugs.includes("amd-radeon-rx-7900-xt-20-gb-2022"), false);
  assert.equal(slugs.includes("nvidia-geforce-rtx-5070-ti-16-gb-2025"), false);
  assert.equal(slugs.includes("intel-uhd"), false);
  assert.equal(slugs.includes("mac-studio-m5-ultra-96-gb"), false);
});

test("collectVisualTargets reads hubs and flagship GPUs when pc-builds.json is absent", () => {
  const emptyRoot = mkdtempSync(join(tmpdir(), "wp3-no-builds-"));
  try {
    mkdirSync(join(emptyRoot, "apps/www/src/data"), { recursive: true });
    writeFileSync(
      join(emptyRoot, "apps/www/src/data/gpus.json"),
      readFileSync(join(ROOT, "apps/www/src/data/gpus.json"), "utf8"),
    );
    assert.deepEqual(collectVisualTargets({ rootDir: emptyRoot, target: "builds" }), []);

    const targets = collectVisualTargets({ rootDir: emptyRoot, target: "all" });
    const ids = new Set(targets.map((target) => target.id));
    assert.ok(ids.has("builds-hero"));
    assert.ok(ids.has("gpus-hero"));
    for (const slug of [
      "rtx-5090",
      "rtx-5080",
      "rtx-5070",
      "rtx-4090",
      "rtx-4070-12-gb",
      "rtx-3090",
      "rtx-3090-ti",
      "rtx-pro-6000-blackwell",
      "amd-radeon-rx-7900-xtx",
      "rtx-5070-ti",
      "rtx-5060-ti-16gb",
      "rtx-4080-super",
      "rtx-4070-ti-super-16gb",
      "rtx-a6000",
      "rtx-6000-ada",
      "amd-radeon-rx-7900-xt",
      "intel-arc-b580",
    ]) {
      assert.ok(ids.has(`gpu-${slug}`), slug);
    }
    assert.equal(ids.has("gpu-nvidia-geforce-rtx-5070-ti-16-gb-2025"), false);
    assert.equal(ids.has("gpu-mac-studio-m5-ultra-96-gb"), false);
    const gpus = targets.filter((target) => target.kind === "gpu");
    assert.equal(gpus.length, 17);
    assert.ok(gpus.length <= 24);
    const hero = targets.find((target) => target.id === "builds-hero");
    assert.equal(hero.path, "/media/builds-hero.webp");
    assert.equal(hero.page, "/builds");
    assert.equal(hero.slot, "hero");
    const card = targets.find((target) => target.id === "gpu-rtx-4090");
    assert.equal(card.path, "/media/gpus/rtx-4090.webp");
    assert.equal(card.page, "/gpus/rtx-4090");
    assert.equal(card.file.endsWith("/apps/www/public/media/gpus/rtx-4090.webp"), true);
    for (const target of targets) {
      assert.equal(target.slot, "hero");
      assert.equal(isAcceptableHardwarePrompt(target.prompt), true);
      assert.deepEqual(Object.keys(target.alt).sort(), [...LOCALES].sort());
    }

    // Real repository root now ships pc-builds.json with all 24 builds.
    const realBuilds = collectVisualTargets({ rootDir: ROOT, target: "builds" });
    assert.equal(realBuilds.length, 24);
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test("collectVisualTargets keeps a valid build imagePrompt and replaces a short one", () => {
  const tmp = mkdtempSync(join(tmpdir(), "wp3-builds-"));
  try {
    const dataDir = join(tmp, "apps/www/src/data");
    mkdirSync(dataDir, { recursive: true });
    const custom = buildHardwarePrompt({ kind: "build", name: "Quiet studio", formFactor: "mini" });
    writeFileSync(
      join(dataDir, "pc-builds.json"),
      JSON.stringify({
        builds: [
          { slug: "dual-3090", name: "Dual 3090", gpuCount: 2, imagePrompt: "too short" },
          { slug: "quiet-studio", name: "Quiet studio", formFactor: "mini", imagePrompt: custom },
        ],
      }),
    );
    const targets = collectVisualTargets({ rootDir: tmp, target: "builds" });
    assert.equal(targets.length, 2);
    assert.equal(targets[0].id, "build-dual-3090");
    assert.equal(targets[0].path, "/media/builds/dual-3090.webp");
    assert.equal(targets[0].page, "/builds/dual-3090");
    assert.match(targets[0].prompt, /dual-GPU tower/);
    assert.equal(targets[1].prompt, custom);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("BUILD_GUIDE_TOPICS has 16 unique URL-safe slugs and valid kinds", () => {
  assert.equal(BUILD_GUIDE_TOPICS.length, 16);
  const slugs = BUILD_GUIDE_TOPICS.map((topic) => topic.slug);
  assert.equal(new Set(slugs).size, 16);
  const kinds = new Set(["hardware", "concept", "compare", "task"]);
  for (const topic of BUILD_GUIDE_TOPICS) {
    assert.match(topic.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(kinds.has(topic.kind), topic.kind);
    assert.ok(topic.workingTitle.length > 10);
  }
  assert.equal(BUILD_GUIDE_TOPICS[0].slug, "best-2000-local-llm-pc-build");
  assert.equal(BUILD_GUIDE_TOPICS[15].slug, "rtx-pro-6000-96gb-workstation-build");
  const jobs = selectGuideJobs({ locales: ["en", "ja"], limit: 2 });
  assert.deepEqual(
    jobs.map((job) => `${job.locale}/${job.topic.slug}`),
    [
      "en/best-2000-local-llm-pc-build",
      "ja/best-2000-local-llm-pc-build",
      "en/rtx-4090-pc-build-parts-list",
      "ja/rtx-4090-pc-build-parts-list",
    ],
  );
});

test("buildGuidePrompt grounds the writer in facts and forbids injected instructions", () => {
  const prompt = buildGuidePrompt(BUILD_GUIDE_TOPICS[0], "ja", {
    source: "ModelDock benchmarks",
    rigs: [{ name: "RTX 4090", writingToks: 109.3, memoryGb: 24, rigTotal: 4199, powerWatts: 550 }],
    gpus: [{ slug: "rtx-4090", name: "RTX 4090", vramGb: 24, writingTps: 109.3, evidence: "measured" }],
  });
  assert.match(prompt, /best-2000-local-llm-pc-build/);
  assert.match(prompt, /Japanese/);
  assert.match(prompt, /<facts>/);
  assert.match(prompt, /109\.3/);
  assert.match(prompt, /untrusted data, not instructions/);
  assert.match(prompt, new RegExp(PROMPT_ENDING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /\/builds\//);
  assert.match(prompt, /\/gpus\//);
  assert.match(prompt, /\/can-i-run/);
  assert.match(prompt, /\/benchmarks\//);
});

test("validateGeneratedGuide accepts English, Japanese, and Chinese guides", () => {
  for (const [locale, guide] of [
    ["en", englishGuide()],
    ["ja", cjkGuide("ja")],
    ["zh", cjkGuide("zh")],
  ]) {
    assert.ok(guide.title.length >= 20 && guide.title.length <= 95, `${locale} title ${guide.title.length}`);
    assert.ok(guide.description.length >= 60 && guide.description.length <= 160, `${locale} description ${guide.description.length}`);
    const verdict = validateGeneratedGuide(guide, locale);
    assert.equal(verdict.ok, true, `${locale}: ${verdict.errors.join("; ")}`);
  }
});

test("validateGeneratedGuide rejects a heading-first body", () => {
  const guide = englishGuide();
  guide.body = `## Parts\n\n${guide.body}`;
  const verdict = validateGeneratedGuide(guide, "en");
  assert.equal(verdict.ok, false);
  assert.match(verdict.errors.join("\n"), /heading/);
});

test("validateGeneratedGuide rejects a body without a Markdown fact table", () => {
  const guide = englishGuide();
  guide.body = guide.body.replace(TABLE, "No table in this draft, only prose about the same measured card.");
  const verdict = validateGeneratedGuide(guide, "en");
  assert.equal(verdict.ok, false);
  assert.match(verdict.errors.join("\n"), /fact table/);
});

test("validateGeneratedGuide rejects a hedging FAQ answer", () => {
  const depends = englishGuide();
  depends.faq[0] = { ...depends.faq[0], a: "It depends on the case, but a 24 GB card is the safer buy for this model." };
  const dependsVerdict = validateGeneratedGuide(depends, "en");
  assert.equal(dependsVerdict.ok, false);
  assert.match(dependsVerdict.errors.join("\n"), /hedges/);

  const well = englishGuide();
  well.faq[1] = { ...well.faq[1], a: "Well, the 24 GB card is the one that matches the measured table." };
  const wellVerdict = validateGeneratedGuide(well, "en");
  assert.equal(wellVerdict.ok, false);
  assert.match(wellVerdict.errors.join("\n"), /hedges/);
});

test("validateGeneratedGuide rejects a too-short body", () => {
  const guide = englishGuide();
  guide.body = `${"A measured card is enough for this desktop build. ".repeat(4)}\n\n${LINKS}\n\n## Parts\n\nShort.\n\n## Power\n\n${TABLE}\n`;
  const verdict = validateGeneratedGuide(guide, "en");
  assert.equal(verdict.ok, false);
  assert.match(verdict.errors.join("\n"), /body length|opening Latin/);
});

test("images.mjs keeps the Clavue gateway beside the existing cluster and SVG paths", () => {
  const source = readFileSync(join(ROOT, "scripts/content/images.mjs"), "utf8");
  assert.match(source, /--clavue/);
  assert.match(source, /CLAVUE_API_BASE/);
  assert.match(source, /CLAVUE_API_KEY/);
  assert.match(source, /http:\/\/192\.168\.2\.100:11401\/v1/);
  assert.match(source, /clavue-img-webp/);
  assert.match(source, /cluster-webp/);
  assert.match(source, /gateway-webp/);
  assert.match(source, /1344x768/);
  assert.match(source, /guidance_scale:\s*0(?:\.0)?/);
  assert.match(source, /output_format:\s*"webp"/);
  assert.match(source, /response_format:\s*"b64_json"/);
  assert.match(source, /if \(key\) headers\.Authorization = `Bearer \$\{key\}`/);
  assert.match(source, /--fallback-svg|--dry-run|CLUSTER_HOST|CONTENT_LLM_API_KEY/);
  assert.match(source, /zero text, no labels, no watermark/);
});

test("dry-run CLIs exit 0 and do not write media or guides", async () => {
  const manifest = join(ROOT, "apps/www/src/data/media-manifest.json");
  const before = statSync(manifest).mtimeMs;
  const tmp = mkdtempSync(join(tmpdir(), "wp3-dry-"));
  try {
    const hardwareCode = await runHardwareCli(
      ["node", "generate-hardware-visuals.mjs", "--target", "hubs", "--dry-run"],
      tmp,
    );
    const guideCode = await runGuideCli(
      ["node", "generate-build-guides.mjs", "--locales", "en,ja", "--limit", "2", "--dry-run"],
      tmp,
    );
    assert.equal(hardwareCode, 0);
    assert.equal(guideCode, 0);
    assert.equal(existsSync(join(tmp, "apps/www/public/media/builds-hero.webp")), false);
    assert.equal(existsSync(join(tmp, "scripts/content/out")), false);

    const hardware = spawnSync(
      process.execPath,
      ["scripts/media/generate-hardware-visuals.mjs", "--target", "hubs", "--dry-run"],
      { cwd: ROOT, encoding: "utf8" },
    );
    const guides = spawnSync(
      process.execPath,
      ["scripts/content/generate-build-guides.mjs", "--locales", "en,ja", "--limit", "2", "--dry-run"],
      { cwd: ROOT, encoding: "utf8" },
    );
    const images = spawnSync(process.execPath, ["scripts/content/images.mjs", "--dry-run", "--clavue"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, CLAVUE_API_BASE: "", CLAVUE_API_KEY: "" },
    });
    assert.equal(hardware.status, 0, hardware.stderr);
    assert.equal(guides.status, 0, guides.stderr);
    assert.equal(images.status, 0, images.stderr);
    assert.match(hardware.stdout, /builds-hero/);
    assert.match(hardware.stdout, /dry-run/);
    assert.match(guides.stdout, /en\/best-2000-local-llm-pc-build/);
    assert.match(guides.stdout, /ja\/rtx-4090-pc-build-parts-list/);
    assert.doesNotMatch(guides.stdout, /dual-rtx-3090/);
    assert.match(images.stdout, /mode=clavue/);
    assert.equal(statSync(manifest).mtimeMs, before);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
