# X 内容更新

`/pulse` 的三条 X 栏目互不重复。一条帖子只进一个栏目：升级，否则对比或基准，其余进最新。

| 栏目 | 数据 |
|------|------|
| Latest on X | 跟踪账号和一般搜索里，不属于下面两类的帖子 |
| Comparisons | 对比、tok/s、benchmark |
| Upgrades | 升级、迁移、新版本 |

首页「当前版本」读 `releases.json` 的最新一条。`/pulse` 页眉写本轮来源：`gateway`、`cheap-x`、`rsshub`、`x-api`，都没有新帖时是 `cache`（沿用上一份 JSON）。

## 抓取顺序

每个任务只使用第一个有结果的来源：

```text
X gateway（X_GATEWAY_KEY，免费配额）
  → cheap-x（INTAKE_CHEAP_X_URL）
  → RSSHub
  → 付费 X API（默认 budget，且有网关或 cheap-x 时跳过）
```

没有新帖时不覆盖旧信号。GitHub Issue 只补空档。

## 配额

网关每天约 50 个新任务。默认 budget：

- 用户：`coldniko`、`Niko1221`、`ZedLLM`（`INTAKE_X_USER_LIMIT`）
- 当前版本：每轮都搜 `Strata v0.1.40.2` 这种标签，不跟轮换走
- 搜索：一般 / 对比 / 升级 / 显卡，每轮再加其中一条，下一轮换下一条
- 冷却：`X_GATEWAY_COOLDOWN_MINUTES=240`

一轮大约 5 个任务，一天 6 轮，约 30 个任务。`INTAKE_X_API=full` 才把四类搜索一次跑完。

没有 `X_GATEWAY_KEY` 时，RSSHub 的 Twitter 路由经常是空的，脚本会保留上一份 JSON。页面上的「最新一条」看帖子时间，不看这次同步有没有打到网关。

```bash
# 用已有 JSON 重分栏目，不访问网络
INTAKE_SKIP_NETWORK=1 pnpm sync:intelligence

# 真正拉 X。密钥放环境变量，不要写进仓库
export X_GATEWAY_KEY=
pnpm sync:intelligence

# 版本、社区、作者、X、下载、更新日志
pnpm content:grow
```

搜索词在 `scripts/intake/sources.json`。升级词里要保留当前版本号，例如 `Strata v0.1.40.2`。
