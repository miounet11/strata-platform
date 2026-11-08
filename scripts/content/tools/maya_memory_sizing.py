#!/usr/bin/env python3
"""One-off publisher for the Project Maya memory-sizing guide.

Writes one article per locale into scripts/content/out/<locale>/<slug>.json, renders a hero
image per locale, and registers each image in the site's media manifest.

    python3 scripts/content/tools/maya_memory_sizing.py

Kept in the repo (rather than run from /tmp) so the content it publishes is reviewable and
re-runnable. The article JSON it writes is the same shape generate.mjs produces, so the
existing verify/publish gates apply unchanged.
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "scripts/content/out")
PUB = os.path.join(ROOT, "apps/www/public/media/guides")
MANIFEST = os.path.join(ROOT, "apps/www/src/data/media-manifest.json")

FONT_LATIN = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_CJK = "/System/Library/Fonts/PingFang.ttc"


def font(size, cjk=False):
    path = FONT_CJK if (cjk and os.path.exists(FONT_CJK)) else FONT_LATIN
    if os.path.exists(path):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


EN_BODY = """The size of a local model on your PC is decided by one number: **VRAM plus system RAM**. Maya keeps the most-used parts of the model on the GPU, the rest in RAM, and reads whatever does not fit from a fast NVMe SSD while it answers.

Two sizes are worth separating. *Whole model* is the memory the setup counts to keep every part of the model resident in VRAM and RAM. *Recommended* adds room for the operating system and the default context. Below the recommended size the model still runs, just slower, because the missing part is read from the SSD.

## The sizing table

Sizes are in GB. "Whole model" is the memory needed to keep the entire model in memory; "Recommended" adds the system and the default context.

| Model | Quant | Whole model | Recommended (VRAM + RAM) | Runs on |
|---|---|---|---|---|
| GLM-5.3-Flash | Maya-XS | ~80 | 88 | NVIDIA, AMD, Mac* |
| GLM-5.3-Flash | Maya-S24 | ~102 | 128 | NVIDIA, AMD, Mac* |
| GLM-5.3-Flash | Maya-S (default) | ~104 | 128 | NVIDIA, AMD, Mac* |
| GLM-5.3-Flash | Maya-M | ~124 | 160 | NVIDIA, AMD, Mac* |
| GLM-5.3-Flash | Maya-L | ~164 | 192 | NVIDIA, AMD, Mac* |
| DeepSeek-V4.1-Flash | Maya-XS | 121 | 128 | NVIDIA, AMD |
| DeepSeek-V4.1-Flash | Maya-S (default) | 186 | 224 | NVIDIA, AMD |
| DeepSeek-V4.1-Flash | UD-IQ1_M | 140 | 160 | NVIDIA, AMD |
| MiniMax-M3.1-Flash | Maya-XS | 100 | 128 | NVIDIA, AMD |
| MiniMax-M3.1-Flash | Maya-S | 130 | 160 | NVIDIA, AMD |
| Qwen-3.8-Flash-Next | UD-IQ2_XS | 47 | 64 | NVIDIA, AMD |
| Qwen-3.8-Flash-Next | CYBER-FROST Q5_K_M | 84 | 96 | NVIDIA, AMD |

\\* Mac (Apple Silicon) support is experimental and limited to the GLM-5.3-Flash GGUF quants. DeepSeek and Qwen ship n-gram tables that stay on the SSD and never count toward memory, so their download size is larger than the row suggests.

## Matching a model to the machine you own

| Your PC | Total | Fits fully | Also runs, slower |
|---|---|---|---|
| 16 GB GPU + 48 GB RAM | 64 | Qwen UD-IQ2_XS | GLM Maya-XS, GLM Maya-S24 |
| 24 GB GPU + 64 GB RAM | 88 | GLM Maya-XS, Qwen UD-IQ2_XS | GLM Maya-S24, Qwen CYBER-FROST |
| 32 GB GPU + 96 GB RAM | 128 | GLM Maya-S, GLM Maya-S24, MiniMax Maya-XS | GLM Maya-M |
| 48 GB of GPUs + 128 GB RAM | 176 | GLM Maya-M, MiniMax Maya-S | GLM Maya-L, DeepSeek Maya-S |
| 64 GB of GPUs + 128 GB RAM | 192 | GLM Maya-L | DeepSeek Maya-S |
| 64 GB of GPUs + 192 GB RAM | 256+ | DeepSeek Maya-S, MiniMax EXL3 | DeepSeek UD-IQ3_S |
| Server with 384 GB RAM | 384+ | every model, DeepSeek UD-Q8_K_XL included | — |

