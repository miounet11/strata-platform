# WP-2：GPU 硬件配置与量化矩阵

只新增四个文件，没有改页面、文案、路由或样式。面板留给 Stage-2 WP-4 挂到 `/[locale]/gpus/[slug]`。

- `apps/www/src/lib/gpu-profiles.ts`
- `apps/www/src/components/GpuConfigPanel.tsx`
- `apps/www/tests/gpu-profiles.test.ts`
- `grok/WP-2-report.md`

## 引擎

`gpuHardwareProfile(gpu, variants?)` 是纯函数。类型只从 `./gpus` 做 `import type`，六档默认量化内联在模块里，所以 `node --test` 不用走 `@/data/gpus.json`。组件调用时传入 `gpuVariants`。

功耗分两条：

- `evidence === "measured"` 的 `powerWatts` 是整机壁插。PSU = `max(650, ceil(W × 1.45 / 50) × 50)`。RTX 4090 的 550W 得到 **800W**（任务正文里的 850W 和这条公式不一致，测试门槛是 ≥ 800W）。RTX 5090 700W → 1050W。RTX 3090 500W → 750W。RX 7900 XTX 475W → 700W。RTX PRO 6000 Blackwell 720W → 1050W。
- `evidence === "estimated"` 的 `powerWatts` 是板卡 TDP。PSU = `min(1600, max(550, ceil((W + 200) × 1.25 / 50) × 50))`。批量 GeForce RTX 5090 的 575W 得到 1000W，不会按整机公式去算。缺功耗时按显存、厂商和年份估算，`tdpEstimated = true`。
- 统一内存 / 移动卡（Apple，或名字命中合同正则，或 bus 含 `igp` / `integrated`）的 PSU 为 `null`，供电是 `Unified / Internal`。

接口按名字而不是容易抄错的 `arch`：Blackwell / RTX 50 且 ≥ 220W 用 `1× 12V-2x6 (ATX 3.1)`；名字或架构确实是 Ada 且 ≥ 250W 用 `1× 16-pin 12VHPWR`；其余按 3× / 2× / 1× 8-pin 或槽供电。GeForce 10/20/30 名字即使 arch 被标成 Ada，也不会改成 16-pin。

量化：显存低于 `vramGbMin` 或 `runnable !== true` 为 `too-small`（吞吐和上下文都是 0）。Apple 用 `ramGbMin` 判 `full-vram`，否则在过了显存门槛时为 hybrid。独显要 `vram ≥ downloadGb + 4` 才算整卡放下。hybrid 的写读速度按 5070 上的档位比例缩放，再按卸载比例温和下降，下限 0.62，结果保留 1 位小数。`bestQuantId` 只取能整卡放下的最富档，没有则为 `null`。32GB 的 5090 跑 68–94GB 的包是 hybrid，所以 best 为 `null`；256GB 的 M5 Ultra 六档都是 `full-vram`，best 是 `ud-iq4_xs`，上下文 128K。

年电费 = `tdpWatts / 1000 × 4 × 365 × 0.15`，和 TDP 同向。5090 为 153.30 美元，5070 为 87.60 美元。

## 面板

`GpuConfigPanel` 没有 `"use client"`。`support === "not-supported"` 只渲染 PCIe、TDP、供电和槽宽。其余卡渲染电源、内存、效率、电费和六行量化表。类名是 `gpu-config-panel`、`gpu-config-grid`、`gpu-quant-table`，以及 `badge-ok` / `badge-warn` / `badge-muted`。

用同样的字段拼出紧凑 HTML 后，3207 张卡的面板正文最大约 1.6 KB，不支持的卡约 0.4 KB，都低于 3.5 KB。`ramUnit` 应是裸单位（`GB`），拆分行会把它同时标在显存和卸载内存上。

## 验收

- `node --test apps/www/tests/gpu-profiles.test.ts`：15 通过，0 失败。
- `npm test`：171 通过，0 失败。
- `cd apps/www && npx tsc --noEmit`：退出码 0。

全目录 3207 张卡没有抛错、`NaN` 或 `Infinity`，`tdpWatts > 0`。非空 PSU 都是 50W 的倍数。

## 已知数据边界

- 合同正则里的 `m\b` 会命中词尾 m，例如 Millennium、FireStream、`600nm`。这些卡走统一内存供电路径。
- 1386 张卡的 `year` 是 `null`，约一半没有 `bus`。没有 bus 时按代际写 PCIe；统一内存写 `Unified memory fabric`；年份和 bus 都空则是 `Bus unspecified`。
- 目录里的 `writingTps` 接近 0 时，估算吞吐也接近 0，不会另造一个速度。
- 页面还没挂这个组件，180 KB HTML 审计要等 WP-4 接入后再看。
