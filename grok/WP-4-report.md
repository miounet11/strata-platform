# WP-4 报告

分支 `wp/4-sitewide-wiring-i18n`。把 24 套本地 AI 整机接到全站：`/builds` 列表与详情、GPU 配置面板、搜索、站点地图、`llms.txt`、按需再验证、IndexNow，以及 7 语键。

## 验收

- `npm test`：220 通过，0 失败。
- `cd apps/www && npx tsc --noEmit`：退出码 0。
- 七个 `apps/www/messages/{en,zh,ja,de,fr,es,pt}.json` 扁平键均为 746。相对英语：缺失 0，多余 0。`nav.builds`、`builds.*`、`gpus.config.*` 共 117 个叶子，全部非空。本包新增 127 个叶子键。

## 页面

- 新建 `apps/www/src/app/[locale]/builds/page.tsx` 与 `builds/[slug]/page.tsx`。`revalidate = 1800`，唯一 `h1`，`jsonLdGraph`，列表用 `seoMetadata`，详情用 `siteMetadata`。
- 列表把紧凑的 `BuildExplorerRow` 交给 `BuildExplorer`（首屏 SSR 出全部 24 条链接），并另有按档位分组的目录。
- 详情含指标、适合/取舍、BOM 合计、4 行负载、装机清单、3 条 FAQ、GPU/跑分/相关整机链接。
- GPU 详情在规格表后挂 `GpuConfigPanel`，有整机时列出 `buildsForGpu`，并链到 `/can-i-run` 与 `/builds`。
- GPU 索引增加 `gpus-hero` 与整机入口。首页 hero 与精选区加入 4 套指定整机。

## 接线

- `buildPath` 在 `internal-links.ts`，并由 `routes.ts` 再导出。`/builds` 进入主导航（紧跟 GPUs）、学习分组、`STATIC_PATHS` 与 `HUB_LABELS`。
- 站点地图收录全部 `buildPath`。`/builds` 作为 fresh hub，优先级 0.9；`/builds/` 详情优先级 0.8，每周更新。
- 搜索类型增加 `build`，命中加 11 分。筛选文案来自 `search.filterBuild`。
- `llms.txt` 增加 “Complete Local-AI PC Builds”，含 `/en/builds` 与 8 套代表机。
- `/api/revalidate` 的 `topics` 含 `/builds`，新 scope `builds` 为 `["", "/builds", "/gpus"]`，并刷新 `/[locale]/builds/[slug]` 与 `/[locale]/gpus/[slug]`。
- IndexNow 的 hub 列表含 `/builds`，并从 `pc-builds.json` 展开每条 `/builds/<slug>`。

## 未改

`apps/www/public/media/**`、`media-manifest.json`、`scripts/content/out/**`、`pc-builds.json`、`gpus.json`、`benchmarks.json`。未 push。

## 主要文件

新建：`builds/page.tsx`、`builds/[slug]/page.tsx`、`apps/www/tests/builds-wiring.test.ts`（15 项）。

修改：七个 `messages/*.json`、`gpus/[slug]/page.tsx`、`gpus/page.tsx`、首页、`search/page.tsx`、`api/search/route.ts`、`api/revalidate/route.ts`、`llms.txt/route.ts`、`globals.css`、`Breadcrumbs.tsx`、`BuildExplorer.tsx`、`SearchClient.tsx`、`internal-links.ts`、`routes.ts`、`sitemap.ts`、`scripts/indexnow-submit.mjs`。
