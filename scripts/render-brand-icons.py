#!/usr/bin/env python3
"""Rasterize Trade 2 Smart emblem into app icon variants from the brand sheet."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
BLUE = (47, 123, 255, 255)
LIME = (182, 255, 60, 255)
SILVER = (232, 238, 245, 255)
DARK = (5, 7, 12, 255)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def paint_gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), DARK)
    px = img.load()
    last = size - 1 or 1
    for y in range(size):
        for x in range(size):
            t = (x * 0.55 + y * 0.45) / last
            px[x, y] = (*lerp(BLUE[:3], LIME[:3], t), 255)
    return img


def draw_emblem(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    w = x1 - x0
    scale = w / 240
    cx, cy = x0 + w / 2, y0 + w / 2
    draw = ImageDraw.Draw(canvas)
    r = 104 * scale
    stroke = max(3, int(8 * scale))

    steps = 96
    start = math.radians(-18)
    span = 560 / (560 + 92) * 2 * math.pi
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        a0 = start + span * t0
        a1 = start + span * t1
        color = lerp(BLUE[:3], LIME[:3], t0)
        draw.arc(
            [cx - r, cy - r, cx + r, cy + r],
            math.degrees(a0),
            math.degrees(a1),
            fill=(*color, 255),
            width=stroke,
        )

    arrow = [
        (x0 + 188 * scale, y0 + 36 * scale),
        (x0 + 214 * scale, y0 + 28 * scale),
        (x0 + 196 * scale, y0 + 58 * scale),
    ]
    draw.polygon(arrow, fill=LIME)

    candles = [(96, 52, 10, 28), (115, 42, 10, 38), (134, 32, 10, 48)]
    wicks = [(94, 58, 14, 3.5), (94, 72, 14, 3.5), (113, 48, 14, 3.5), (113, 72, 14, 3.5), (132, 38, 14, 3.5), (132, 72, 14, 3.5)]
    for x, y, cw, ch in candles:
        draw.rounded_rectangle(
            [x0 + x * scale, y0 + y * scale, x0 + (x + cw) * scale, y0 + (y + ch) * scale],
            radius=max(1, int(1.5 * scale)),
            fill=LIME,
        )
    for x, y, cw, ch in wicks:
        draw.rounded_rectangle(
            [x0 + x * scale, y0 + y * scale, x0 + (x + cw) * scale, y0 + (y + ch) * scale],
            radius=max(1, int(scale)),
            fill=LIME,
        )

    font = load_font(max(12, int(64 * scale)))
    letters = [("T", BLUE), ("2", SILVER), ("S", LIME)]
    total = sum(draw.textlength(ch, font=font) for ch, _ in letters) - 4 * scale
    cursor = cx - total / 2
    ty = y0 + 158 * scale - font.size * 0.82
    for ch, color in letters:
        draw.text((cursor, ty), ch, font=font, fill=color)
        cursor += draw.textlength(ch, font=font) - 2 * scale


def square_icon(size: int, kind: str) -> Image.Image:
    if kind == "light":
        img = Image.new("RGBA", (size, size), WHITE)
    elif kind == "gradient":
        img = paint_gradient(size)
    else:
        img = Image.new("RGBA", (size, size), DARK)
    pad = int(size * 0.12)
    draw_emblem(img, (pad, pad, size - pad, size - pad))
    return img


def foreground(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.18)
    draw_emblem(img, (pad, pad, size - pad, size - pad))
    return img


def monochrome(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.18)
    box = [pad, pad, size - pad, size - pad]
    draw.ellipse(box, outline=WHITE, width=max(4, size // 32))
    font = load_font(size // 5)
    text = "T2S"
    tw = draw.textlength(text, font=font)
    draw.text(((size - tw) / 2, size * 0.42), text, font=font, fill=WHITE)
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(path.relative_to(ROOT))


def main() -> None:
    dark = square_icon(1024, "dark")
    light = square_icon(1024, "light")
    gradient = square_icon(1024, "gradient")
    save(dark, ROOT / "mobile/assets/icon.png")
    save(light, ROOT / "mobile/assets/icon-light.png")
    save(gradient, ROOT / "mobile/assets/icon-gradient.png")
    save(dark, ROOT / "mobile/assets/splash-icon.png")
    save(foreground(1024), ROOT / "mobile/assets/android-icon-foreground.png")
    save(Image.new("RGBA", (1024, 1024), DARK), ROOT / "mobile/assets/android-icon-background.png")
    save(monochrome(1024), ROOT / "mobile/assets/android-icon-monochrome.png")
    save(dark.resize((48, 48), Image.Resampling.LANCZOS), ROOT / "mobile/assets/favicon.png")
    save(dark.resize((180, 180), Image.Resampling.LANCZOS), ROOT / "public/apple-touch-icon.png")


if __name__ == "__main__":
    main()
