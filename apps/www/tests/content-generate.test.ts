import assert from "node:assert/strict";
import { test } from "node:test";
// The validators live in a plain ESM script; `allowJs` in tsconfig lets this import typecheck,
// so the `@ts-expect-error` that used to sit here became an error itself (TS2578) once that
// option was added.
import { parseArticle, repairControlChars } from "../../../scripts/content/generate.mjs";

/**
 * The validators in `scripts/content/generate.mjs` decide whether a generated article ships.
 * Both rules here were wrong in the same way: they were written against English prose and
 * hardware slugs, then applied to every locale, so whole runs failed while the model was
 * behaving exactly as instructed. Each case below is one of those failures.
 */

// Three data rows: `parseArticle` requires a delimiter row plus at least three rows, so a
// two-row fixture is rejected for the table shape rather than for whatever the case is about.
//
// Every fixture now opens with an answer-first paragraph, because the validator rejects a body
// that starts on a heading. The fixture is what a good answer looks like; each test then breaks
// exactly one thing.
const ANSWER_EN = "A 24 GB card runs the 30B quant at about 40 tokens per second, so it is usable. ".repeat(2);
const ANSWER_ZH = "24GB 显卡跑 30B 量化模型大约每秒 40 个 token，日常使用完全够用。".repeat(5);
const EN_BODY = `${ANSWER_EN}\n\n## A\n\n${"x".repeat(950)}\n\n## B\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
const ZH_BODY = `${ANSWER_ZH}\n\n## 标题\n\n${"中文内容测试".repeat(120)}\n\n## 第二节\n\n| 项目 | 数值 |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;

// Answers open with a real answer and run past the 20-character opening gate; each test below
// breaks exactly one thing, so a fixture that fails the gate for an unrelated reason would make
// every case pass for the wrong reason.
const FAQ = [
  {
    q: "Will a 24 GB card run a 30B model?",
    a: "Yes, a 24 GB card runs the 30B quant at roughly 40 tokens per second. Keep other models off the card while it runs.",
  },
  {
    q: "How much VRAM does the 30B quant need?",
    a: "It needs about 18 GB at Q4, which leaves room for a long context on a 24 GB card. A 16 GB card falls back to CPU.",
  },
  {
    q: "Does the card matter more than the CPU?",
    a: "The card decides almost all of the speed, so spend the budget there first. The CPU only feeds tokens between layers.",
  },
];

function article(title: string, body = EN_BODY) {
  return {
    title,
    description: "d".repeat(130),
    body,
    faq: FAQ.map((entry) => ({ ...entry })),
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
      JSON.stringify(article("How to Set Up a Local Coding Assistant With Strata")),
      "local-coding-assistant",
    ),
  );
});

