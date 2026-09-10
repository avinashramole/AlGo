#!/usr/bin/env python3
"""Keep public/mobile brand PNGs in sync with the official T2S lockup."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MOBILE = ROOT / "mobile" / "assets"
SOURCE = PUBLIC / "t2s-logo.png"
LIGHT = (255, 255, 255, 255)


def load_source() -> Image.Image:
    if not SOURCE.exists():
        raise SystemExit(f"Missing official lockup: {SOURCE}")
    return Image.open(SOURCE).convert("RGBA")


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
    if img.mode == "RGB":
        img.save(path, "PNG", optimize=True)
    else:
        img.save(path, "PNG", optimize=True)
    print(path.relative_to(ROOT))


def main() -> None:
    src = load_source()
    logo = fit(src, 800, LIGHT)
    save(logo, PUBLIC / "t2s-logo.png")
    save(logo, MOBILE / "t2s-logo.png")
    save(fit(src, 32, LIGHT), PUBLIC / "favicon.png")
    save(fit(src, 180, LIGHT), PUBLIC / "apple-touch-icon.png")
    icon = fit(src, 1024, LIGHT)
    save(icon, MOBILE / "icon.png")
    save(icon, MOBILE / "icon-light.png")
    save(icon, MOBILE / "splash-icon.png")
    save(icon, MOBILE / "android-icon-foreground.png")
    save(fit(src, 48, LIGHT), MOBILE / "favicon.png")
    save(Image.new("RGB", (1024, 1024), (255, 255, 255)), MOBILE / "android-icon-background.png")
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
