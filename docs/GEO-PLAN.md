# GEO 方案：对标 agentskillshub.top

参考站 https://agentskillshub.top/ 在 AI 搜索里获得大量曝光，靠的不是文章数量，而是**可被机器直接引用的站点结构**。本文记录它的真实机制（抓取原始 HTML 与 robots/llms.txt 得到，非推测）、Strata 当前的差距，以及本轮已落地的改动与后续待办。

## 一、参考站的实际机制

| 机制 | 参考站做法 | 作用 |
| --- | --- | --- |
| 实体图谱 | 首页 5 个独立 JSON-LD 块：`WebApplication`、带 `SearchAction` 的 `WebSite`、`Organization`、`Dataset`、`Person` | 让"这个站是什么、谁做的、数据从哪来"成为可解析的实体，而不是散落的字符串 |
| 实体别名 | `alternateName` + Wikidata/可信外链 `sameAs` | 把"叫法不同但同一实体"的查询合并到一条答案上 |
| 数据可引用 | `Dataset` 带 DOI、`CC BY 4.0`、HuggingFace 镜像、"cite freely" | 让模型敢于引用数字并给出出处 |
| 方法论页 | `/how-we-grade/` 写明 42 条规则、五级来源分层、质量分与**已知局限** | 可信度信号；AI 更愿意引用声明了局限的来源 |
| 场景长尾页 | `/best/` 按用例组织的 "best X for Y" 列表 | 命中"帮我选一个"这类高意图查询 |
| 每日更新 | 数据每 8 小时刷新，页面显示新鲜度 | 时效性信号 |
| 面向 agent 的入口 | `skill.md`、MCP server、CLI、`llms.txt` | 让 AI 不只是"读到"，还能"直接调用" |
| 答案前置 | 长 H1（品牌+品类+数量+差异点），开头段直接给结论 | 抽取式引用优先抓第一段 |
| robots | 只禁 `?search= ?tab= ?page= ?sort=` 这类状态参数 | 避免状态 URL 稀释索引，但不封 AI 爬虫 |

关键判断：它的流量来自**"可被引用"**，不是"可被点击"。所以重点不是堆文章，而是让每个数字都有出处、日期、许可。

## 二、Strata 原有差距

| 项 | 改前状态 |
| --- | --- |
| 站点实体 | 无 `Organization`/`WebSite`/`Person` 节点；首页 `SoftwareApplication` 与其他页无共享 `@id` |
| 作者署名 | 指南页作者写成 `"Stratat"`（拼写错误），且是匿名内联对象 |
| Dataset | 只有 name/description/url，缺 `license`、`dateModified`、`variableMeasured` |
| robots | 只有 `User-agent: *`，未指名任何 AI 爬虫 |
| llms.txt | 只有导航链接，没有"先回答这些高频问题"、没有数据来源与局限声明 |
| 内容生成 | 提示词要求"答案前置"，但没有校验；模型仍常以 `##` 标题开头 |
| 内链锚文本 | 有卡片名自动链接，但 `mentions` 未进结构化数据 |

## 三、本轮已落地（第二批：方法论页 + 场景页）

1. **`apps/www/src/lib/site-entities.ts`（新增）** — 一个来源定义 `Organization`/`Person`/`WebSite`/`SoftwareApplication` 四个节点及稳定 `@id`。含 `alternateName`（"Strata local LLM" 等真实检索写法）与 `sameAs`（GitHub / X）。
2. **首页、指南页、benchmarks 页统一引用站点实体** — 从"每页自己拼一个匿名对象"改为"命名一次，按 `@id` 引用"。修掉 `"Stratat"` 拼写错误。
3. **指南页新增 `mentions`** — 正文点名过的显卡进入结构化数据（最多 8 个），而正文链接仍只保留 3 个，避免读起来像链接农场。
4. **Dataset 补可引用字段** — `license`、`dateModified`、`variableMeasured`、`creator`/`publisher` 指向组织实体。
5. **robots 显式命名 14 个 AI 爬虫** — 分检索型（OAI-SearchBot、PerplexityBot、Claude-SearchBot、Claude-User）与训练型（GPTBot、ClaudeBot、Google-Extended、CCBot）两组，私有路径 `/b/`、`/api/` 对每组重复声明。
6. **llms.txt 升级** — 摘要改为可整段引用的事实句（含显卡数、机器数、语言数，全部从数据读取防漂移）；新增"先回答这些问题"、数据来源/方法/新鲜度/局限章节。
7. **生成器加"答案前置"硬校验** — 正文以标题开头直接拒绝；首段加权长度 < 120 拒绝；提示词同步要求每节首句加粗给结论。

验证：`npm test` 84 项全通过（含新增 3 项 GEO 相关用例）；`tsc --noEmit` 通过。

### 第二批：方法论页与场景页

8. **`/method` 方法论页（新增）** — 对齐参考站 `/how-we-grade/`。独立可引用 URL，含数据来源与许可、4 条计算规则、从 `benchmarks.json` 读取的假设参数表、4 条已知局限、真实同步日期与引用说明。`TechArticle` 的 `about` 指向 benchmarks 的 `Dataset` 节点。
9. **`/best` 场景页（新增，4 个场景 × 7 语种）** — 对齐参考站 `/best/`。列表由 `src/lib/scenarios.ts` 从 29 台真机数据纯函数推导，无人为挑选：按每百万 token 成本、整机价 ≤ $2000、功耗最低、Apple 统一内存四个维度。每页输出 `ItemList` 结构化数据，排名规则与实测日期显式渲染。
10. **显卡页接入站点实体图谱** — `Product` 节点加入 `@graph`，用 `isRelatedTo` 指向 benchmark `Dataset`。
11. **sitemap 收录场景页** — 由 `SCENARIOS` 驱动，7 语种共 35 条 URL。
12. **llms.txt 复用 `lib/locale.ts` 的 `localeNames`** — 去掉重复定义。

