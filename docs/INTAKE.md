# X / 情报循环 — 本地部署 · Strata · 显卡报价

目标：**持续**从 X.com 与公开镜像拉取与「本地模型部署、Strata、GPU 价格」相关的内容，写入静态 JSON，供 Next.js SSG 与 SEO 使用。

## 数据流

```text
sources.json (账号 + 搜索词)
    → sync-intelligence.mjs
        每个任务按序只取第一个有结果的来源：
        X gateway → cheap-x → RSSHub → 付费 X API
        budget 每轮：优先账号 + 一条轮换搜索
    → intelligence-pulse.json（最新 / 对比 / 升级 三条不重复）
    → /[locale]/pulse
```

操作说明见 [X-DYNAMICS.md](./X-DYNAMICS.md)。

## 一键命令

无 X Token 时仍可用 **GitHub 社区 Issue** 填充 `/pulse`（`INTAKE_SKIP_NETWORK=1` 跳过 RSS，仅社区 + 合并）：

```bash
INTAKE_SKIP_NETWORK=1 pnpm sync:intelligence
```

```bash
# 单次同步
pnpm sync:intelligence

# 全量（含 releases / community / creator / downloads）
pnpm sync:all

# 长期循环（本机或 VPS）
INTAKE_INTERVAL_MINUTES=30 INTAKE_RUN_CREATOR=1 node scripts/run-intake-loop.mjs
```

## 配置

编辑 `scripts/intake/sources.json`：

| 字段 | 含义 |
|------|------|
| `xUsers` | 要跟踪的 X 账号 |
| `xSearchQueries` | Strata / 本地 LLM 搜索词 |
| `gpuPriceQueries` | 显卡报价相关搜索 |
| `rsshubBaseUrls` | RSSHub 基址（建议**自建**） |
| `relevanceKeywords` | 过滤无关推文 |

覆盖路径：`INTAKE_SOURCES_JSON=/path/to/sources.json`

低成本 Cookie 方案见 **[INTAKE-CHEAP.md](./INTAKE-CHEAP.md)**（twscrape / x-api / 指纹浏览器导出 Cookie）。

## X API 费用控制（重要）

X 按 **Post / 拉取条数** 计费；全量 sync 一轮可达 **30+ 请求 × 多条推文**，45 分钟循环会很快烧额度。

默认 **`INTAKE_X_API=budget`**（VPS PM2 已配）：

| 变量 | 默认 | 含义 |
|------|------|------|
| `INTAKE_X_API` | `budget` | `off` 完全不调 API；`budget` 少账号+轮换搜索；`full` 旧行为 |
| `INTAKE_X_API_COOLDOWN_MINUTES` | `360` | 两次 **付费** X 拉取至少间隔 6 小时（中间 tick 仍 RSS + 合并旧 JSON） |
| `INTAKE_X_MAX_RESULTS` | `10` | 每次 timeline/search 最多条数 |
| `INTAKE_X_USER_LIMIT` | `3` | budget 只拉 coldniko / Niko1221 / ZedLLM 等优先账号 |
| `INTAKE_INTERVAL_MINUTES` | `120` | VPS 循环间隔（非 X 冷却） |
| `INTAKE_X_API_FORCE=1` | — | 忽略冷却，手动全量前用一次 |

估算：**budget + 6h 冷却** ≈ 每天 **4 次** 小批量 X 拉取，比 45 分钟 × 全量搜索低 **一个数量级以上**。

## 凭证（推荐）

1. **X API** — [Developer Portal](https://developer.x.com/) 创建 App，只读 Bearer Token：
   ```bash
   export X_BEARER_TOKEN=...
   ```
   Search Recent 需相应套餐权限；无 Token 时仍走 RSSHub。日常请保持 **`INTAKE_X_API=budget`**，仅调试时用 `INTAKE_X_API=full INTAKE_X_API_FORCE=1`。

2. **自建 RSSHub**（开源，稳定）  
   ```bash
   git clone https://github.com/DIYgod/RSSHub.git && cd RSSHub
   npm i && npm run dev   # 默认 :1200
   ```
   在 `sources.json` 把 `rsshubBaseUrls` 改为 `["http://127.0.0.1:1200"]` 或你的内网地址。

3. **其它开源方案**（需自行合规与风控）  
   - [twscrape](https://github.com/vladkens/twscrape) — Cookie 会话抓取  
   - [Nitter](https://github.com/zedeus/nitter) — RSS 实例不稳定，仅作备用  

## VPS 定时（与站点 rebuild）

```bash
# PM2 常驻 X 循环（deploy/ecosystem.config.cjs → strata-intake）
pm2 start /opt/stratat/deploy/ecosystem.config.cjs --only strata-intake

# Crontab 全量内容增长 + 每日 rebuild
chmod +x /opt/stratat/deploy/install-content-cron.sh
/opt/stratat/deploy/install-content-cron.sh
```

`pnpm content:grow` = releases + community + creator + intelligence + downloads + changelog + IndexNow。每天 6 点的 cron 再带 `CONTENT_GROW_REBUILD=1` 重建一次，把新的 issue / PR 详情页编进静态路由。

热门页（首页、脉冲、发版、更新日志、下载、作者）设了 30 分钟再验证，并读取 `STRATAT_DATA_DIR`（生产为 `/opt/stratat/apps/www/src/data`）。同步写进这个目录后，不用整站重建也会出现在这些页面上。

收录：

- 每个内容页的 canonical 和 hreflang 指向自己的路径。登录、注册、控制台 `noindex`，也不进 sitemap。
- sitemap 的 `lastModified` 用各语料自己的时间。
- `/changelog/rss.xml` 给订阅和发现。
- IndexNow 密钥是公开文件 `apps/www/public/3922defa53070fe821fdf6579fe65a36.txt`。部署之后 `content:grow` 会把首页、脉冲、发版、最新 issue / PR / 作者帖提交给 Bing。密钥还没出现在线上域名时，接口会拒绝，部署完成后下一次同步即生效。

显卡报价来自推文 **NLP 抽取**（`$`、`¥`、RTX/RX 型号），`confidence: low|medium`，**非官方牌价**；后续可接 PCPartPicker / 电商 API 作为第二数据源。

## 页面

- **Pulse** — `https://www.stratat.com/en/pulse`（信号流 + 报价表）  
- 作者专页仍用 `creator-pulse.json`（`pnpm sync:creator`）