On shared-memory machines such as a Strix Halo, a Gorgon Halo or a Mac, the memory is counted once and roughly 16 GB is left for the system. On a discrete card the split matters more: the same total is faster when more of it sits in VRAM rather than system RAM.

## The floor

Every model still runs below its recommended size, as long as the machine has a supported GPU, **32 GB of RAM**, and a fast NVMe SSD with room for the download. A hard disk is not a substitute.

What does not fit in VRAM plus RAM is read from the SSD while the model answers. That works, but the further below the recommended size, the slower it gets. The setup reports how much of the model it can keep in memory on your PC, so you can check the number before you commit to a multi-hundred-gigabyte download.

For the smaller end of the table, an RTX 4090 or an RX 7900 XTX paired with 64 GB of RAM is the classic one-big-model rig. A smaller card such as an RTX 4060 Ti is better paired with a Qwen UD-IQ2_XS build that fits fully in memory, instead of streaming from the disk forever."""

ZH_BODY = """模型在你电脑上有多大，只由一个数字决定：**显存加内存**。Maya 把最常用的部分放在显卡上，其余放进系统内存，放不下的部分在生成回答时从 NVMe 固态硬盘读取。

两个尺寸要分清楚。*整模*是让模型全部常驻显存加内存所需的容量；*推荐值*则额外为系统和默认上下文留出余量。低于推荐值模型照样能跑，只是更慢，因为缺的部分要从硬盘流式读取。

## 显存加内存对照表

单位为 GB。整模是模型全部放进内存所需容量，推荐值为系统与默认上下文留出余量。

| 模型 | 量化 | 整模 | 推荐值（显存 + 内存） | 可运行设备 |
|---|---|---|---|---|
| GLM-5.3-Flash | Maya-XS | 约 80 | 88 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-S24 | 约 102 | 128 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-S（默认） | 约 104 | 128 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-M | 约 124 | 160 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-L | 约 164 | 192 | NVIDIA、AMD、Mac* |
| DeepSeek-V4.1-Flash | Maya-XS | 121 | 128 | NVIDIA、AMD |
| DeepSeek-V4.1-Flash | Maya-S（默认） | 186 | 224 | NVIDIA、AMD |
| DeepSeek-V4.1-Flash | UD-IQ1_M | 140 | 160 | NVIDIA、AMD |
| MiniMax-M3.1-Flash | Maya-XS | 100 | 128 | NVIDIA、AMD |
| MiniMax-M3.1-Flash | Maya-S | 130 | 160 | NVIDIA、AMD |
| Qwen-3.8-Flash-Next | UD-IQ2_XS | 47 | 64 | NVIDIA、AMD |
| Qwen-3.8-Flash-Next | CYBER-FROST Q5_K_M | 84 | 96 | NVIDIA、AMD |

\\* Mac（Apple 芯片）支持仍属实验性，且只覆盖 GLM-5.3-Flash 的 GGUF 量化版本。DeepSeek 与 Qwen 附带的 n-gram 词表始终留在固态硬盘上，不计入内存，所以下载体积比表里看到的更大。

## 按自己那台机器对号入座

