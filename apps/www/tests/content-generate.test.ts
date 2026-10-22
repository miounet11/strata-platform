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

const EN_BODY = `## A\n\n${"x".repeat(950)}\n\n## B\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n`;
const ZH_BODY = `## 标题\n\n${"中文内容测试".repeat(120)}\n\n## 第二节\n\n| 项目 | 数值 |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n`;

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
