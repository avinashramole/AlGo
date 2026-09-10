#!/usr/bin/env python3
"""Keep public/mobile brand PNGs in sync with the official T2S lockup."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MOBILE = ROOT / "mobile" / "assets"
SOURCE = PUBLIC / "t2s-logo.png"
LIGHT = (255, 255, 255, 255)
CANVAS = (244, 247, 251, 255)  # login page --bg #f4f7fb


def load_source() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"Missing official lockup: {SOURCE}")
    return knock_white(Image.open(SOURCE).convert("RGBA"))


def knock_white(im: Image.Image, thresh: int = 12) -> Image.Image:
    """Flood-fill near-white canvas connected to the border so the lockup sits on the page."""
    im = im.copy()
    pix = im.load()
    w, h = im.size

    def is_plate(x: int, y: int) -> bool:
        r, g, b, a = pix[x, y]
        if a == 0:
            return False
        return max(255 - r, 255 - g, 255 - b) <= thresh

    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if seen[i] or not is_plate(x, y):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        pix[x, y] = (255, 255, 255, 0)
        if x:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)
    return im


def fit(src: Image.Image, size: int, background: tuple[int, int, int, int] | None = None) -> Image.Image:
    fitted = src.copy()
    fitted.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    if background and background[3] == 255:
        return canvas.convert("RGB")
    return canvas


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(path.relative_to(ROOT))


def main() -> None:
    src = load_source()
    logo = fit(src, 800)
    save(logo, PUBLIC / "t2s-logo.png")
    save(logo, MOBILE / "t2s-logo.png")
    save(fit(src, 32, LIGHT), PUBLIC / "favicon.png")
    save(fit(src, 180, LIGHT), PUBLIC / "apple-touch-icon.png")
    icon = fit(src, 1024, LIGHT)
    save(icon, MOBILE / "icon.png")
    save(icon, MOBILE / "icon-light.png")
    save(icon, MOBILE / "splash-icon.png")
    save(fit(src, 1024, CANVAS), MOBILE / "android-icon-foreground.png")
    save(fit(src, 48, LIGHT), MOBILE / "favicon.png")
    save(Image.new("RGB", (1024, 1024), (244, 247, 251)), MOBILE / "android-icon-background.png")
    mono = fit(src, 1024, LIGHT).convert("L").convert("RGB")
    save(mono, MOBILE / "android-icon-monochrome.png")

    stale = [
        PUBLIC / "t2s-emblem.svg",
        PUBLIC / "favicon.svg",
        PUBLIC / "brand-avatar.svg",
        PUBLIC / "t2s-emblem.png",
        PUBLIC / "t2s-lockup.png",
        MOBILE / "t2s-emblem.png",
        MOBILE / "t2s-lockup.png",
        MOBILE / "icon-gradient.png",
    ]
    for path in stale:
        if path.exists():
            path.unlink()
            print(f"removed {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
