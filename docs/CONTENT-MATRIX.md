# 内容矩阵与长期生产计划

对标 `ldmnq.com` 的流量结构：**首页承接搜索意图 → 场景落地页分流长尾 → 知识库吃下问答型关键词 → 社区/更新页维持新鲜度**。
我们的品类是「本地部署 AI 大模型」，用户意图与模拟器不同，长尾词集中在**硬件能跑什么、怎么装、跑多快、花多少钱**。

## 一、内容分层（六层矩阵）

| 层级 | 页面类型 | 承接意图 | 现状 | 目标数量 |
| --- | --- | --- | --- | --- |
| L1 转化 | `/` `/download` `/install` | 品牌词、直接下载 | 已上线 | 3 |
| L2 决策 | `/models` `/benchmarks` `/topics` | "能不能跑" "值不值" | 已上线 | 3 大类 |
| L3 硬件长尾 | `/benchmarks/[rig]` | "RTX 4090 跑 Qwen"、型号搜索 | **已上线 29 页**，sitemap 收录 | 30+ |
| L4 任务长尾 | `/topics/[slug]` | "本地跑 xxx 怎么做" | 已上线，但每语言仅 5 篇 | 40+ |
| L5 内容新鲜度 | `/pulse` `/changelog` `/releases` `/creator` | 回访、社交分发 | 已上线 | 4 |
| L6 信任 | `/community` `/issues` `/pulls` `/links` | 品牌信任、外链 | 已上线 | 4 |

**最大缺口是 L4 的深度与 L3 的覆盖广度。** L3 已有 29 张卡，但只是 benchmark 数据的直出，缺少"能不能跑 / 值不值"的决策文案；
L4 每语言只有 5 篇，远不足以覆盖长尾。

## 二、L3 硬件页规格（实际路由 `/benchmarks/[rig]`）

每个 GPU 一页，模板固定、数据驱动：

```
/hardware/rtx-4090
  该卡能否跑 125B 级模型（显存/带宽判定，绿黄红）
  实测 tok/s 曲线（来自 benchmarks.json）
  每小时电费与回本周期
  推荐量化档位（Q4_K_M / Q5_K_M …）
  同级别替代卡对比表
  一键安装命令
```

数据来源全部已有：`benchmarks.json`、`models.json`、`topics.json`。
**生成方式**：`scripts/generate-hardware-pages.mjs` 读 benchmarks 的 rig 列表，逐个产出 `data/hardware/<slug>.json`，页面组件统一渲染。新增一张卡 = 数据里多一条，页面自动出现。

## 三、L4 任务指南规格（`/guides/[slug]`）

按真实用户问题组织，每个指南对应一组搜索词：

| 指南 | 命中意图 |
| --- | --- |
| 本地跑代码助手并接入 Cursor | "本地 cursor 替代" |
| 在家用电脑跑 128k 上下文 | "本地 128k 上下文" |
| 用 AMD 显卡跑大模型 | "amd 本地大模型" |
| 离线/断网环境下部署 | "离线 部署 大模型" |
| 双卡/多卡配置 | "双卡 本地推理" |
| 笔记本核显能跑多大模型 | "核显 跑大模型" |

每篇结构固定：**结论先行 → 硬件判定 → 命令 → 实测数据 → 常见坑**。
内容由 `import-radar-briefs.mjs` + 集群模型生成初稿，人工只做事实校验。

## 四、自动化生产链路

```
[本机/内网]  集群 z-image-turbo（192.168.2.100:8000, 6 副本）
              ↓  生成配图
           scripts/enrichment/generate-assets.mjs
              ↓  validate-images.mjs（格式/尺寸/覆盖）
           commit 图片 + manifest

[VPS 23.95.243.52]  cron: content-grow.mjs 每 4 小时
              ↓  sync:releases / community / creator / intelligence / downloads / changelog
              ↓  内容变更 → 页面重新生成
              ↓  indexnow-submit.mjs 推送搜索引擎
```

**关键约束（已确认）**：VPS 在公网，**无法访问内网集群** `192.168.2.100`（实测 UNREACHABLE）。
所以分工是：**图片在生产端（本机）生成后提交进仓库，VPS 只消费已提交的资产**。
`content-grow.mjs` 现已按 `CLUSTER_HOST` 是否存在决定是否跑 enrichment，不会在 VPS 上静默失败。

## 五、发布节奏

| 频率 | 任务 | 执行位置 |
| --- | --- | --- |
| 每 4 小时 | 内容同步（releases/community/creator/pulse/downloads/changelog） | VPS cron |
| 每天 | 新增 1 篇 L4 指南（AI 初稿 + 事实校验） | 本机 |
| 每周 | 新增 3-5 个 L3 硬件页（数据驱动，自动） | 本机生成后提交 |
| 每周日 | IndexNow 全量推送 | VPS cron |
| 每月 | 复盘 Search Console，按曝光高/点击低补内容 | 人工 |

## 六、验收口径

每批内容上线前必须通过：

```bash
node scripts/enrichment/validate-images.mjs   # 图片完整性
cd apps/www && npx tsc --noEmit               # 类型
curl -s -o /dev/null -w '%{http_code}' https://www.stratat.com/<新页面>   # 线上可达
```

## 七、现状与待办

**已完成**
- L1/L2/L5/L6 页面全部上线
- 78 张配图，0 警告 0 错误
- 内容同步 cron 运行中（每 4 小时）
- 集群图片生成链路打通

**待办（按优先级，已核实真实状态）**
1. **扩充 L4 topics 内容量** —— 当前每语言仅 5 篇（`topics.json`），是最大的真实缺口。
   目标：每语言 15-20 篇，覆盖"核显能跑多大""离线部署""双卡配置""接入 Cursor"等长尾。
2. **L3 硬件页补决策文案** —— 29 页已上线但只有数据表，缺"这张卡适合谁 / 不建议买的情况"段落。
3. **图片生产并入日常流程** —— 目前需手动跑 `pnpm enrich:assets && pnpm enrich:verify`。
4. **VPS 与集群的分工固化** —— 已确认 VPS 无法访问内网集群，图片必须在生产端生成后提交。
