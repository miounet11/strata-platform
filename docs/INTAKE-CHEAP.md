# 超省 X 情报方案（不用 Developer Post 计费）

Developer Portal 的 **Post 计费**（你截图里 330 次 ≈ $1.65）和「网页上刷 X」不是同一条路。  
**目标：关掉付费 API，用自建 Cookie 会话 + 低频拉取。**

## 推荐栈（GitHub 开源）

| 方案 | 仓库 | 成本 | 说明 |
|------|------|------|------|
| **twscrape + x-api**（推荐） | [vladkens/twscrape](https://github.com/vladkens/twscrape) + [w95/x-api](https://github.com/w95/x-api) | **$0** Post 费 | 用 `auth_token` + `ct0` Cookie，GraphQL 拉 timeline/search |
| **RSSHub 自建** | [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub) | **$0** | 配 `TWITTER_AUTH_TOKEN`，路由 `/twitter/user/:id`；公开镜像已基本失效 |
| **GitHub 社区** | 已有 `sync:community` | **$0** | Issue 兜底，无 X 对比细节 |
| **付费 X API v2** | developer.x.com | **按 Post 扣费** | 仅调试：`INTAKE_X_API=full INTAKE_X_API_FORCE=1` |

**指纹浏览器 / 多开浏览器**（AdsPower、GoLogin、BitBrowser 等）的作用：  
用**干净环境**登录一个**专门用来抓取的 X 小号**，导出 Cookie，避免污染主账号；不是必须，普通 Chrome 隐身窗口 + DevTools 也能导出。

### Cookie 怎么拿（任意浏览器）

1. 登录 x.com（建议专用小号）。
2. DevTools → Application → Cookies → `https://x.com`  
   复制 **`auth_token`** 和 **`ct0`**。
3. 或用 twscrape 文档推荐的 [unjar](https://github.com/vladkens/unjar) 从浏览器配置一键导出。

### 在 VPS 上跑 x-api（与 stratat 同机）

```bash
cd /opt/stratat/deploy/cheap-x
docker compose -f docker-compose.yml up -d

# 本机安装 twscrape CLI，写入 Cookie（在 VPS 或本机执行一次）
pip install twscrape
export TWS_DB=/var/lib/x-api/x-api.db   # 与容器 volume 对齐时可 docker exec
twscrape add_accounts accounts.txt username:password:email:email_password:_:cookies
# 或仅 Cookie 行：username:pass:email:emailpass:phone:auth_token=...; ct0=...

curl -s http://127.0.0.1:8080/healthz
curl -s "http://127.0.0.1:8080/api/user/coldniko/tweets?limit=5" | head
```

### 接到 stratat intake

在 `/opt/stratat/.env.intake`：

```bash
# 关掉付费 API（最重要）
INTAKE_X_API=off
# 可注释或删除 X_BEARER_TOKEN

# 自建 bridge（同机）
INTAKE_CHEAP_X_URL=http://127.0.0.1:8080

# 已有节流（无 API 时仍控制 RSS/合并频率）
INTAKE_INTERVAL_MINUTES=120
INTAKE_X_API_COOLDOWN_MINUTES=360
```

`scripts/sync-intelligence.mjs` 会 **优先** 走 `INTAKE_CHEAP_X_URL`，再 RSSHub，再（若未 off）付费 API。

探测：

```bash
node scripts/intake/probe-cheap-x.mjs
```

重启 intake：

```bash
pm2 restart strata-intake --update-env
```

### RSSHub 备选（同一 Cookie）

```bash
cd deploy/cheap-x
echo 'TWITTER_AUTH_TOKEN=你的auth_token' > .env.rsshub
docker compose -f rsshub-compose.yml --env-file .env.rsshub up -d
```

在 `scripts/intake/sources.json` 把 `rsshubBaseUrls` 改为 `["http://127.0.0.1:1200"]`。

### 内网集群跑 bridge

VPS 访问不到 LAN 时，任选其一：

- **WireGuard / Tailscale** 把 `8080` 暴露给 VPS；
- **SSH 反向隧道**：`ssh -N -R 127.0.0.1:18080:127.0.0.1:8080 user@$DEPLOY_HOST`（地址见本地环境变量，勿写进文档），VPS 上 `INTAKE_CHEAP_X_URL=http://127.0.0.1:18080`。

### 省额度操作清单

1. **VPS 已切 `INTAKE_X_API=budget`** — 6h 冷却、少账号；建议再改为 **`off`**。
2. **不要** 45 分钟全量搜索；budget 已改为 **120 分钟 + 轮换 4 条搜索/轮**。
3. **合并旧 JSON** — 冷却期内仍保留已有 260+ signals，不会变空。
4. **GitHub** — `GITHUB_TOKEN` 只增 rate limit，不产生 X 费用；cron 社区同步继续用。
5. **出图** 仍走 LAN `enrich:assets`，与 X 无关。

### 合规提示

Cookie 抓取违反 X ToS 的风险由账号承担；请用**小号**、**低频率**（与 `INTAKE_INTERVAL_MINUTES=120` 一致），不要多账号刷量。
