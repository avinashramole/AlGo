#!/usr/bin/env python3
"""Paint the Trade 2 Smart logo onto Android launcher and splash images."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "public" / "t2s-logo.png"
NAVY = (7, 24, 51, 255)
WHITE = (255, 255, 255, 255)

LAUNCHERS = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

SPLASH = {
    "drawable/splash.png": (480, 800),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
}


def fit(image: Image.Image, box: int, pad: float = 0.12) -> Image.Image:
    inner = max(8, int(box * (1 - pad * 2)))
    copy = image.copy()
    copy.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.paste(copy, ((box - copy.width) // 2, (box - copy.height) // 2), copy)
    return canvas


def opaque(image: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", image.size, color)
    canvas.alpha_composite(image)
    return canvas.convert("RGBA")


def write_launchers(logo: Image.Image) -> None:
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    for density, size in LAUNCHERS.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        icon = opaque(fit(logo, size, 0.08), WHITE)
        icon.save(folder / "ic_launcher.png")
        icon.save(folder / "ic_launcher_round.png")
        foreground = fit(logo, size * 2, 0.18)
        foreground.save(folder / "ic_launcher_foreground.png")


def write_splashes(logo: Image.Image) -> None:
    res = ROOT / "android" / "app" / "src" / "main" / "res"
    for rel, (width, height) in SPLASH.items():
        path = res / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        canvas = Image.new("RGBA", (width, height), NAVY)
        mark = fit(logo, min(width, height), 0.22)
        canvas.alpha_composite(mark, ((width - mark.width) // 2, (height - mark.height) // 2))
        canvas.save(path)


def write_web_touch(logo: Image.Image) -> None:
    apple = opaque(fit(logo, 180, 0.08), WHITE)
    apple.save(ROOT / "public" / "apple-touch-icon.png")
    fav = opaque(fit(logo, 64, 0.06), WHITE)
    fav.save(ROOT / "public" / "favicon.png")
    mobile = ROOT / "mobile" / "assets"
    if mobile.is_dir():
        logo.save(mobile / "t2s-logo.png")
        opaque(fit(logo, 1024, 0.08), WHITE).save(mobile / "icon.png")
        opaque(fit(logo, 512, 0.08), WHITE).save(mobile / "splash-icon.png")
        fav.save(mobile / "favicon.png")


def main() -> None:
    logo = Image.open(LOGO).convert("RGBA")
    write_launchers(logo)
    write_splashes(logo)
    write_web_touch(logo)
    print(f"Brand icons updated from {LOGO}")


if __name__ == "__main__":
    main()
