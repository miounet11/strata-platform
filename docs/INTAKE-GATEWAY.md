# X 数据网关对接（stratat intake）

用户自建的 X 抓取网关（Cloak 无头浏览器，**$0，不走 Developer Post 计费**）：

- **Base**: 自建网关地址，通过 `X_GATEWAY_URL` 配置（明文 HTTP；示例 `http://127.0.0.1:8790`）
- **鉴权**: 请求头 `X-API-Key`
- **异步**: `POST /v1/jobs` → `job_id` → 轮询 `GET /v1/jobs/{id}`（或 callback_url）
- **任务类型**: `user_posts` / `post` / `search` / `user_profile`（单任务 ≤20 条）
- **配额**: 每项目每天 **50** 个新任务；**1 小时缓存**命中不计费；队列上限 100
- **延迟**: 1–3 分钟/任务（worker 60s 轮询 + 人类节奏滚动），**不适合实时**

## stratat 已接入

`scripts/intake/x-gateway-client.mjs`（提交 + 轮询 + signal 转换），`sync-intelligence.mjs` 优先级：

```text
X Gateway (X_GATEWAY_KEY) → cheap-x (INTAKE_CHEAP_X_URL, twscrape) → RSSHub → 付费 API (默认 off)
```

### VPS 配置（/opt/stratat/.env.intake，chmod 600）

```bash
X_GATEWAY_URL=http://<你的网关地址>:8790
X_GATEWAY_KEY=
```

### Key 分配（勿提交公开仓库；本表只列前缀示例）

| 项目 | Key 前缀 | 用途 |
|------|-----|------|
| project-a | `xk_a_…` | stratat intelligence intake |
| project-b | `xk_b_…` | 备用（如 creator 页面加速） |
| project-c | `xk_c_…` | 备用 |
| admin | `xk_admin_…` | 管理，不限额 |

## 与配额的匹配（每日 50 个新任务）

Budget 模式默认每轮（120 分钟）X 拉取量：

| 项 | 数 | 说明 |
|----|----|------|
| 用户 timeline | 3 | `INTAKE_X_USER_LIMIT=3`（coldniko / Niko1221 / ZedLLM） |
| 通用搜索 | 1 | `xSearchQueries` 轮换 |
| 对比搜索 | 1 | `xComparisonQueries` 轮换 |
| 升级搜索 | 1 | `xUpgradeQueries` 轮换 |
| GPU 报价 | 1 | `gpuPriceQueries` 轮换 |
| **合计** | **7/轮 × 12 轮 = 84/天** | **超配额** |

**方案（选一个，推荐 A）：**

- **A. gateway 专用冷却**：`X_GATEWAY_COOLDOWN_MINUTES=240` → **4 小时一轮**，7×6 = **42/天** ✅ 留 8 个余量给手动调试
- **B. 降用户数**：`INTAKE_X_USER_LIMIT=1`（只拉 coldniko）→ 5/轮 × 12 = 60/天，仍超
- **C. 两者结合**：`X_GATEWAY_COOLDOWN_MINUTES=240` + `INTAKE_X_USER_LIMIT=2` → 6×6 = **36/天** ✅ 更保守

### 冷却机制（与付费 API 同用 `x-api-budget.mjs`）

`X_GATEWAY_COOLDOWN_MINUTES`（默认 240）控制两次 **网关提交** 的最小间隔；
`X_GATEWAY_FORCE=1` 忽略冷却手动跑一次。

## 已知限制

- 每任务 ≤ **20 条**，不能翻页拿历史
- 登录态失效 → 任务 `error`，需重新登录 Cloak（用户负责 worker）
- HTTP 明文：Key 明文传输，后续可加 nginx HTTPS
- worker 重启需手动：`nohup /workspace/x-data-gateway/run_worker.sh ... &`（box 重启后）