验证：`tsc --noEmit` 退出 0；`next build` 退出 0；`npm test` 84/84；构建产物实读 `en/zh/ja` 的 `/best/apple-silicon-local-llm` 各 7 节点图谱，含 `ItemList` 9 项与 `BreadcrumbList` 3 级。

### 第三批：自动内容生产的可引用性门槛

13. **FAQ 首句必须是答案** — `scripts/content/generate.mjs` 新增校验：`acceptedAnswer` 首句加权长度 < 20 拒绝；以 `It depends` / `视情况而定` / `一概には言えません` 等对冲词开头拒绝。FAQ 是 `FAQPage` 里被整段摘走的部分，对冲式开头等于把非答案交给引用方。
14. **全角句读切句** — `firstSentence()` 按 `。！？` 切分。只按 `.` 切时，中文答案整段会被当成"第一句"，长度门槛恒过、对冲门槛恒不触发，zh/ja 的规则等于没生效。

验证：`npm test` 87/87（新增 4 项：对冲开头、首句过短、zh 全角切句、zh 对冲）。

### 内容产量现状（2026-10-27 核对）

`plan.json` 共 1029 条，7 语种各 147 条，全部 `scheduled`。已产出：`en` 124（13 live / 111 scheduled）、`zh`/`ja`/`de` 各 2、`fr`/`es`/`pt` 目录不存在。按 `publishAt <= 2026-10-27` 计，到期 882 条、实产 130 条。

生产入口是 `scripts/content/daily-guides.sh`（生产机 cron 06:45），需要 `CONTENT_LLM_API_KEY`；本机无 `.env`，无法直接跑生成。补齐产量前需要先解决凭据与并发配置。

## 四、第四批：架构升级、零重建更新与高意图工具（2026-11-21）

15. **消除全站 RSC 负载膨胀** — `LocaleLayout` 不再向所有 5 万页广播整份 30 KB `messages/*.json` 与 590+ 篇 `guideLocaleMap()`，改由 `LocaleAvailabilityProvider` 按页注册可用语种、`<ClientMessages>` 按需下发命名空间，`EnrichedImage` 改为服务端解析（不再向客户端打包 60 KB `media-manifest.json`）。单页 HTML/RSC 体积骤降，彻底修复 `performance-budget`（180 KB）门禁。
16. **零重建热更新与按需 ISR 失效** — `articles.ts`、`media.ts`、`topics.ts`、`columns.ts` 全部支持磁盘热读；新增鉴权端点 `POST /api/revalidate` + `scripts/revalidate.mjs`。`freshness-watch.mjs`、`content-grow.mjs`、`daily-guides.sh` 在数据或新文章变更时秒级触发 ISR 失效并推送 IndexNow，不再每次跑 13–40 分钟全量 `next build`。
17. **社区噪音去重与构建瘦身** — 原始英文 GitHub PR 镜像 `/pulls/[number]` 改为按需渲染 + `noindex`（保留 200 可达与 `/pulls` 列表索引，移出 sitemap），薄内容 issue 同理；消除 2.1 万静态 PR 镜像页与 1,200+ 近似重复对，让爬虫预算集中在高价值页。
18. **新增高意图交互工具 `/can-i-run`** — 显存/内存/上下文（8K–128K）量化适配、KV 缓存与回本周期计算器（纯函数引擎 `lib/can-i-run.ts`），配服务端直出的 8 GB–128 GB 速查表、`WebApplication` + `FAQPage` 结构化数据（7 语种）。
19. **新增站内搜索 `/search` + `/api/search` 并接入 `SearchAction`** — 在 `WebSite` JSON-LD 正式声明 `SearchAction`，可检索 3,200+ 显卡、29 实测基准、指南、专题与版本。
20. **`/best` 场景决策页从 4 扩至 9 类** — 新增最快生成速度、最快回本、双卡配置、AMD ROCm/HIP、48–512 GB 大显存五大纯数据榜单；每页补充数据驱动的首名问答 FAQ。`/benchmarks/[rig]` 补齐选购决策结论、`FAQPage` 与精准显卡关联指南。
21. **柱状主题集群 `/guides/category/[kind]`** — 解决 `/guides` 每类仅列 12 篇导致的深层指南缺乏导航入口问题。
22. **内容生产闭环与零断供封面** — 新增 `scripts/content/mine-topics.mjs`（自动从 `releases.json`、`community.json` 高频工单聚类、`traffic-board.json` 需求权重挖掘选题写入 `plan.json`）与 `scripts/content/cover-svg.mjs`（确定性 16:9 矢量封面兜底，解除 354 篇已写文章因缺图长期滞留）；`daily-guides.sh` 解耦本地前置检查与 LLM 检查，支持 `publishAt <= today` 补发欠账并分批上线。

## 五、后续待办（按收益排序）

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 | 服务器 `.env` 补齐 `CONTENT_LLM_*` 与 `FEISHU_WEBHOOK_URL` | 解锁每日增量 LLM 撰写与飞书日报投递（已写好的 354 篇存量文章无需等待即可上线） |
| P1 | `benchmarks.json` 新增 RTX 5060 Ti / RTX 5070 Ti / 实测刷新 | 数据源更新后 `/best`、`/can-i-run` 与 `/benchmarks/[rig]` 自动联动重算 |
| P2 | 英文/日/德/法/西/葡全站导航与描述文案精简 | 对齐 zh 范本风格（`docs/UPDATE-PLAN.md`） |
