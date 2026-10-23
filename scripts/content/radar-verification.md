# 热词雷达：端到端验收记录

本文记录雷达接入既有内容流水线后的真实验收结果。每一条都对应一次实际执行的命令与它打印的退出码，不是预期行为。

最后更新：2026-10-23 UTC。

---

## 1. 单元测试

| 位置 | 命令 | 结果 |
| --- | --- | --- |
| 本地 | `node scripts/content/radar.test.mjs` | `LOCAL_EXIT=0`，`ℹ tests 13 / pass 13 / fail 0` |
| 生产机 | `cd /opt/stratat && node scripts/content/radar.test.mjs` | `PROD_EXIT=0`，`# tests 13 / # pass 13 / # fail 0` |

两侧同一份测试、同一批用例，都通过。

---

## 2. 生产机定时任务试运行

命令：`bash scripts/content/daily-guides.sh --no-build`
日志：`/var/log/stratat-guides.log`（`daily-guides.sh` 第 17 行 `exec >>"$LOG" 2>&1` 把 stdout 全部写入该文件，因此后台任务的输出文件为空——不能据此判断成功或失败）。

两次运行分别开始于 01:15:54 与 01:27:07，日志第 505–646 行。

| 阶段 | 第一次（01:15:54 → 01:19:45） | 第二次（01:27:07 → …） |
| --- | --- | --- |
| radar | `80 raw → 8 on-topic and new → 7 selected`，`merged 7 radar item(s)`，`exit=0` | `80 raw → 1 on-topic and new → 1 selected`，`merged 1 radar item(s)`，`exit=0` |
| generate (en) | `✓ ok=12 skipped=149 failed=0`，`exit=0` | `✓ ok=1 skipped=161 failed=0`，`exit=0` |
| generate (zh) | `✓ ok=4 skipped=143 failed=0`，`exit=0` | `✓ ok=0 skipped=147 failed=0`，`exit=0` |
| images | `✓ generated=14 skipped=779 failed=0`，`exit=0` | `✓ generated=1 skipped=793 failed=0`，`exit=0` |
| verify | `checked 793 article(s)`，`worst cross-locale pair: 0.117 es/rtx5080-coder ~ pt/rx7900xtx-coder`，`✓ all articles pass`，`exit=0` | `checked 794 article(s)`，`worst … 0.117`，`✓ all articles pass`，`exit=0` |
| publish | `published 16 · already live 292 · still scheduled 485`（en 12 / zh 4），`exit=0` | `published 1 · already live 308 · still scheduled 485`，`exit=0` |
| indexnow | `200 — 500 urls`，`exit=0` | `exit=0` |

所有阶段 `exit=0`。第二次只选出 1 条，是因为第一次已经消费了当天的信号——这是冷却与去重的预期结果，不是失败。

第一次的 `generated=14` 与 `published 16 / en 12 / zh 4` 数量不相等，是区间差异：`images.mjs` 只处理本次 `generate` 新写入且缺图的条目，`publish` 统计的是当日所有已满足条件的排期项，其中包含此前已生成、当天首次满足发布条件的条目。这两个数字不能相互校验。

### 关于 `--no-build`

`--no-build` 跳过 Next 构建，所以新发布的页面在 `deploy-www.sh` 执行前会 404。这是 flag 语义，不是缺陷。需要页面立即可见时，去掉 `--no-build`，或单独跑一次部署。

---

## 3. 发布结果的线上核验

15 个新发布 URL 全部 HTTP 200，且 `<title>` 是真实标题而非 slug（核对时间 2026-10-23）：

