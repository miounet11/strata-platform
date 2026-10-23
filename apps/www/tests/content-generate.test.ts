import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error — plain ESM script outside the app's TS project
import { parseArticle, repairControlChars } from "../../../scripts/content/generate.mjs";

/**
 * The validators in `scripts/content/generate.mjs` decide whether a generated article ships.
 * Both rules here were wrong in the same way: they were written against English prose and
 * hardware slugs, then applied to every locale, so whole runs failed while the model was
 * behaving exactly as instructed. Each case below is one of those failures.
 */

// Three data rows: `parseArticle` requires a delimiter row plus at least three rows, so a
// two-row fixture is rejected for the table shape rather than for whatever the case is about.
const EN_BODY = `## A\n\n${"x".repeat(950)}\n\n## B\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
const ZH_BODY = `## 标题\n\n${"中文内容测试".repeat(120)}\n\n## 第二节\n\n| 项目 | 数值 |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;

function article(title: string, body = EN_BODY) {
  return {
    title,
    description: "d".repeat(130),
    body,
    faq: [
      { q: "a", a: "b" },
      { q: "c", a: "d" },
      { q: "e", a: "f" },
    ],
    imagePrompt: "p",
  };
}

function accepts(raw: string, slug: string) {
  try {
    parseArticle(raw, slug);
    return true;
  } catch {
    return false;
  }
}

test("the prompt asks for the subject in the title, so a multi-word slug is allowed", () => {
  // This is the first failure: every one of the ~900 multi-word slugs was ungeneratable.
  assert.ok(
    accepts(
      JSON.stringify(article("How to Set Up a Local Coding Assistant With Stratat")),
      "local-coding-assistant",
    ),
  );
});

test("an over-long title or description is rejected", () => {
  // Observed on 2026-10-23: a radar article came back with a 73-character title and a
  // 176-character description while the prompt asked for 50-62 and 120-155. Only the *lower*
  // bound was enforced, so the tail — the part a search result truncates away — shipped unseen.
  assert.equal(accepts(JSON.stringify(article("T".repeat(140))), "some-slug"), false);
  const longDesc = { ...article("A perfectly ordinary title for a local model guide"), description: "d".repeat(260) };
  assert.equal(accepts(JSON.stringify(longDesc), "some-slug"), false);
  // The ceiling is generous on purpose: a title written for a market with longer unit names
  // must not be rejected for being 80 characters.
  assert.ok(accepts(JSON.stringify(article("Running a Local Model on a Mid-Range Laptop GPU")), "some-slug"));
});

test("a hardware model designation mid-sentence is not a filename", () => {
  assert.ok(
    accepts(JSON.stringify(article("RTX 5090 运行 rtx5090-iq2-xs 的性能与功耗实测分析", ZH_BODY)), "rtx5090-iq2-xs"),
  );
});

test("a title labelled with the slug is rejected in both colon widths", () => {
  assert.equal(accepts(JSON.stringify(article("rtx5090-iq2-xs: RTX 5090 test", ZH_BODY)), "rtx5090-iq2-xs"), false);
  assert.equal(accepts(JSON.stringify(article("rtx5090-iq2-xs：RTX 5090 实测", ZH_BODY)), "rtx5090-iq2-xs"), false);
  assert.equal(accepts(JSON.stringify(article("local coding assistant: A Review")), "local-coding-assistant"), false);
});

test("a title that is only the slug is rejected", () => {
  assert.equal(accepts(JSON.stringify(article("rtx5090-iq2-xs", ZH_BODY)), "rtx5090-iq2-xs"), false);
});

test("811 Han characters carries more content than 900 Latin ones", () => {
  // 900 characters is a Latin length floor; measured the same way, a zh article that says as
  // much was rejected for being too short.
  const body = ZH_BODY.slice(0, 820);
  assert.ok(body.length < 900);
  assert.ok(accepts(JSON.stringify(article("RTX 4090 量化模型部署实测与对比", body)), "rtx4090-iq3-s"));
});

test("short bodies are still rejected", () => {
  assert.equal(accepts(JSON.stringify(article("RTX 5090 量化模型部署实测", "## A\n\n短\n")), "rtx5090-iq2-xs"), false);
});

test("table rows without a delimiter row do not count as a fact table", () => {
  // Counting every line that starts with `|` accepted bodies that never render as a table:
  // five articles shipped rows with no `|---|` separator and the gate rejected them later.
  const head = `## A\n\n${"x".repeat(950)}\n\n## B\n\n`;
  const noDelimiter = `${head}| a | b |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  const withDelimiter = `${head}| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  const title = "RTX 5090 量化模型本地部署实测：性能、功耗与成本完整分析报告";

  assert.equal(accepts(JSON.stringify(article(title, noDelimiter)), "rtx5090-iq2-xs"), false);
  assert.ok(accepts(JSON.stringify(article(title, withDelimiter)), "rtx5090-iq2-xs"));
});

test("a delimiter row with fewer than three data rows is not enough", () => {
  const head = `## A\n\n${"x".repeat(950)}\n\n## B\n\n`;
  const twoRows = `${head}| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n`;
  assert.equal(
    accepts(
      JSON.stringify(article("RTX 5090 量化模型本地部署实测：性能、功耗与成本完整分析报告", twoRows)),
      "rtx5090-iq2-xs",
    ),
    false,
  );
});

test("a raw newline inside a JSON string is repaired, not fatal", () => {
  // The model sometimes presses enter inside the markdown body; one occurrence in three
  // attempts is enough to fail a 900-item queue.
  const broken = JSON.stringify(article("How to Set Up a Local Coding Assistant With Stratat")).replace(
    "## A\\n\\n",
    "## A\n\n",
  );
  assert.ok(accepts(broken, "local-coding-assistant"));
});

test("repairControlChars leaves whitespace between tokens alone", () => {
  assert.equal(repairControlChars('{\n  "a": 1\n}'), '{\n  "a": 1\n}');
  assert.equal(repairControlChars('{"a": "x\ny"}'), '{"a": "x\\ny"}');
  assert.equal(repairControlChars('{"a": "x\\ny"}'), '{"a": "x\\ny"}');
});
