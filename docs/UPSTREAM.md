# Upstream client

## 来源

| 项目 | 值 |
| --- | --- |
| 仓库 | `Niko1221/Strata` |
| 标签 | `v0.2.22`（固定，不跟随 `main`） |
| 许可证 | MIT |
| 导入目录 | `apps/client-upstream/desktop`（Tauri v2 外壳）、`apps/client-upstream/host`（React UI + host server） |
| 抓取方式 | `./scripts/fetch-upstream.sh [tag]` + `node scripts/rebrand-upstream.mjs` |
| 资源暂存 | `node scripts/stage-desktop-resources.mjs --target <triple>` |

`apps/client-upstream/UPSTREAM` 记录本次导入的仓库、标签与抓取方式，由脚本自动生成。

## 同步与打包架构（v0.2.22）

1. `scripts/fetch-upstream.sh` 自动兼容上游 `v0.2.16+` 的 `app/{desktop,host}` 目录结构以及早期版本的 `apps/{desktop,host}` 结构。
2. `scripts/rebrand-upstream.mjs` 幂等地完成 Stratat 品牌统一与自有补丁重放（包括中国区首发语言识别、macOS `/var/folders` 白名单、`STRATA_REAL_ENGINE=0` 模拟保护与测试适配）。
3. `scripts/stage-desktop-resources.mjs` 按目标平台拉取并严格校验 SHA-256 的真实运行时资源（不再使用空占位目录）：
   - `resources/node/`：目标平台独立的私有 Node `v24.12.0`（自动清理异平台二进制，避免 macOS 包混入 `node.exe`）。
   - `resources/control/`：经校验的 `strata-control 0.1.69`（内置 CPython 3.12.15 + 锁哈希 wheels + `strata.py` + `setup.py` + `tools/strata_mcp.py` + `serve/` + `data/`）。
   - `resources/harness/`：经校验的 MIT 协议 DeepSeek Harness `0.2.1-alpha.3` + `@playwright/mcp` 浏览器工具 + 全部 3 个上下文/搜索/MCP 补丁。
   - `resources/engine-bundle/`：在 Apple Silicon (`aarch64-apple-darwin`) 上直接内置全部三套原生 Metal 引擎（`strata-engine 0.1.69` + `strata-vision`、`strata-hy4 0.1.67`、`strata-inkling 0.1.67`），开箱即用无需首启下载引擎。
4. `scripts/build-release.sh --verify` 在验证签名之外，校验 `.app/Contents/Resources/` 完整性并实跑编译产物的 `--self-test`，确认 Control、Harness、Install Center 与私有 Node 全链路通过。

## Stratat 桌面端增强能力

- **功能安装与体检中心（Settings → Install & Repair）**：实时检测 Control、原生推理引擎（Qwen3.8 / HY-4 / Inkling 2 Mini）、Agent Harness、Playwright 浏览器自动化、Cloudflare 隧道连接器与模型磁盘空间；支持一键修复与脱敏诊断包导出。
- **下载加速镜像与代理**：内置 Hugging Face 官方、HF-Mirror（中国加速）、ModelScope（魔搭直连）一键切换与自定义代理配置，并带实时镜像测速推荐，自动穿透至全部模型/视觉/草稿/图像下载流程。
- **显式一键安装 Cloudflare 隧道**：保持打包模式后台 `STRATA_NO_ACQUIRE` 零静默下载原则，同时允许用户在界面显式点击安装经 SHA-256 校验的 `cloudflared`。
- **一键外部 IDE / Agent / MCP 集成**：安全配置并校验 Claude Code、Cursor、Windsurf、Codex CLI、Continue（自动 `.stratat.bak` 备份、原子写入、一键卸载还原）。

## 品牌与接口边界

分叉为 `stratat` 时，**产品身份**全部改名，**上游引擎接口**保持原样。

已改名：

- `productName` / `identifier`：`Stratat` / `com.ksxw.stratat`（对齐 Apple Developer 注册的 App ID，见 commit `c175dc3`；不要改回 `ai.stratat.desktop`，会破坏签名链）
- 包名：`stratat`、`stratat-desktop`（`package.json`、`Cargo.toml`）
- 进程名与日志前缀：`stratat-desktop`、`[stratat]`、`stratat-logs-*`
- 数据目录：`~/.stratat`、`~/.local/share/stratat`、Windows `%LOCALAPPDATA%\Stratat`
- 更新与发布源：`miounet11/strata-platform`（自有 updater minisign 公钥）
- 十种语言文案中的产品名与功能安装中心词条

必须保留（上游引擎约定，改了会调不通）：

- 环境变量前缀 `STRATA_*`（desktop 与 host 之间的协议）
- `strata.py`、`strata_control`、`strata_mcp.py`、`setup.py --update`
- `"service": "strata"` 推理服务端点协议
- 本地存储键 `strata.prefs.*`、`strata.sessions.*`（影响用户已有数据）

## 许可证

上游为 MIT。分发二进制时需保留版权声明与许可证文本，见 `apps/client-upstream/UPSTREAM`。
