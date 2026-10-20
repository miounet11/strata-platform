# Upstream client

## 来源

| 项目 | 值 |
| --- | --- |
| 仓库 | `Niko1221/Strata` |
| 标签 | `v0.2.0-beta`（固定，不跟随 `main`） |
| 许可证 | MIT |
| 导入目录 | `apps/client-upstream/desktop`（Tauri 外壳）、`apps/client-upstream/host`（React UI + host server） |
| 抓取方式 | `./scripts/fetch-upstream.sh [tag]` |

`apps/client-upstream/UPSTREAM` 记录本次导入的仓库、标签与抓取方式，由脚本自动生成。

## 关于 morluto/rea

最初的指令提到用 `https://github.com/morluto/rea/` 取客户端。实测它是逆向分析工具
（`rea-agents`：CLI + MCP server），不含桌面客户端源码。复核方式：

```bash
gh api repos/morluto/rea --jq '.description'
gh api 'repos/morluto/rea/git/trees/main?recursive=1' --jq '.tree[].path' | grep -ciE '^apps/|src-tauri'
```

实测结果：描述为 `Reverse engineer anything with agents ...`，5040 条路径中
`^apps/` 或 `src-tauri` 的命中数为 **0**；而 `Niko1221/Strata@v0.2.0-beta` 的
`apps/desktop` + `apps/host` 有 **790** 条路径。因此客户端源码只能取自后者。

## 同步策略

1. 只导入 `apps/desktop` 与 `apps/host`，不引入引擎、cmake 与 Python host。
2. 上游每次发版固定一个新标签，改 `scripts/fetch-upstream.sh` 的默认 `UPSTREAM_TAG`
   或直接传参；脚本整体覆盖 `apps/client-upstream`，不保留本地改动。
3. 自有改动一律写在上游目录之外，或在下游仓库中作为独立 commit 记录，便于重放。
4. 抓取后先跑 `npm ci && npm run typecheck && npm run build`（在 `host/` 下）确认可用。

## 品牌与接口边界

分叉为 `stratat` 时，**产品身份**全部改名，**上游引擎接口**保持原样。

已改名：

- `productName` / `identifier`：`Stratat` / `ai.stratat.desktop`
- 包名：`stratat`、`stratat-desktop`（`package.json`、`Cargo.toml`）
- 进程名与日志前缀：`stratat-desktop`、`[stratat]`、`stratat-logs-*`
- 数据目录：`~/.stratat`、`~/.local/share/stratat`、Windows `%LOCALAPPDATA%\Stratat`
- 更新与发布源：`miounet11/strata-platform`
- 九种语言文案中的产品名

必须保留（上游引擎约定，改了会调不通）：

- 环境变量前缀 `STRATA_*`（desktop 与 host 之间的协议）
- `strata.py`、`strata_control`、`strata_mcp.py`、`setup.py --update`
- 本地存储键 `strata.prefs.*`、`strata.sessions.*`（影响用户已有数据）

## 许可证

上游为 MIT。分发二进制时需保留版权声明与许可证文本，见 `apps/client-upstream/UPSTREAM`。