| URL | HTTP | title |
| --- | --- | --- |
| `/en/guides/deepseek-v4-1-flash-1017` | 200 | DeepSeek V4.1 Flash 1017: the Stratat page lets you run the model locally |
| `/en/guides/deepinfer` | 200 | Strata supports DeepSeek-AI DeepInfer for local inference on large models |
| `/en/guides/flint` | 200 | RecursiveSI/flint enables on-device inference with the Strata engine |
| `/en/guides/muse-spark-open-816b-a42b` | 200 | Stratat introduces Muse-Spark-Open-816B-A42B, a 816B open AI model that runs locally on your desktop |
| `/en/guides/hy-memory-30b-a3b` | 200 | Tencent Hy-Memory-30B-A3B - Local LLM that fits in 8GB VRAM |
| `/en/guides/embeddinggemma-2` | 200 | Stratat introduces embeddinggemma-2: local embedding generation with the Strata engine |
| `/en/guides/spark-x2-6-4b` | 200 | Spark-X2.6-4B: a local LLM model from XHToken for efficient on-device intelligence |
| `/en/guides/timestral-209m` | 200 | Stratat introduces Timestral-209M, a small open-source model for on-device AI |
| `/en/guides/qwen3-8-flash-next-fp4-local` | 200 | Stratat introduces Nvidia Qwen3.8-Flash-Next FP4 local AI model for private inference |
| `/en/guides/qwen-image-2-1-uncensored-quantized` | 200 | Qwen-Image-2.1 Uncensored Quantized - Stratat supports running this model fully offline |
| `/en/guides/deepseek-v4-1-flash-1017-uncensored-fp8` | 200 | DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8 from AlignAI: a locally runnable large AI model |
| `/en/guides/humanizer` | 200 | Stratat humanizer: local AI text smoothing with the Strata engine |
| `/en/guides/sage-a1-5` | 200 | Stratat introduces Sage-A1.5, a local LLM for edge inference on your desktop |
| `/en/guides/beam-1-0-501b-a23b` | 200 | Stratat introduces the Beam-1.0 501B A23B model for on-device reflection |
| `/en/guides/orcacyber-nano-1-0` | 200 | OrcaCyber-Nano-1.0 lets you run a small cyber-safety model locally with Stratat |

15/15 通过；没有一条标题是 slug 形式。

---

## 4. plan 中的雷达条目

`scripts/content/plan.json` 共 1044 条，其中 `kind: "radar"` 15 条，状态全部为 `scheduled`，`publishAt: "2026-10-23"`。字段形状：

```json
{
  "id": "en-radar-deepinfer",
  "locale": "en",
  "kind": "radar",
  "slug": "deepinfer",
  "path": "/en/guides/deepinfer",
  "workingTitle": "deepseek-ai/DeepInfer",
  "radar": { "source": "github", "url": "https://github.com/deepseek-ai/DeepInfer", "score": 0.9739, "momentum": 1 },
  "publishAt": "2026-10-23",
  "status": "scheduled",
  "order": 1030
}
```

`workingTitle` 携带真实名称，`slug` 只用于路径——生成标题时用 `workingTitle || slug`，绝不用裸 slug 当 Subject。

---

## 5. 部署门禁的真实缺陷与修复

### 事故

`scripts/deploy-www.sh` 在 `apps/www` 目录下执行 `node scripts/similarity.mjs`。该文件在开发机存在，但**从未同步到生产机**：

```
$ ssh root@23.95.243.52 "cd /opt/stratat && find . -name '*simil*' -not -path './node_modules/*'"
（无输出）
```

于是每次部署 `node` 都以 `1` 退出（`MODULE_NOT_FOUND`），而脚本的 catch-all 分支把它解释成"发现重复页"，打印 `duplicate pages reported, deploy continues`，然后**继续部署**。门禁连续多轮没有真正执行过，日志却显示它执行了。

### 为什么这是真缺陷

在真实的线上树上运行该脚本，输出完全不同：

```
pages=44475 skipped_thin=314 ... candidates=3489 verified=1977
similarity max=1.000 threshold=0.72 pairs=1975 EXIT=1
```

1975 对页面超过 0.72（多对为 1.000，即字节完全相同）。"文件不存在"和"1975 对重复"是两件事，`*)` 把它们合并成了一件事。

### 修复

`scripts/deploy-www.sh` 现在：

