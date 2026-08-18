#!/usr/bin/env python3
"""Knock black plates out of the 3D Trade 2 Smart PNGs and build light app icons."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIGHT = (244, 246, 250, 255)
LOCKUP = ROOT / "public/t2s-lockup.png"
EMBLEM = ROOT / "public/t2s-emblem.png"


def is_plate(pixel: tuple[int, int, int, int], thresh: int = 24) -> bool:
    r, g, b, a = pixel
    if a == 0:
        return True
    return max(r, g, b) <= thresh


def knock_black_plate(img: Image.Image, thresh: int = 24) -> Image.Image:
    """Flood-fill near-black from the edges so letter shadows stay intact."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_plate(px[x, y], thresh):
            continue
        if px[x, y][3] != 0:
            px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(path.relative_to(ROOT))


def on_light(src: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), LIGHT)
    fitted = src.copy()
    fitted.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas


def main() -> None:
    lockup = knock_black_plate(Image.open(LOCKUP))
    emblem = knock_black_plate(Image.open(EMBLEM))
    save(lockup, LOCKUP)
    save(emblem, EMBLEM)
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