test("an over-long title is rejected, but a long description is trimmed and kept", () => {
  // Observed on 2026-10-23: a radar article came back at 73/176 characters while the prompt asked
  // for 50-62 and 120-155 — only the lower bound was enforced, so the tail a search result hides
  // shipped unseen. Rejecting was the obvious fix and the wrong one: every retry of that item
  // overshot further (279 → 314), so the article failed outright and its signal was lost for a
  // description that was merely verbose.
  assert.equal(accepts(JSON.stringify(article("T".repeat(140))), "some-slug"), false);

  const longDesc = {
    ...article("A perfectly ordinary title for a local model guide"),
    description: "A real summary sentence about local inference. " .repeat(6),
  };
  const parsed = parseArticle(JSON.stringify(longDesc), "some-slug");
  assert.ok(parsed.description.length <= 200, `expected <= 200, got ${parsed.description.length}`);
  assert.match(parsed.description, /[.…]$/, "the trim must end on a sentence or a word boundary");

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

test("a word-only slug mid-sentence is an identifier, not a subject", () => {
  // 17 of 130 shipped articles did this: "Understanding KV-Cache for Local LLMs", "Fixing
  // context-truncated error in Strata local AI". A person writes "KV cache"; the hyphenated
  // lowercase run is the planner's slug read back verbatim.
  assert.equal(
    accepts(JSON.stringify(article("Understanding KV-Cache for Local LLMs")), "kv-cache"),
    false,
  );
  assert.equal(
    accepts(JSON.stringify(article("Fixing context-truncated error in Strata local AI")), "context-truncated"),
    false,
  );
});

test("a hardware slug mid-sentence stays allowed", () => {
  // The counterpart to the rule above. A slug with digits is a model designation the writer may
  // legitimately put in the sentence; the existing test at the top of this file asserts it.
  assert.ok(
    accepts(JSON.stringify(article("RTX 5090 运行 rtx5090-iq2-xs 的性能与功耗实测分析", ZH_BODY)), "rtx5090-iq2-xs"),
  );
});

test("the brand may appear as a domain or as Stratat, but not as the product name", () => {
  // "stratat.com" is the real domain and must survive; the dot after "stratat" is a word
  // boundary, so a bare-word test alone rejected it.
  const withDomain = {
    ...article("How to Choose a Local Model Card for Desktop Inference"),
    description: "Best local LLM hardware for 2026. See stratat.com for the full measured table.",
  };
  assert.ok(accepts(JSON.stringify(withDomain), "local-model-card"));

  const misspelled = {
    ...article("How to Choose a Local Model Card for Desktop Inference"),
    description: "Best local LLM hardware for the Stratat desktop app in 2026.",
  };
  assert.equal(accepts(JSON.stringify(misspelled), "local-model-card"), false);

  const misspelledTitle = article("Choosing a Card for the Stratat Desktop App");
  assert.equal(accepts(JSON.stringify(misspelledTitle), "local-model-card"), false);
});

test("811 Han characters carries more content than 900 Latin ones", () => {
  // 900 characters is a Latin length floor; measured the same way, a zh article that says as
  // much was rejected for being too short.
  // Slicing ZH_BODY would cut the table in half and fail for the wrong reason, so the fixture is
  // built to length instead: under 900 characters, over 900 when Han counts double.
  const body = `${ANSWER_ZH}\n\n## 标题\n\n${"中文内容".repeat(100)}\n\n## 第二节\n\n| 项目 | 数值 |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  assert.ok(body.length < 900);
  assert.ok(accepts(JSON.stringify(article("RTX 4090 量化模型部署实测与对比", body)), "rtx4090-iq3-s"));
});

test("short bodies are still rejected", () => {
  assert.equal(accepts(JSON.stringify(article("RTX 5090 量化模型部署实测", "## A\n\n短\n")), "rtx5090-iq2-xs"), false);
});

test("table rows without a delimiter row do not count as a fact table", () => {
  // Counting every line that starts with `|` accepted bodies that never render as a table:
  // five articles shipped rows with no `|---|` separator and the gate rejected them later.
  const head = `${ANSWER_EN}\n\n## A\n\n${"x".repeat(950)}\n\n## B\n\n`;
  const noDelimiter = `${head}| a | b |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  const withDelimiter = `${head}| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  const title = "RTX 5090 量化模型本地部署实测：性能、功耗与成本完整分析报告";

  assert.equal(accepts(JSON.stringify(article(title, noDelimiter)), "rtx5090-iq2-xs"), false);
  assert.ok(accepts(JSON.stringify(article(title, withDelimiter)), "rtx5090-iq2-xs"));
});

test("a delimiter row with fewer than three data rows is not enough", () => {
  const head = `${ANSWER_EN}\n\n## A\n\n${"x".repeat(950)}\n\n## B\n\n`;
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
  const broken = JSON.stringify(article("How to Set Up a Local Coding Assistant With Strata")).replace(
    "## A\\n\\n",
    "## A\n\n",
  );
  assert.ok(broken.includes("## A\n\n"), "the fixture must actually contain a raw newline");
  assert.ok(accepts(broken, "local-coding-assistant"));
});

test("a body that opens on a heading is rejected", () => {
  // The prompt has asked for an answer-first opening since the start, and the writer still
  // opened on "## Why this matters" often enough to be worth a gate. A heading is the easiest
  // way to start, and an extractor takes it as the answer.
  const headingFirst = `## Why this matters\n\n${"x".repeat(950)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  assert.equal(
    accepts(JSON.stringify(article("How to Set Up a Local Coding Assistant With Strata", headingFirst)), "local-coding-assistant"),
    false,
  );
});

test("a short preamble is not an answer", () => {
  // "In recent years, local models have become popular." is a real opening the writer produced;
  // it is 60 characters and contains no claim, so it is quotable as nothing.
  const preamble = `In recent years, local models have become very popular with hobbyists.\n\n## A\n\n${"x".repeat(950)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  assert.equal(
    accepts(JSON.stringify(article("How to Set Up a Local Coding Assistant With Strata", preamble)), "local-coding-assistant"),
    false,
  );
});

test("a zh answer-first opening is measured the same way as an en one", () => {
  // 120 weighted characters: Han counts double because a zh sentence carries more meaning per
  // character. A zh guide that says as much as an en one must not fail the opening gate.
  const opening = "24GB 显卡跑 30B 量化模型大约每秒 40 个 token，日常使用完全够用，不必上 48GB。".repeat(3);
  const ok = `${opening}\n\n## 标题\n\n${"中文内容测试".repeat(120)}\n\n## 第二节\n\n| 项目 | 数值 |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n`;
  assert.ok(accepts(JSON.stringify(article("RTX 4090 量化模型部署实测与对比", ok)), "rtx4090-iq3-s"));
});

test("an FAQ answer that opens with a hedge is rejected", () => {
  // The FAQ is emitted as `FAQPage` and an answer engine lifts `acceptedAnswer` whole. "It
  // depends on your setup" is quotable as a non-answer, which is worse than no FAQ at all.
  const hedged = article("How to Set Up a Local Coding Assistant With Strata");
  hedged.faq[1] = {
    q: "Which card do I need?",
    a: "It depends on the model size you want to run. A 24 GB card covers most 30B quants.",
  };
  assert.equal(
    accepts(JSON.stringify(hedged), "local-coding-assistant"),
    false,
  );
});

test("an FAQ answer whose first sentence says nothing is rejected", () => {
  const tooShort = article("How to Set Up a Local Coding Assistant With Strata");
  tooShort.faq[0] = { q: "Which card?", a: "Yes. A 24 GB card runs the 30B quant at 40 tok/s." };
  assert.equal(
    accepts(JSON.stringify(tooShort), "local-coding-assistant"),
    false,
  );
});

test("a zh FAQ answer is split on the full-width period, not the whole answer", () => {
  // Without 。 in the splitter, the "first sentence" of a zh answer is the entire answer, so
  // the length gate always passes and the hedge gate never fires.
  const zhFaq = article("RTX 4090 量化模型部署实测与对比", ZH_BODY);
  zhFaq.faq = [
    {
      q: "24GB 显卡够用吗？",
      a: "够用，24GB 显存跑 30B 的 Q4 量化大约每秒 40 个 token。再长的上下文就要降量化。",
    },
    {
      q: "需要多大的电源？",
      a: "550W 起步，整机满载大约 450W。留出余量可以避免瞬时功耗触发保护。",
    },
    {
      q: "CPU 会影响速度吗？",
      a: "影响很小，速度几乎全由显卡决定。CPU 只负责层间的数据调度。",
    },
  ];
  assert.ok(accepts(JSON.stringify(zhFaq), "rtx4090-iq3-s"));

  const hedgedZh = article("RTX 4090 量化模型部署实测与对比", ZH_BODY);
  hedgedZh.faq = zhFaq.faq.map((entry) => ({ ...entry }));
  hedgedZh.faq[0] = {
    q: "24GB 显卡够用吗？",
    a: "视情况而定，要看你想跑的模型规模和量化等级。",
  };
  assert.equal(accepts(JSON.stringify(hedgedZh), "rtx4090-iq3-s"), false);
});

test("repairControlChars leaves whitespace between tokens alone", () => {
  assert.equal(repairControlChars('{\n  "a": 1\n}'), '{\n  "a": 1\n}');
  assert.equal(repairControlChars('{"a": "x\ny"}'), '{"a": "x\\ny"}');
  assert.equal(repairControlChars('{"a": "x\\ny"}'), '{"a": "x\\ny"}');
});
