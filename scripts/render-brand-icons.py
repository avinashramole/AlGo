#!/usr/bin/env python3
"""Rasterize the Trade 2 Smart circular emblem into app icon variants."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ITALIC = "/usr/share/fonts/truetype/macos/Inter-BoldItalic.ttf"
BLUE = (0, 123, 255, 255)
CYAN = (0, 180, 255, 255)
GREEN = (50, 205, 50, 255)
LIME = (173, 255, 47, 255)
SILVER = (232, 238, 245, 255)
DARK = (5, 7, 12, 255)
WHITE = (255, 255, 255, 255)


def lerp(a, b, t):
    t = max(0, min(1, t))
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


def draw_emblem(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    w = max(1, x1 - x0)
    h = max(1, y1 - y0)
    scale = min(w / 280, h / 250)
    ox = x0 + (w - 280 * scale) / 2
    oy = y0 + (h - 250 * scale) / 2
    draw = ImageDraw.Draw(canvas)

    def P(x, y):
        return (ox + x * scale, oy + y * scale)

    def S(v):
        return max(1, int(v * scale))

    cx, cy = P(130, 130)
    r = 100 * scale
    ring_w = max(4, S(14))
    bbox = [cx - r, cy - r, cx + r, cy + r]
    draw.arc(bbox, start=110, end=300, fill=BLUE, width=ring_w)
    draw.arc(bbox, start=200, end=300, fill=GREEN, width=ring_w)

    draw.line([P(176, 48), P(232, 10)], fill=LIME, width=ring_w)
    draw.polygon([P(214, 2), P(252, 6), P(228, 38)], fill=LIME)
    draw.polygon([P(218, 8), P(244, 12), P(228, 30)], fill=GREEN)

    candles = [
        (83, 54, 14, 20, 44, 80),
        (104, 46, 16, 28, 36, 80),
        (128, 36, 16, 38, 28, 80),
        (152, 30, 16, 44, 22, 80),
    ]
    for bx, by, bw, bh, wy0, wy1 in candles:
        draw.line([P(bx + bw / 2, wy0), P(bx + bw / 2, wy1)], fill=GREEN, width=max(2, S(2)))
        draw.rounded_rectangle([*P(bx, by), *P(bx + bw, by + bh)], radius=max(1, S(1)), fill=GREEN)

    t_font = load_italic(max(20, S(98)))
    two_font = load_italic(max(14, S(66)))
    draw.text(P(42, 172 - 98), "T", font=t_font, fill=(0, 58, 153, 80))
    draw.text(P(40, 168 - 98), "T", font=t_font, fill=CYAN)
    draw.text(P(124, 168 - 66), "2", font=two_font, fill=(100, 116, 139, 90))
    draw.text(P(122, 164 - 66), "2", font=two_font, fill=SILVER)
    draw.text(P(166, 172 - 98), "S", font=t_font, fill=(22, 101, 52, 80))
    draw.text(P(164, 168 - 98), "S", font=t_font, fill=LIME)


def square_icon(size: int, kind: str) -> Image.Image:
    if kind == "light":
        img = Image.new("RGBA", (size, size), WHITE)
    elif kind == "gradient":
        img = paint_gradient(size)
    else:
        img = Image.new("RGBA", (size, size), DARK)
    pad = int(size * 0.06)
    draw_emblem(img, (pad, pad, size - pad, size - pad))
    return img


def foreground(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.08)
    draw_emblem(img, (pad, pad, size - pad, size - pad))
    return img


def monochrome(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
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
    save(emblem, ROOT / "mobile/assets/android-icon-foreground.png")
    save(Image.new("RGBA", (1024, 1024), DARK), ROOT / "mobile/assets/android-icon-background.png")
    save(monochrome(1024), ROOT / "mobile/assets/android-icon-monochrome.png")
    save(dark.resize((48, 48), Image.Resampling.LANCZOS), ROOT / "mobile/assets/favicon.png")
    save(light.resize((180, 180), Image.Resampling.LANCZOS), ROOT / "public/apple-touch-icon.png")


if __name__ == "__main__":
    main()
