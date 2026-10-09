# Strata 平台持续更新计划

> 制定日期：2026-10-09 · 依据：当日文案重写、多语言修复、X 采集排障的实测结果

## 一、自动运行的部分（无需人工干预）

| 事项 | 频率 | 机制 | 状态 |
|---|---|---|---|
| GitHub Issues/PR 镜像 | 120 分钟 | strata-intake 进程 | 正常，24h 新增 150+ 条 |
| X 推文采集 | 120 分钟 | strata-intake + 免费 Bearer Token | 已修复，`paidX req=10 posts=37` 实测通过 |
| 版本/作者/行情同步 | 120 分钟 | strata-intake | 正常 |
| 站点进程守护 | — | pm2（strata-www / strata-api） | 正常 |

唯一需要人工的场景：token 失效（日志持续出现 `paidX=skipped` 或 401/403 时更换 `X_BEARER_TOKEN`）。

## 二、文案与多语言（已完成 + 待办）

**已完成**
- [x] zh 全站文案重写：菜单 2–4 字、描述 ≤20 字、说人话不说术语（提交 `fb3af08`）
- [x] 修复 ja/de/fr/es/pt 缺失 20 键导致的页面渲染报错（提交 `6690b15`），7 语言 216 键全对齐
- [x] 全部部署上线并验证（7 语言首页 200，新文案生效）

**待办（按优先级）**
- [ ] en 文案按 zh 范本重写（英文版是默认语言，影响面最大）
- [ ] ja/de/fr/es/pt 按各自语言习惯意译 zh 风格（不是逐字翻译）
- [ ] 全部完成后走一次「scp → 重建 → 重启」全量部署
- 风格规范：菜单名称 2–4 字、功能描述 ≤20 字、日常说法、不出现 Issues/PR/控制台/同步 等术语

## 三、内容与数据（按需）

- benchmarks.json / models.json 为静态维护，更新走「本地改 → scp → 服务器重建」
- 每次改动后验证三件事：`tsc --noEmit` 无错、`pnpm build` 成功、线上页面 200 + 新文案抽查
- 数据缺口备忘：作者动态停在 10-06 属作者本人未发帖；X 行情数据依赖推文里出现价格

## 四、已知注意事项

1. 服务器 `/opt/stratat` 不是 git 仓库，GitHub 提交不等于部署，必须 scp + 重建
2. `.env`（token）与 `.env.intake`（intake 进程配置）是两份文件，改后要 `pm2 restart strata-intake`
3. SSH 偶发断连，重试即可
4. 改 messages 或数据 json 必须重建，standalone 不热读
