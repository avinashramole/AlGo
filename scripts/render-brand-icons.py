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
APP_ICON = MOBILE / "app-icon-source.png"
OUTPUT = PUBLIC / "t2s-logo.png"
LIGHT = (255, 255, 255, 255)
CREAM = (255, 248, 241, 255)
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
APPLE_SPLASH = (
    (1290, 2796),
    (1179, 2556),
    (1170, 2532),
    (1284, 2778),
    (2048, 2732),
)


def load_source() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"Missing official lockup: {SOURCE}")
    return Image.open(SOURCE).convert("RGBA")


def knock_white(im: Image.Image, thresh: int = 18) -> Image.Image:
    """Flood-fill the near-white canvas connected to the border, then fade the fringe."""
    im = im.copy()
    pix = im.load()
    w, h = im.size

    def plate(x: int, y: int) -> bool:
        r, g, b, a = pix[x, y]
        if a == 0:
            return False
        return max(255 - r, 255 - g, 255 - b) <= thresh

    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if seen[i] or not plate(x, y):
            return
        seen[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    cleared: list[tuple[int, int]] = []
    while q:
        x, y = q.popleft()
        pix[x, y] = (255, 255, 255, 0)
        cleared.append((x, y))
        if x:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)

    # Fade anti-aliased white halo around the punched-out plate.
    ring: set[tuple[int, int]] = set()
    for x, y in cleared:
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and pix[nx, ny][3] > 0:
                ring.add((nx, ny))
    for x, y in ring:
        r, g, b, a = pix[x, y]
        white = min(r, g, b)
        if white < 210:
            continue
        fade = (255 - white) / 45
        pix[x, y] = (r, g, b, max(0, min(a, int(a * fade))))
    return im


def fit(
    src: Image.Image,
    size: int,
    background: tuple[int, int, int, int] | None = None,
    pad: float = 0.0,
) -> Image.Image:
    inner = max(1, int(size * (1 - pad * 2)))
    fitted = src.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
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


def load_app_icon() -> Image.Image:
    if APP_ICON.exists():
        return Image.open(APP_ICON).convert("RGBA")
    return knock_white(load_source())


def cream_splash(app: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), CREAM)
    box = max(64, int(min(width, height) * 0.38))
    mark = fit(app, box)
    canvas.alpha_composite(mark, ((width - mark.width) // 2, (height - mark.height) // 2))
    return canvas.convert("RGB")


def write_ios_and_pwa(app: Image.Image) -> None:
    save(fit(app, 192, LIGHT), PUBLIC / "pwa-192.png")
    save(fit(app, 512, LIGHT), PUBLIC / "pwa-512.png")
    for width, height in APPLE_SPLASH:
        save(cream_splash(app, width, height), PUBLIC / f"apple-splash-{width}x{height}.png")
    iconset = IOS_ASSETS / "AppIcon.appiconset"
    if iconset.is_dir():
        save(fit(app, 1024, LIGHT), iconset / "AppIcon-512@2x.png")
    splash_dir = IOS_ASSETS / "Splash.imageset"
    if splash_dir.is_dir():
        save(cream_splash(app, 2732, 2732), splash_dir / "splash-2732x2732.png")


def main() -> None:
    src = knock_white(load_source())
    logo = fit(src, 800)
    save(logo, OUTPUT)
    save(logo, MOBILE / "t2s-logo.png")
    save(fit(src, 32, LIGHT), PUBLIC / "favicon.png")
    app = load_app_icon()
    save(fit(app, 180, LIGHT), PUBLIC / "apple-touch-icon.png")
    icon = fit(app, 1024, LIGHT)
    save(icon, MOBILE / "icon.png")
    save(icon, MOBILE / "icon-light.png")
    save(fit(app, 512, LIGHT), MOBILE / "splash-icon.png")
    save(fit(app, 1024, LIGHT, pad=0.18), MOBILE / "android-icon-foreground.png")
    save(fit(app, 48, LIGHT), MOBILE / "favicon.png")
    save(Image.new("RGB", (1024, 1024), (255, 255, 255)), MOBILE / "android-icon-background.png")
    mono = fit(app, 1024, LIGHT).convert("L").convert("RGB")
    save(mono, MOBILE / "android-icon-monochrome.png")
    write_ios_and_pwa(app)


if __name__ == "__main__":
    main()
