# Strata Desktop — 一键安装 / 部署 / 设置

PC 端产品：**Strata 控制台**（`apps/desktop`，Tauri v2）。

## 功能模块

| 模块 | 作用 |
|------|------|
| **环境检测** | Git、磁盘、内存、GitHub、GPU 提示、SSH/rsync、仓库路径 |
| **一键安装** | `git clone` Niko1221/Strata → 新终端运行 `setup.sh` / `START-HERE.bat` |
| **一键部署** | 本机 stratat 仓库 → `deploy/sync-and-deploy.sh`（rsync + VPS `remote-bootstrap.sh`） |
| **设置** | 安装目录、monorepo 路径、VPS SSH、站点/API URL（持久化在应用配置目录） |

## 开发

```bash
cd apps/desktop
pnpm install
pnpm tauri:dev
```

打包：

```bash
rustup update stable   # Tauri 2.12+ 需要 Rust ≥ 1.90
pnpm tauri:build
```

## 设置项说明

- **Strata 安装目录**：默认 `~/Strata`（Windows：`%USERPROFILE%\Strata`）
- **Stratat 仓库根目录**：本机 `stratat` monorepo，需含 `deploy/sync-and-deploy.sh`
- **部署 VPS**：`DEPLOY_HOST` / `DEPLOY_USER`；可选 `SSH_KEY` 私钥路径
- Windows 部署需 **Git Bash** 且 `bash`/`rsync`/`ssh` 在 PATH 上

## 后续（Phase 2）

- 模型下载管理器（断点续传、镜像）
- 安装/部署进度流式日志（非仅开终端）
- 与 www 账户 / 下载页联动
- 代码签名（WinStation `wsc sign` / Apple notarization）

上游推理引擎仍为 **[Niko1221/Strata](https://github.com/Niko1221/Strata)**；本应用只做分发与运维 UX。
