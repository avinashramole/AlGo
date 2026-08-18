#!/usr/bin/env python3
"""Rasterize the Trade 2 Smart circular emblem into app icon variants."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ITALIC = "/usr/share/fonts/truetype/macos/Inter-BoldItalic.ttf"
BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
BLUE = (47, 123, 255, 255)
GREEN = (34, 197, 94, 255)
GREEN_DK = (22, 163, 74, 255)
INK = (17, 24, 39, 255)
DARK = (5, 7, 12, 255)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def load_italic(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(ITALIC, size)


def paint_gradient(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), DARK)
    px = img.load()
    last = size - 1 or 1
    for y in range(size):
        for x in range(size):
            t = (x * 0.55 + y * 0.45) / last
            px[x, y] = (*lerp(BLUE[:3], GREEN[:3], t), 255)
    return img


def draw_emblem(canvas: Image.Image, box: tuple[int, int, int, int], two_color=INK) -> None:
    x0, y0, x1, y1 = box
    w = max(1, x1 - x0)
    h = max(1, y1 - y0)
    scale = min(w / 280, h / 260)
    ox = x0 + (w - 280 * scale) / 2
    oy = y0 + (h - 260 * scale) / 2
    draw = ImageDraw.Draw(canvas)

    def P(x, y):
        return (ox + x * scale, oy + y * scale)

    def S(v):
        return max(1, int(v * scale))

    cx, cy, r = P(128, 142)[0], P(128, 142)[1], 96 * scale
    ring_w = max(3, S(7))
    steps = 72
    dash, gap = 520, 83
    circ = 2 * math.pi * r
    dash_frac = dash / (dash + gap)
    start = math.radians(-28 - (36 / (dash + gap)) * 360)
    for i in range(int(steps * dash_frac)):
        a0 = start + (i / steps) * 2 * math.pi
        a1 = start + ((i + 1) / steps) * 2 * math.pi
        t = i / max(1, steps * dash_frac)
        color = (*lerp(BLUE[:3], GREEN[:3], t), 255)
        draw.line(
            [(cx + r * math.cos(a0), cy + r * math.sin(a0)), (cx + r * math.cos(a1), cy + r * math.sin(a1))],
            fill=color,
            width=ring_w,
        )

    candles = [
        (86, 54, 12, 18, 46, 78),
        (99, 46, 14, 26, 38, 78),
        (121, 38, 14, 34, 32, 78),
        (143, 32, 14, 40, 28, 78),
    ]
    for bx, by, bw, bh, wy0, wy1 in candles:
        x, y = P(bx + bw / 2, wy0)
        x2, y2 = P(bx + bw / 2, wy1)
        draw.line([(x, y), (x2, y2)], fill=GREEN, width=max(2, S(2)))
        rx0, ry0 = P(bx, by)
        rx1, ry1 = P(bx + bw, by + bh)
        draw.rounded_rectangle([rx0, ry0, rx1, ry1], radius=max(1, S(1)), fill=GREEN, outline=GREEN_DK)

    for y, x1, x2, color in (
        (118, 22, 58, BLUE),
        (134, 16, 56, BLUE),
        (150, 26, 60, BLUE),
        (118, 198, 236, GREEN),
        (134, 196, 242, GREEN),
        (150, 200, 232, GREEN),
    ):
        draw.line([P(x1, y), P(x2, y)], fill=color, width=max(2, S(4)))

    t_font = load_italic(max(18, S(86)))
    two_font = load_italic(max(12, S(52)))
    draw.text(P(78, 168 - 86), "T", font=t_font, fill=BLUE)
    draw.text(P(128, 162 - 52), "2", font=two_font, fill=two_color)
    draw.text(P(158, 168 - 86), "S", font=t_font, fill=GREEN)

    draw.line([P(176, 108), P(226, 52)], fill=GREEN, width=max(4, S(12)))
    draw.polygon([P(214, 38), P(248, 34), P(230, 70)], fill=GREEN)


def square_icon(size: int, kind: str) -> Image.Image:
    if kind == "light":
        img = Image.new("RGBA", (size, size), WHITE)
    elif kind == "gradient":
        img = paint_gradient(size)
    else:
        img = Image.new("RGBA", (size, size), DARK)
    pad = int(size * 0.06)
    two = INK if kind == "light" else (232, 238, 245, 255)
    draw_emblem(img, (pad, pad, size - pad, size - pad), two_color=two)
    return img


def foreground(size: int, two_color=INK) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.08)
    draw_emblem(img, (pad, pad, size - pad, size - pad), two_color=two_color)
    return img


def monochrome(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.12)
    cx = cy = size / 2
    r = size * 0.34
    draw.arc([cx - r, cy - r, cx + r, cy + r], start=40, end=390, fill=WHITE, width=max(4, size // 28))
    font = ImageFont.truetype(ITALIC, size // 5)
    text = "T2S"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2 - size * 0.02), text, font=font, fill=WHITE)
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(path.relative_to(ROOT))


def main() -> None:
    dark = square_icon(1024, "dark")
    light = square_icon(1024, "light")
    gradient = square_icon(1024, "gradient")
    emblem = foreground(1024)
    save(dark, ROOT / "mobile/assets/icon.png")
    save(light, ROOT / "mobile/assets/icon-light.png")
    save(gradient, ROOT / "mobile/assets/icon-gradient.png")
    save(dark, ROOT / "mobile/assets/splash-icon.png")
    save(emblem, ROOT / "mobile/assets/t2s-emblem.png")
    save(foreground(1024, two_color=(232, 238, 245, 255)), ROOT / "mobile/assets/android-icon-foreground.png")
    save(Image.new("RGBA", (1024, 1024), DARK), ROOT / "mobile/assets/android-icon-background.png")
    save(monochrome(1024), ROOT / "mobile/assets/android-icon-monochrome.png")
    save(dark.resize((48, 48), Image.Resampling.LANCZOS), ROOT / "mobile/assets/favicon.png")
    save(light.resize((180, 180), Image.Resampling.LANCZOS), ROOT / "public/apple-touch-icon.png")


if __name__ == "__main__":
    main()
