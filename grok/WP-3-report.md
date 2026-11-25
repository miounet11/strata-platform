# WP-3 · Clavue Image v3.1 硬件视觉与多语言装机指南

## 交付

- `scripts/media/generate-hardware-visuals.mjs`：可导入的 WebP 校验、四段英文摄影提示词、7 语言 alt、视觉目标收集；直接执行时才跑 CLI。
- `scripts/content/generate-build-guides.mjs`：16 个装机/显卡选题，`buildGuidePrompt` 与 `validateGeneratedGuide`。事实只读 `benchmarks.json` 与 `gpus.json`。
- `scripts/content/images.mjs`：在 `CLAVUE_API_BASE` 或 `--clavue` 时走 Image v3.1。未设置时，`CLUSTER_HOST`、`CONTENT_LLM_API_KEY`、`--fallback-svg`、`--upgrade-svg`、`--svg-only`、`--dry-run`、`--locale`、`--limit` 保持原路径。
- `scripts/content/hardware-visuals.test.mjs`：18 条离线测试。
- `package.json` 只新增 `media:hardware` 与 `content:build-guides`。

## 验收

- `npm test`：174 通过，0 失败。
- `node scripts/media/generate-hardware-visuals.mjs --target hubs --dry-run`：退出码 0。列出 `builds-hero`（`/media/builds-hero.webp`，页 `/builds`）和 `gpus-hero`（`/media/gpus-hero.webp`，页 `/gpus`）。
- `node scripts/content/generate-build-guides.mjs --locales en,ja --limit 2 --dry-run`：退出码 0。4 篇：`en`/`ja` 的 `best-2000-local-llm-pc-build` 与 `rtx-4090-pc-build-parts-list`。

## 选择与回退

- 当前仓库没有 `pc-builds.json`。`target=builds` 得到空列表，不抛错。
- GPU 目标 17 张，上限 24：9 张 `evidence=measured` 的独立卡，加上 RTX 5070 Ti、RTX 5060 Ti 16GB、RTX 4080 SUPER、RTX 4070 Ti SUPER、RTX A6000、RTX 6000 Ada、RX 7900 XT（不含 XTX 重复）、Intel Arc B580。同名 CSV 长 slug 不重复入选。未实测的 Mac Studio 不入选。
- `--best-of` 大于 1 才请求 `/taste/image`。非 200 或超时时保留第一张合法 WebP。
- `--dry-run` 不联网、不写图片、不改 `media-manifest.json`。
- 真正写盘时，图片与 manifest 都用临时文件加 `renameSync`。manifest 的 `source` 为 `clavue-img-webp`。
- `--clavue` 且未设置 `CLAVUE_API_BASE` 时，默认 `http://192.168.2.100:11401/v1`。这是任务合同里的局域网网关，不带 Key。设置了 `CLAVUE_API_KEY` 才加 `Authorization: Bearer`。只要环境里有 `CLAVUE_API_BASE`，`images.mjs` 改走 Clavue；没有该变量、也没有 `--clavue` 时，cluster / gateway / SVG 路径不变。

## 范围

没有修改 `apps/www/`。没有生成实拍 WebP，也没有调用聊天接口。没有 push。
