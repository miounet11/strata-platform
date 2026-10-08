# 集群配图 · TTS · 演示代码（内网 AI 集群）

用内网 **AI 集群**批量生成站点配图、语音与代码块，写入 `media-manifest.json` 并在各页面自动挂载。

## 集群能力（已探测）

| 服务 | 访问 | 用途 |
|------|------|------|
| **qwen-image-21** | SSH → Pod `8000` | 文生图（`POST /v1/images/generations`） |
| **qwen3-tts-acted** | `$CLUSTER_TTS_URL` | TTS（`POST /v1/audio/speech`） |
| **luxtts** | `$CLUSTER_LUX_TTS_URL` | 备用 TTS |
| **ffmpeg** | 集群节点 | 环境音 / 后处理 |

**切勿把 SSH 密码或内网 IP 提交进 Git。** 在本机或 VPS 环境变量中配置：

```bash
export CLUSTER_HOST=<内网地址>
export CLUSTER_SSH_USER=root
export CLUSTER_SSH_PASS='…'   # 仅本地 shell / CI secret
export CLUSTER_TTS_URL=http://<内网地址>:31801
```

## 工作流

1. 编辑 **`scripts/enrichment/briefs.json`** — 每页 slot（`hero`、`feature-*`、`demo-code`、`tts`）
2. 生成资源：

```bash
pnpm enrich:assets
# 或限量 / 指定 ID
ENRICH_LIMIT=4 ENRICH_ONLY=hero-home,card-local pnpm enrich:assets
```

3. 产出：
   - 图片/音频 → `apps/www/public/media/enriched/`
   - 元数据 → `apps/www/src/data/media-manifest.json`
4. 页面通过 `<EnrichedImage />`、`<EnrichedAudio />`、`<EnrichedCode />` 读取 manifest

## 持续更新

```bash
# 与内容同步一起跑（已配置 CLUSTER_SSH_PASS 时）
pnpm content:grow

# 仅配图循环（每 6 小时一批，跳过已有文件）
ENRICH_INTERVAL_MINUTES=360 node scripts/enrichment/run-enrich-loop.mjs
```

部署后把生成的 `public/media/enriched/*` 与 `media-manifest.json` rsync 到 VPS，再 `pnpm --filter @stratat/www build`。

## 扩展 briefs（大规模）

在 `briefs.json` 的 `items` 数组中按页追加即可，例如：

- `/community` — 硬件讨论配图  
- `/changelog` — 发版主题图  
- 每条 `/creator/updates/*` — 可由后续脚本从 `creator-pulse.json` 自动生成 brief 再批处理  

开源替代：本地 **ComfyUI / SDXL** 只需改 `cluster-client.mjs` 的 `generateImageB64`  endpoint。
