#!/usr/bin/env python3
"""Rasterize the Trade 2 Smart emblem into app icon variants."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
BLUE = (47, 123, 255, 255)
LIME = (182, 255, 60, 255)
SILVER = (232, 238, 245, 255)
DARK = (5, 7, 12, 255)
PLATE = (8, 11, 18, 255)
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


def draw_emblem(canvas: Image.Image, box: tuple[int, int, int, int], plate: bool = True) -> None:
    x0, y0, x1, y1 = box
    w = max(1, x1 - x0)
    scale = w / 240
    draw = ImageDraw.Draw(canvas)
    radius = max(8, int(56 * scale))
    stroke = max(2, int(7 * scale))
    inset = stroke // 2
    if plate:
        draw.rounded_rectangle(
            [x0 + inset, y0 + inset, x1 - inset, y1 - inset],
            radius=radius,
            fill=PLATE,
            outline=BLUE,
            width=stroke,
        )
        lime_w = max(2, stroke)
        draw.line([(x1 - radius, y0 + stroke), (x1 - stroke, y0 + radius)], fill=LIME, width=lime_w)

    font = load_font(max(12, int(70 * scale)))
    letters = [("T", BLUE), ("2", SILVER), ("S", LIME)]
    total = sum(draw.textlength(ch, font=font) for ch, _ in letters) - 6 * scale
    cursor = x0 + w / 2 - total / 2
    ty = y0 + 122 * scale - font.size * 0.78
    for ch, color in letters:
        draw.text((cursor, ty), ch, font=font, fill=color)
        cursor += draw.textlength(ch, font=font) - 3 * scale

    step = max(3, int(8 * scale))
    points = [
        (x0 + 58 * scale, y0 + 174 * scale),
        (x0 + 104 * scale, y0 + 174 * scale),
        (x0 + 104 * scale, y0 + 152 * scale),
        (x0 + 150 * scale, y0 + 152 * scale),
        (x0 + 150 * scale, y0 + 130 * scale),
        (x0 + 186 * scale, y0 + 130 * scale),
    ]
    draw.line(points, fill=LIME, width=step, joint="miter")
    r = max(3, int(7 * scale))
    cx, cy = points[-1]
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLUE)


def square_icon(size: int, kind: str) -> Image.Image:
    if kind == "light":
        img = Image.new("RGBA", (size, size), WHITE)
    elif kind == "gradient":
        img = paint_gradient(size)
    else:
        img = Image.new("RGBA", (size, size), DARK)
    pad = int(size * 0.08)
    draw_emblem(img, (pad, pad, size - pad, size - pad), plate=kind != "gradient")
    return img


def foreground(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = int(size * 0.12)
    draw_emblem(img, (pad, pad, size - pad, size - pad))
    return img


def monochrome(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.12)
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size // 6, outline=WHITE, width=max(4, size // 36))
    font = load_font(size // 5)
    text = "T2S"
    tw = draw.textlength(text, font=font)
    draw.text(((size - tw) / 2, size * 0.36), text, font=font, fill=WHITE)
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
