#!/usr/bin/env python3
"""Paint the Trade 2 Smart logo onto Android launcher and splash images."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "public" / "t2s-logo.png"
APP_ICON = ROOT / "mobile" / "assets" / "app-icon-source.png"
NAVY = (7, 24, 51, 255)
WHITE = (255, 255, 255, 255)
CREAM = (255, 248, 241, 255)
IOS_ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
APPLE_SPLASH = (
    (1290, 2796),
    (1179, 2556),
    (1170, 2532),
    (1284, 2778),
    (2048, 2732),
)

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


def cream_splash(app: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), CREAM)
    mark = fit(app, max(64, int(min(width, height) * 0.38)), 0.0)
    canvas.alpha_composite(mark, ((width - mark.width) // 2, (height - mark.height) // 2))
    return canvas.convert("RGB")


def write_ios_and_pwa(app_icon: Image.Image) -> None:
    public = ROOT / "public"
    opaque(fit(app_icon, 192, 0.0), WHITE).save(public / "pwa-192.png")
    opaque(fit(app_icon, 512, 0.0), WHITE).save(public / "pwa-512.png")
    for width, height in APPLE_SPLASH:
        cream_splash(app_icon, width, height).save(public / f"apple-splash-{width}x{height}.png")
    iconset = IOS_ASSETS / "AppIcon.appiconset"
    if iconset.is_dir():
        opaque(fit(app_icon, 1024, 0.0), WHITE).convert("RGB").save(iconset / "AppIcon-512@2x.png")
    splash_dir = IOS_ASSETS / "Splash.imageset"
    if splash_dir.is_dir():
        cream_splash(app_icon, 2732, 2732).save(splash_dir / "splash-2732x2732.png")


def write_web_touch(lockup: Image.Image, app_icon: Image.Image) -> None:
    apple = opaque(fit(app_icon, 180, 0.04), WHITE)
    apple.save(ROOT / "public" / "apple-touch-icon.png")
    fav = opaque(fit(lockup, 64, 0.06), WHITE)
    fav.save(ROOT / "public" / "favicon.png")
    mobile = ROOT / "mobile" / "assets"
    if mobile.is_dir():
        lockup.save(mobile / "t2s-logo.png")
        opaque(fit(app_icon, 1024, 0.0), WHITE).convert("RGB").save(mobile / "icon.png")
        opaque(fit(app_icon, 512, 0.0), WHITE).convert("RGB").save(mobile / "splash-icon.png")
        opaque(fit(app_icon, 64, 0.04), WHITE).convert("RGB").save(mobile / "favicon.png")
    write_ios_and_pwa(app_icon)


def main() -> None:
    lockup = Image.open(LOGO).convert("RGBA")
    app_icon = Image.open(APP_ICON).convert("RGBA") if APP_ICON.exists() else lockup
    write_launchers(app_icon)
    write_splashes(lockup)
    write_web_touch(lockup, app_icon)
    print(f"App icons updated from {APP_ICON if APP_ICON.exists() else LOGO}")


if __name__ == "__main__":
    main()