1. 先检查 `scripts/similarity.mjs` 是否存在，缺失即拒绝部署；
2. 只把退出码 `1` 当作"发现重复"（仍然 advisory，除非 `SIMILARITY_STRICT=1`）；
3. 其余任何非零退出码都视为门禁无法运行，拒绝部署。

### 分支验证

把该段抽出为独立脚本，用桩 `node` 控制退出码，逐个分支跑：

| 场景 | 退出码 | 输出 |
| --- | --- | --- |
| 文件缺失（本次事故） | 1 | `similarity gate missing ... refusing to deploy` |
| 存在 + 退出 1（真重复） | 0 | `reported duplicate pages (exit=1) — deploy continues` |
| 存在 + 退出 1 + `SIMILARITY_STRICT=1` | 1 | `similarity failed (exit=1) — live site untouched` |
| 存在 + 退出 2（无法运行） | 1 | `similarity could not run (exit=2) — gate is broken` |
| 存在 + 退出 0 | 0 | 无输出 |

### 同步状态

`apps/www/scripts/similarity.mjs` 与 `test-similarity.mjs` 已 `scp` 到 `/opt/stratat/apps/www/scripts/`，两侧 md5 一致：

```
3473b43d52337350713155e51b32a962  similarity.mjs
9ec6afd8e42067c1d7f7f2842da5cb53  test-similarity.mjs
```

`scripts/deploy-www.sh` 同步后两侧 md5 均为 `e87c2f638718ac734589c34fe13bccd0`，生产机 `bash -n` 退出 0。

### 真实部署路径验证（exit 1：继续）

```
radar tests passed
sitemap urls: 44789
audit score=71 checks=14 EXIT=1
audit reported failures (exit=1) — deploy continues, set AUDIT_STRICT=1 to block
similarity max=1.000 threshold=0.72 pairs=1975 EXIT=1
similarity reported duplicate pages (exit=1) — deploy continues, set SIMILARITY_STRICT=1 to block
build ok; swap skipped (--no-restart)
DEPLOY_EXIT=0
```

修复前这一行是 `node` 的 MODULE_NOT_FOUND；修复后它真的读取了 44,475 个页面并给出 1,975 对结果。`--no-restart` 跳过 swap，线上 `.next` 未被动过（`curl https://www.stratat.com/en` 返回 200，`pm2` 中 `strata-www` 仍为 `online`），试跑产生的 10G `.next-build` 已删除，磁盘回到 31%。

### 真实部署路径验证（exit 2：阻断）

只验证"继续"不够，还必须验证阻断是真的。把 `apps/www/scripts/similarity.mjs` 临时替换为 `process.exit(2)`，跑同一条命令（日志 `/tmp/deploy-exit2-test.log`）：

```
similarity could not run (exit=2) — gate is broken, refusing to deploy
DEPLOY_EXIT=1
```

`swap skipped` 从未打印——部署在 similarity 阶段终止。随后从 `/tmp/similarity.mjs.bak` 恢复，`md5sum` 回到 `3473b43d52337350713155e51b32a962`（与开发机一致），`.next-build` 已删除，`https://www.stratat.com/en` 返回 200。

---

## 6. 已知遗留

- 1975 对高相似页面来自 GPU 目录里仅差一个代号的行（如 `amd-firepro-w4170m-2-gb` 与 `-2`、`-3`）。这是数据层问题，不是雷达引入的；`SIMILARITY_STRICT` 保持默认（advisory），否则每次部署都会被它挡住。
- 生产机 `/opt/stratat` 不是 git 仓库，文件靠同步落地。新增 `apps/www/scripts/*` 时需要显式 `scp`，本次事故即由这个同步缺口造成。

---

## 7. 复现命令

```bash
# 单元测试
node scripts/content/radar.test.mjs

# 生产机端到端（不构建）
ssh root@23.95.243.52 "cd /opt/stratat && bash scripts/content/daily-guides.sh --no-build"

# 门禁单独运行（需要 .next-build/server/app）
cd apps/www && SITE_DIR=. NEXT_DIST_DIR=.next-build node scripts/similarity.mjs
```
