# 1000 篇内容计划：多语言独立撰写 + SEO/GEO

## 一、核心原则

**不做翻译。** 每个语言的内容由 LLM 用该语言原生撰写，选题、角度、案例按该市场重写。
理由：机器翻译页面在 Google 属于低质重复内容，且各市场用户搜的词根本不同。

| 市场 | 真实搜索意图差异 |
|---|---|
| en | "run llm locally"、"vram for 70b"、"cursor local model" |
| zh | "本地部署大模型"、"显存 计算"、"离线 AI 部署" |
| ja | "ローカル LLM 構築"、"VRAM 必要量"、"日本語モデル" |
| de | "LLM lokal betreiben"、"Stromkosten KI"、"DSGVO lokale KI" |
| fr | "LLM local"、"coût électricité IA"、"souveraineté données" |
| es | "IA local"、"precio luz GPU"、"modelo IA sin internet" |
| pt | "IA local"、"custo energia"、"IA sem nuvem Brasil" |

## 二、约 1000 篇的构成（每语言 147 篇 × 7 = 1029）

每语言独立选题，数据驱动，每篇都有真实数字（来自 `benchmarks.json` / `models.json`），
因此内容天然唯一，不是模板套壳。

| 类型 | 每语言 | 合计 | 数据来源 | 示例（en） |
|---|---|---|---|---|
| A 硬件×量化组合页 | 72 | 504 | 12 显卡 × 6 量化 | `rtx-4090-q4-k-m` — 这张卡跑 Q4_K_M 多少 tok/s |
| B 任务指南 | 20 | 140 | 精选意图 | `local-coding-assistant` |
| C 显卡对比 | 15 | 105 | rigs 两两配对 | `rtx-4090-vs-rtx-5090` |
| D 故障排查 | 15 | 105 | 真实 issue 聚类 | `cuda-out-of-memory` |
| E 市场本地化 | 15 | 105 | 该市场电价/渠道/法规 | `stromkosten` |
| F 概念解释 | 10 | 70 | 品类知识 | `what-is-quantization` |
| **合计** | **147** | **1029** | | |

`scripts/content/plan.mjs` 是数量的唯一来源；上表必须与 `node scripts/content/plan.mjs --stats` 一致。

A 类占一半，因为「某张卡 + 某个量化」是最精准的长尾，且我们有实测数据，别人抄不了。
E 类是本地化的关键：德国写电价、日本写日语模型、巴西写美元汇率下的成本。

## 三、GEO（生成式引擎优化）

ChatGPT/Perplexity 抓取靠的是**可提取的事实块**，不是流量文。每篇必须包含：

1. **开篇 40 字结论**（先给答案，AI 会直接引用）
2. **事实表**：显存需求 / tok-s / 功耗 / 每小时电费，Markdown 表格
3. **FAQ 3-5 条**，用 `FAQPage` JSON-LD，问题措辞对齐真实提问
4. **`Article` JSON-LD**：author、datePublished、dateModified、inLanguage
5. **数据来源署名**：标注 benchmark 出处，提升可信度
6. **一段可独立引用的定义句**（"X 是指 …。"）

同时 `llms.txt` 列出全站核心页面与摘要，供 AI 爬虫直接读取。

## 四、图文

每篇 1 张 hero 图，1024×576，由集群 `z-image-turbo` 生成，风格统一
（靛蓝底 + 青色强调 + 无文字，避免 AI 生成的乱码文字）。

图片按 `articles/<locale>/<slug>.webp` 存放，走现有 `EnrichedImage` 组件，
带 `width/height`、`loading=lazy`、失败占位。

## 五、一周发布节奏（防被判定为垃圾站）

**不要一次上线 1000 页。** 分 7 天，每天约 143 篇，按类型分批：

每天每语言 21 篇，七天合计 147 × 7 = 1029。

| 天 | 类型 | 每语言 | 全站 | 理由 |
|---|---|---|---|---|
| D1 | A 硬件×量化（前 21 组） | 21 | 147 | 先建数据骨架 |
| D2 | A 硬件×量化（第 22-42 组） | 21 | 147 | |
| D3 | A 剩余 30 组中的前 21 组 | 21 | 147 | |
| D4 | A 收尾 9 组 + B 任务前 12 | 21 | 147 | A 类完成 |
| D5 | B 任务后 8 + C 对比 13 | 21 | 147 | |
| D6 | C 对比剩 2 + D 故障 15 + F 概念 4 | 21 | 147 | |
| D7 | F 概念剩 6 + E 市场本地化 15 | 21 | 147 | 全量提交 sitemap |

实现方式：`articles.json` 每条带 `publishAt`，页面 `status: live` 才渲染。
`scripts/content/release.mjs` 每天把到期的 `scheduled` 批量转 `live`，并触发重建。

## 六、技术实现

```
scripts/content/
  plan.mjs       生成 1001 条计划（确定性，可复算）
  generate.mjs   逐条调用 qwen3.6:35b-a3b 写作，断点续跑
  images.mjs     逐条调用 z-image-turbo 出图
  release.mjs    按 publishAt 把 scheduled → live
  verify.mjs     校验：字数、FAQ、JSON-LD、图片、内链、重复度

apps/www/src/
  app/[locale]/guides/[slug]/page.tsx   新路由
  lib/articles.ts                        数据加载
  data/articles.json                     内容（按 locale 分文件，避免单文件过大）
```

数据按语言分文件：`data/articles/en.json` … `pt.json`，每个约 143 条，
避免单 JSON 过大导致构建变慢。

## 七、质量门槛（verify.mjs 强制）

- 正文 ≥ 900 字符（该语言），去重后 ≥ 700
- 必须含 ≥ 3 条 FAQ 且与正文不重复
- 必须含事实表（≥ 3 行）
- 必须含 2-4 条内链，指向真实存在的页面
- 图片存在且非空、格式正确
- **跨语言重复度检查**：同一 slug 的不同语言版本，正文相似度 < 40%
- 全文重复度：任意两篇之间 < 30%（SimHash）

不合格的条目回炉重写，最多 3 次，仍不合格则丢弃并记录。

## 八、验收

```bash
node scripts/content/plan.mjs      # 输出 1001 条，7 语言各 143
node scripts/content/generate.mjs --limit 5   # 小批试产
node scripts/content/verify.mjs    # 全部通过才允许 release
```

线上验收：任取 3 个语言的同一类型页面，确认标题、正文、事实表数字各不相同。