| 你的电脑 | 总内存 | 能完整装下 | 还能跑，但更慢 |
|---|---|---|---|
| 16 GB 显卡 + 48 GB 内存 | 64 | Qwen UD-IQ2_XS | GLM Maya-XS、GLM Maya-S24 |
| 24 GB 显卡 + 64 GB 内存 | 88 | GLM Maya-XS、Qwen UD-IQ2_XS | GLM Maya-S24、Qwen CYBER-FROST |
| 32 GB 显卡 + 96 GB 内存 | 128 | GLM Maya-S、GLM Maya-S24、MiniMax Maya-XS | GLM Maya-M |
| 48 GB 显卡 + 128 GB 内存 | 176 | GLM Maya-M、MiniMax Maya-S | GLM Maya-L、DeepSeek Maya-S |
| 64 GB 显卡 + 128 GB 内存 | 192 | GLM Maya-L | DeepSeek Maya-S |
| 64 GB 显卡 + 192 GB 内存 | 256 以上 | DeepSeek Maya-S、MiniMax EXL3 | DeepSeek UD-IQ3_S |
| 384 GB 内存的服务器 | 384 以上 | 全部模型，含 DeepSeek UD-Q8_K_XL | — |

共享内存的机器（Strix Halo、Gorgon Halo 或 Mac）只算一次总量，并给系统留出约 16 GB。独立显卡则更要看清分配：同样的总容量，放在显存里的部分越多，速度越快。

## 底线

只要机器有受支持的显卡、**32 GB 内存**，以及能放下下载体积的高速 NVMe 固态硬盘，低于推荐值模型也能运行。机械硬盘不行。

放不进显存加内存的部分会在生成时从硬盘读取。可以跑，但离推荐值越远越慢。安装程序会直接报出你这台电脑能常驻多少模型内存，所以在下几百 GB 的下载之前，先看清这个数字。

表格低端那一档，经典的「跑一个大模型」配置是 RTX 4090 或 RX 7900 XTX 配 64 GB 内存；像 RTX 4060 Ti 这样的小卡，更适合配能完整装进内存的 Qwen UD-IQ2_XS 版本，而不是让它一直从硬盘流式读取。"""

JA_BODY = """モデルが自分の PC で有多大になるかを決めるのは、**VRAM とシステム RAM の合計**ひとつです。Maya はよく使う部分を GPU に、残りを RAM に置き、収まらない部分は回答中に高速な NVMe SSD から読み出します。

二つの数値を分けて考えます。*モデル全体*はモデル全体を VRAM と RAM に常駐させるのに必要な容量、*推奨値*は OS と既定のコンテキスト分を加えた値です。推奨値を下回っても動くのは、足りない分が SSD からストリームされるからです。

## VRAM + RAM の早見表

単位は GB。「モデル全体」は全部をメモリに置くために必要な容量、「推奨値」はシステムと既定コンテキスト込みです。

| モデル | Quant | モデル全体 | 推奨値（VRAM + RAM） | 動作環境 |
|---|---|---|---|---|
| GLM-5.3-Flash | Maya-XS | 約 80 | 88 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-S24 | 約 102 | 128 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-S（既定） | 約 104 | 128 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-M | 約 124 | 160 | NVIDIA、AMD、Mac* |
| GLM-5.3-Flash | Maya-L | 約 164 | 192 | NVIDIA、AMD、Mac* |
| DeepSeek-V4.1-Flash | Maya-XS | 121 | 128 | NVIDIA、AMD |
| DeepSeek-V4.1-Flash | Maya-S（既定） | 186 | 224 | NVIDIA、AMD |
| DeepSeek-V4.1-Flash | UD-IQ1_M | 140 | 160 | NVIDIA、AMD |
| MiniMax-M3.1-Flash | Maya-XS | 100 | 128 | NVIDIA、AMD |
| MiniMax-M3.1-Flash | Maya-S | 130 | 160 | NVIDIA、AMD |
| Qwen-3.8-Flash-Next | UD-IQ2_XS | 47 | 64 | NVIDIA、AMD |
| Qwen-3.8-Flash-Next | CYBER-FROST Q5_K_M | 84 | 96 | NVIDIA、AMD |

\\* Mac（Apple Silicon）対応は実験的で、GLM-5.3-Flash の GGUF quant のみです。DeepSeek と Qwen に含まれる n-gram テーブルは SSD に残り続けてメモリには数えないため、ダウンロード容量は表の数値より大きくなります。

## 手元のマシンに合わせる

