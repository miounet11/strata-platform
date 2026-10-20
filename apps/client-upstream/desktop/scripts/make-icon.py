"""Generate the stratat app icon: a stacked-strata mark on a deep indigo field.

Draws at 1024px with supersampling, then emits every size Tauri needs:
PNG set, Windows .ico, macOS .icns.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
SS = 4  # supersample factor
BASE = 1024


def rgba(hex_color: str) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def rounded_mask(size: int, radius_ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255
    )
    return mask


def draw_mark(size: int) -> Image.Image:
    """Three rising strata over a horizon: the product is layers of hardware + model."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background: deep indigo with a warm accent glow toward the top-right.
    top = rgba("#1B1F3B")
    bottom = rgba("#0B0D1A")
    for y in range(size):
        t = y / max(size - 1, 1)
        d.line(
            [(0, y), (size, y)],
            fill=(
                round(top[0] + (bottom[0] - top[0]) * t),
                round(top[1] + (bottom[1] - top[1]) * t),
                round(top[2] + (bottom[2] - top[2]) * t),
                255,
            ),
        )

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = size * 0.74, size * 0.24, size * 0.46
    gd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgba("#6E5BFF")[:3] + (70,))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(size * 0.10))
    img = Image.alpha_composite(img, glow)

    d = ImageDraw.Draw(img)
    strokes = [rgba("#F5F6FF"), rgba("#B9BDFF"), rgba("#8E7DFF")]
    widths = [0.085, 0.075, 0.065]
    ys = [0.385, 0.545, 0.705]
    insets = [0.255, 0.195, 0.135]

    for y, inset, w, color in zip(ys, insets, widths, strokes):
        x0, x1 = size * inset, size * (1 - inset)
        thick = size * w
        d.rounded_rectangle(
            (x0, size * y, x1, size * y + thick), radius=thick / 2, fill=color
        )

    # Accent rule under the stack ties the mark to the brand violet.
    d.rounded_rectangle(
        (size * 0.135, size * 0.845, size * 0.865, size * 0.885),
        radius=size * 0.02,
        fill=rgba("#6E5BFF"),
    )
    return img


def main() -> None:
    size = BASE * SS
    img = draw_mark(size)

    # Apply the macOS-style squircle only to the final small sizes so the mark itself
    # stays centred; the mask is generated at full resolution for clean edges.
    mask = rounded_mask(size)
    flat = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    flat.paste(img, (0, 0), mask)
    master = flat.resize((BASE, BASE), Image.LANCZOS)

    icons = OUT
    icons.mkdir(parents=True, exist_ok=True)

    # Source PNG Tauri reads for Linux and as the generic icon.
    master.save(icons / "icon.png", "PNG")

    png_sizes = {
        "32x32.png": 32,
        "64x64.png": 64,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon-512.png": 512,
    }
    for name, px in png_sizes.items():
        master.resize((px, px), Image.LANCZOS).save(icons / name, "PNG")

    for name, px in {
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }.items():
        master.resize((px, px), Image.LANCZOS).save(icons / name, "PNG")

    master.save(
        icons / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    # .icns via iconutil so macOS gets a real iconset rather than a renamed png.
    if shutil.which("iconutil"):
        with tempfile.TemporaryDirectory() as tmp:
            iconset = Path(tmp) / "icon.iconset"
            iconset.mkdir()
            for px in (16, 32, 64, 128, 256, 512):
                master.resize((px, px), Image.LANCZOS).save(iconset / f"icon_{px}x{px}.png")
                master.resize((px * 2, px * 2), Image.LANCZOS).save(
                    iconset / f"icon_{px}x{px}@2x.png"
                )
            subprocess.run(
                ["iconutil", "-c", "icns", str(iconset), "-o", str(icons / "icon.icns")],
                check=True,
            )
    else:
        print("iconutil missing: skipped icon.icns")

    print("wrote", sorted(p.name for p in icons.glob("*.png")))


BG_TOP = rgba("#1B1F3B")[:3]
BG_BOTTOM = rgba("#0B0D1A")[:3]
ACCENT = rgba("#6E5BFF")[:3]
TEXT = (245, 246, 255)
STROKES = [rgba("#F5F6FF")[:3], rgba("#B9BDFF")[:3], rgba("#8E7DFF")[:3]]


def nsis_font(px: int):
    """A system sans that exists on macOS and Linux CI runners; falls back to bitmap."""
    from PIL import ImageFont

    for candidate in (
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, px)
        except OSError:
            continue
    return ImageFont.load_default()


def nsis_art() -> None:
    """Installer art in the sizes tauri.conf.json expects: header 150x57, sidebar 164x314."""
    out = OUT.parent / "nsis"
    out.mkdir(parents=True, exist_ok=True)

    # Header: brand mark on the left, "stratat" wordmark beside it.
    header = Image.new("RGB", (150, 57), BG_BOTTOM)
    hd = ImageDraw.Draw(header)
    hd.rectangle((0, 0, 149, 2), fill=ACCENT)
    mark = draw_mark(38)
    header.paste(mark, (8, 10), mark)
    hd.text((52, 14), "stratat", font=nsis_font(19), fill=TEXT)
    hd.text((53, 37), "local AI", font=nsis_font(10), fill=(150, 156, 186))
    header.save(out / "header.bmp")

    # Sidebar: vertical gradient, stacked strata, wordmark at the bottom.
    sidebar = Image.new("RGB", (164, 314), BG_BOTTOM)
    sd = ImageDraw.Draw(sidebar)
    for y in range(314):
        t = y / 313
        sd.line(
            ((0, y), (163, y)),
            fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)),
        )
    for i, width in enumerate((96, 116, 136)):
        sd.rounded_rectangle((16, 120 + i * 26, 16 + width, 134 + i * 26), radius=7, fill=STROKES[i])
    sd.rounded_rectangle((16, 218, 148, 221), radius=1, fill=ACCENT)
    sd.text((16, 246), "stratat", font=nsis_font(24), fill=TEXT)
    sd.text((16, 280), "local AI", font=nsis_font(11), fill=(150, 156, 186))
    sidebar.save(out / "sidebar.bmp")
    print("wrote nsis/header.bmp + nsis/sidebar.bmp")


if __name__ == "__main__":
    main()
    nsis_art()
