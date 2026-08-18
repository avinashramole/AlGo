#!/usr/bin/env python3
"""Paint a flat, print-style Trade 2 Smart lockup (no 3D lighting)."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ITALIC = "/usr/share/fonts/truetype/macos/Inter-BoldItalic.ttf"
BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
LIGHT = (244, 246, 250, 255)
BLUE = (47, 123, 255, 255)
GREEN = (34, 197, 94, 255)
SILVER = (107, 114, 128, 255)
INK = (51, 65, 85, 255)
CLEAR = (0, 0, 0, 0)

CX, CY, R = 140, 138, 96
BLUE_ARC = (110, 270)
GREEN_ARC = (270, 325)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def polar(deg: float, radius: float = R) -> tuple[float, float]:
    rad = math.radians(deg)
    return CX + radius * math.cos(rad), CY + radius * math.sin(rad)


def draw_emblem(draw: ImageDraw.ImageDraw, scale: float, ox: float, oy: float) -> None:
    def P(x: float, y: float) -> tuple[float, float]:
        return (ox + x * scale, oy + y * scale)

    def S(v: float) -> int:
        return max(1, round(v * scale))

    ring = S(12)
    bbox = [P(CX - R, CY - R), P(CX + R, CY + R)]
    box = [bbox[0][0], bbox[0][1], bbox[1][0], bbox[1][1]]
    draw.arc(box, start=BLUE_ARC[0], end=BLUE_ARC[1], fill=BLUE, width=ring)
    draw.arc(box, start=GREEN_ARC[0], end=GREEN_ARC[1], fill=GREEN, width=ring)

    a1 = polar(325)
    a2 = polar(325, R + 48)
    draw.line([P(*a1), P(*a2)], fill=GREEN, width=ring)
    ang = math.radians(325)
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx
    tip = a2
    left = (tip[0] - 26 * dx + 13 * px, tip[1] - 26 * dy + 13 * py)
    right = (tip[0] - 26 * dx - 13 * px, tip[1] - 26 * dy - 13 * py)
    draw.polygon([P(*tip), P(*left), P(*right)], fill=GREEN)

    candles = [(92, 58, 12, 20), (113, 48, 13, 30), (135, 38, 13, 40), (157, 30, 13, 48)]
    for x, y, w, h in candles:
        draw.rectangle([P(x, y), P(x + w, y + h)], fill=GREEN)
        mid = x + w / 2
        draw.line([P(mid, y - 6), P(mid, y + h + 6)], fill=GREEN, width=max(1, S(1.6)))

    t = font(ITALIC, max(18, S(92)))
    two = font(ITALIC, max(14, S(62)))
    draw.text(P(62, 176), "T", font=t, fill=BLUE, anchor="ls")
    draw.text(P(132, 168), "2", font=two, fill=SILVER, anchor="ls")
    draw.text(P(174, 176), "S", font=t, fill=GREEN, anchor="ls")


def paint_emblem(size: int, pad: float = 0.08) -> Image.Image:
    img = Image.new("RGBA", (size, size), CLEAR)
    draw = ImageDraw.Draw(img)
    inner = size * (1 - 2 * pad)
    scale = inner / 250
    ox = (size - 280 * scale) / 2
    oy = size * pad
    draw_emblem(draw, scale, ox, oy)
    return img


def paint_lockup(width: int = 1024) -> Image.Image:
    height = int(width * 1.18)
    img = Image.new("RGBA", (width, height), CLEAR)
    draw = ImageDraw.Draw(img)
    emblem_h = int(width * 0.62)
    emblem = paint_emblem(emblem_h, pad=0.04)
    img.alpha_composite(emblem, ((width - emblem_h) // 2, int(height * 0.02)))

    name = font(ITALIC, int(width * 0.072))
    tag = font(BOLD, int(width * 0.028))
    y = int(height * 0.72)
    parts = [("TRADE ", SILVER), ("2 ", BLUE), ("SMART", GREEN)]
    total = sum(draw.textlength(text, font=name) for text, _ in parts)
    x = (width - total) / 2
    for text, color in parts:
        draw.text((x, y), text, font=name, fill=color)
        x += draw.textlength(text, font=name)

    line = "INTELLIGENCE BEHIND EVERY TRADE."
    mark = font(BOLD, int(width * 0.036))
    gap = int(width * 0.018)
    tw = draw.textlength(line, font=tag)
    mw = draw.textlength("//", font=mark)
    total = mw + gap + tw + gap + mw
    x = (width - total) / 2
    y = int(height * 0.86)
    draw.text((x, y), "//", font=mark, fill=BLUE)
    x += mw + gap
    draw.text((x, y + int(width * 0.006)), line, font=tag, fill=INK)
    x += tw + gap
    draw.text((x, y), "//", font=mark, fill=GREEN)
    return img


def on_light(src: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), LIGHT)
    fitted = src.copy()
    fitted.thumbnail((int(size * 0.88), int(size * 0.88)), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(path.relative_to(ROOT))


def write_svgs() -> None:
    emblem = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 250">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M107.2 228.2 A 96 96 0 0 1 140 42" stroke="#2F7BFF" stroke-width="12"/>
    <path d="M140 42 A 96 96 0 0 1 218.6 82.9" stroke="#22C55E" stroke-width="12"/>
  </g>
  <path d="M218.6 82.9 L258 55" fill="none" stroke="#22C55E" stroke-width="12" stroke-linecap="round"/>
  <polygon points="258,55 232,62 240,84" fill="#22C55E"/>
  <g fill="#22C55E">
    <rect x="92" y="58" width="12" height="20"/>
    <rect x="113" y="48" width="13" height="30"/>
    <rect x="135" y="38" width="13" height="40"/>
    <rect x="157" y="30" width="13" height="48"/>
    <rect x="97.5" y="52" width="1.6" height="32"/>
    <rect x="119" y="42" width="1.6" height="42"/>
    <rect x="141" y="32" width="1.6" height="52"/>
    <rect x="163" y="24" width="1.6" height="60"/>
  </g>
  <g font-family="Inter, Arial Black, sans-serif" font-style="italic" font-weight="800">
    <text x="62" y="176" font-size="92" fill="#2F7BFF">T</text>
    <text x="132" y="168" font-size="62" fill="#6B7280">2</text>
    <text x="174" y="176" font-size="92" fill="#22C55E">S</text>
  </g>
</svg>
"""
    (ROOT / "public/t2s-emblem.svg").write_text(emblem)
    (ROOT / "public/favicon.svg").write_text(emblem)
    (ROOT / "public/brand-avatar.svg").write_text(emblem)
    print("public/t2s-emblem.svg")


def main() -> None:
    write_svgs()
    emblem = paint_emblem(1024)
    lockup = paint_lockup(1024)
    save(lockup, ROOT / "public/t2s-lockup.png")
    save(emblem, ROOT / "public/t2s-emblem.png")
    save(lockup, ROOT / "mobile/assets/t2s-lockup.png")
    save(emblem, ROOT / "mobile/assets/t2s-emblem.png")
    icon = on_light(emblem, 1024)
    save(icon, ROOT / "mobile/assets/icon.png")
    save(icon, ROOT / "mobile/assets/icon-light.png")
    save(icon, ROOT / "mobile/assets/splash-icon.png")
    save(on_light(emblem, 180), ROOT / "public/apple-touch-icon.png")
    save(on_light(emblem, 48), ROOT / "mobile/assets/favicon.png")
    save(emblem, ROOT / "mobile/assets/android-icon-foreground.png")
    save(Image.new("RGBA", (1024, 1024), LIGHT), ROOT / "mobile/assets/android-icon-background.png")


if __name__ == "__main__":
    main()