| 手元の PC | 合計 | 完全に収まる | 動くが遅いもの |
|---|---|---|---|
| 16 GB GPU + 48 GB RAM | 64 | Qwen UD-IQ2_XS | GLM Maya-XS、GLM Maya-S24 |
| 24 GB GPU + 64 GB RAM | 88 | GLM Maya-XS、Qwen UD-IQ2_XS | GLM Maya-S24、Qwen CYBER-FROST |
| 32 GB GPU + 96 GB RAM | 128 | GLM Maya-S、GLM Maya-S24、MiniMax Maya-XS | GLM Maya-M |
| 48 GB GPU + 128 GB RAM | 176 | GLM Maya-M、MiniMax Maya-S | GLM Maya-L、DeepSeek Maya-S |
| 64 GB GPU + 128 GB RAM | 192 | GLM Maya-L | DeepSeek Maya-S |
| 64 GB GPU + 192 GB RAM | 256 以上 | DeepSeek Maya-S、MiniMax EXL3 | DeepSeek UD-IQ3_S |
| 384 GB RAM のサーバー | 384 以上 | すべてのモデル（DeepSeek UD-Q8_K_XL を含む） | — |

Strix Halo、Gorgon Halo、Mac のような共有メモリのマシンでは合計を一度だけ数え、OS 用に約 16 GB を残します。独立显卡では配分がより重要です。同じ合計でも、VRAM 側の割合が多いほど速くなります。

## 底线

対応 GPU、**32 GB の RAM**、そしてダウンロードに十分な高速 NVMe SSD があれば、推奨値を下回ってもすべてのモデルが動きます。ハードディスクは代用になりません。

VRAM + RAM に入らない部分は回答中に SSD から読み込まれます。動作はしますが、推奨値から離れるほど遅くなります。セットアップがこの PC でどれだけのモデルをメモリに常駐できるかを表示してくれるため、数百 GB のダウンロードを決める前に数字を確認できます。

表の小さい側では、「大きめのモデルを 1 つ動かす」定番構成は RTX 4090 か RX 7900 XTX に 64 GB の RAM を足すものです。RTX 4060 Ti のような小型カードでは、SSD からストリームし続けるのではなく、メモリに収まる Qwen UD-IQ2_XS ビルドを選ぶのが合理的です。"""

CONTENT = {
    "en": {
        "slug": "maya-model-memory-sizing",
        "title": "Maya model sizing: how much VRAM plus RAM a local LLM needs",
        "description": "GLM-5.3-Flash, DeepSeek-V4.1-Flash, MiniMax-M3.1-Flash and Qwen-3.8-Flash-Next need very different memory totals. The VRAM plus RAM table, the recommended sizes, and the floor below them.",
        "body": EN_BODY,
        "faq": [
            {"q": "How do I know which local model fits my PC?", "a": "Add your GPU memory (VRAM) and your system RAM. That total is what counts: Maya keeps the most-used parts of the model on the GPU, the rest in RAM, and reads anything that does not fit from a fast NVMe SSD while it answers."},
            {"q": "What is the minimum hardware for running these models?", "a": "A supported GPU, 32 GB of RAM, and a fast NVMe SSD with room for the download. Below the recommended size the model still runs, but it gets slower the further below it you go."},
            {"q": "Does a Mac or a Strix Halo count differently?", "a": "Shared-memory machines count the memory once and keep about 16 GB for the system. On a discrete card the split matters: the same total is faster when more of it sits in VRAM instead of system RAM."},
            {"q": "Why is the download larger than the memory needed to run it?", "a": "DeepSeek and Qwen ship n-gram tables that stay on the SSD and never count toward memory, so their download size is larger than the row in the table suggests."},
        ],
        "hero": "Maya model sizing",
        "sub": "Recommended VRAM + RAM total (GB)",
        "head": ["Model", "Quant", "Recommended VRAM+RAM"],
        "rows": [
            ("Qwen-3.8-Flash-Next", "UD-IQ2_XS", "64"),
            ("GLM-5.3-Flash", "Maya-XS", "88"),
            ("MiniMax-M3.1-Flash", "Maya-XS", "128"),
            ("GLM-5.3-Flash", "Maya-M", "160"),
            ("DeepSeek-V4.1-Flash", "Maya-S", "224"),
        ],
    },
    "zh": {
        "slug": "maya-model-memory-sizing",
        "title": "Maya 模型选型：本地大模型到底需要多少显存加内存",
        "description": "GLM-5.3-Flash、DeepSeek-V4.1-Flash、MiniMax-M3.1-Flash、Qwen-3.8-Flash-Next 各要多少显存加内存。附对照表、推荐值与底线配置。",
        "body": ZH_BODY,
        "faq": [
            {"q": "怎么判断哪个本地模型装得下我的电脑？", "a": "把显存和系统内存加起来就是这个总数。Maya 把最常用的部分放在显卡上，其余放进内存，放不下的部分在回答时从高速 NVMe 固态硬盘读取。"},
            {"q": "运行这些模型的最低配置是什么？", "a": "一块受支持的显卡、32 GB 内存，以及能放下下载体积的高速 NVMe 固态硬盘。低于推荐值也能跑，但离推荐值越远越慢。"},
            {"q": "Mac 或 Strix Halo 这类共享内存的机器算得不一样吗？", "a": "共享内存只算一次总量，并给系统留出约 16 GB。独立显卡更看分配：同样的总量，显存占比越高越快。"},
            {"q": "为什么下载体积比运行所需内存还大？", "a": "DeepSeek 和 Qwen 附带的 n-gram 词表始终留在固态硬盘上，不计入内存，所以下载体积比表里看到的更大。"},
        ],
        "hero": "Maya 显存加内存选型",
        "sub": "推荐显存 + 内存总量（GB）",
        "head": ["模型", "量化", "推荐显存+内存"],
        "rows": [
            ("Qwen-3.8-Flash-Next", "UD-IQ2_XS", "64"),
            ("GLM-5.3-Flash", "Maya-XS", "88"),
            ("MiniMax-M3.1-Flash", "Maya-XS", "128"),
            ("GLM-5.3-Flash", "Maya-M", "160"),
            ("DeepSeek-V4.1-Flash", "Maya-S", "224"),
        ],
    },
    "ja": {
        "slug": "maya-model-memory-sizing",
        "title": "Maya のモデル選定：ローカル LLM に必要な VRAM と RAM の合計",
        "description": "GLM-5.3-Flash、DeepSeek-V4.1-Flash、MiniMax-M3.1-Flash、Qwen-3.8-Flash-Next に必要なメモリ合計の早見表、推奨値、そして下回っても動く底线。",
        "body": JA_BODY,
        "faq": [
            {"q": "どのローカルモデルが自分の PC に収まるかはどう判断しますか。", "a": "GPU の VRAM とシステム RAM を足したものが判断基準です。Maya はよく使う部分を GPU に、残りを RAM に置き、収まらない分は高速 NVMe SSD から読み出します。"},
            {"q": "これらのモデルを動かす最小構成は何ですか。", "a": "対応 GPU、32 GB の RAM、ダウンロードに十分な高速 NVMe SSD です。推奨値を下回っても動きますが、離れるほど遅くなります。"},
            {"q": "Mac や Strix Halo のような共有メモリは数え方が違いますか。", "a": "共有メモリでは合計を一度だけ数え、OS 用に約 16 GB を残します。独立显卡では配分が重要で、同じ合計でも VRAM の割合が多いほど速くなります。"},
            {"q": "なぜダウンロード容量が、実行に必要なメモリより大きいのですか。", "a": "DeepSeek と Qwen の n-gram テーブルは SSD に残り続けてメモリには数えないため、ダウンロード容量は表の数値より大きくなります。"},
        ],
        "hero": "Maya メモリ選定",
        "sub": "推奨 VRAM + RAM 合計（GB）",
        "head": ["モデル", "Quant", "推奨 VRAM+RAM"],
        "rows": [
            ("Qwen-3.8-Flash-Next", "UD-IQ2_XS", "64"),
            ("GLM-5.3-Flash", "Maya-XS", "88"),
            ("MiniMax-M3.1-Flash", "Maya-XS", "128"),
            ("GLM-5.3-Flash", "Maya-M", "160"),
            ("DeepSeek-V4.1-Flash", "Maya-S", "224"),
        ],
    },
}

KIND = "concept"
PUBLISH_AT = "2026-11-08"
IMAGE_PROMPT = (
    "An abstract editorial illustration featuring a dark navy background with teal geometric "
    "accents. The design is modern and clean, with no text or letters, formatted in a 16:9 "
    "aspect ratio."
)


def render_image(locale, spec):
    width, height = 1024, 576
    img = Image.new("RGB", (width, height), (11, 20, 38))
    draw = ImageDraw.Draw(img)
    cjk = locale in ("zh", "ja")
    f_title = font(40, cjk)
    f_head = font(22, cjk)
    f_row = font(24, cjk)
    f_small = font(18, cjk)
    teal = (45, 212, 191)
    white = (240, 244, 250)
    dim = (140, 158, 185)

    draw.rectangle([0, 0, width, 6], fill=teal)
    draw.text((48, 40), spec["hero"], font=f_title, fill=white)
    draw.text((48, 92), spec["sub"], font=f_small, fill=dim)

    x0, x1, x2 = 48, 470, 900
    y = 138
    for x, label in zip((x0, x1, x2), spec["head"]):
        draw.text((x, y), label, font=f_head, fill=teal)
    draw.line([x0, y + 32, width - 48, y + 32], fill=(40, 60, 92))
    y += 48
    for model, quant, total in spec["rows"]:
        draw.text((x0, y), model, font=f_row, fill=white)
        draw.text((x1, y), quant, font=f_row, fill=(180, 196, 216))
        draw.text((x2, y), total + " GB", font=f_row, fill=teal)
        y += 46
    draw.text((48, height - 50), "Project Maya - model sizing table", font=f_small, fill=dim)

    target_dir = os.path.join(PUB, locale)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, spec["slug"] + ".webp")
    img.save(path, "WEBP", quality=88)
    return path


def main():
    manifest = json.load(open(MANIFEST))
    for locale, spec in CONTENT.items():
        item = {
            "id": f"{locale}-{KIND}-{spec['slug']}",
            "locale": locale,
            "kind": KIND,
            "slug": spec["slug"],
            "path": f"/{locale}/guides/{spec['slug']}",
            "market": locale,
            "order": 200,
            "publishAt": PUBLISH_AT,
            "status": "live",
            "article": {
                "title": spec["title"],
                "description": spec["description"],
                "body": spec["body"],
                "faq": spec["faq"],
                "imagePrompt": IMAGE_PROMPT,
            },
            "generatedAt": "2026-11-08T00:00:00.000Z",
            "model": "manual-project-maya",
        }
        rel = f"/media/guides/{locale}/{spec['slug']}.webp"
        img_path = render_image(locale, spec)
        item["imagePath"] = rel
        item["publishedAt"] = PUBLISH_AT
        out_dir = os.path.join(OUT, locale)
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, spec["slug"] + ".json"), "w") as fh:
            json.dump(item, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print("wrote", locale, spec["slug"], os.path.getsize(img_path), "bytes")
    # The guide page looks the asset up as `guide-<slug>` without a locale, so one slug owns one
    # hero for every language. Drop whatever an earlier run left behind and register the English
    # file, with the alt text of each language attached to the same entry.
    slug = CONTENT["en"]["slug"]
    for key in [k for k in manifest["assets"] if k.startswith(f"guide-{slug}") or k.startswith("guide-maya-mem-sizing")]:
        del manifest["assets"][key]
    manifest["assets"][f"guide-{slug}"] = {
        "type": "image",
        "path": f"/media/guides/en/{slug}.webp",
        "page": f"/guides/{slug}",
        "slot": "hero",
        "locale": "en",
        "alt": {loc: spec["title"] for loc, spec in CONTENT.items()},
    }
    with open(MANIFEST, "w") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("manifest updated")


if __name__ == "__main__":
    main()
