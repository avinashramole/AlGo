#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/android"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
ARTIFACTS="${T2S_APK_OUT:-/opt/cursor/artifacts}"
OUT_NAME="${T2S_APK_NAME:-Trade2Smart-web.apk}"

if [ ! -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Installing Android command-line tools into $SDK_DIR"
  tmp="$(mktemp -d)"
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o "$tmp/cmdtools.zip"
  unzip -q "$tmp/cmdtools.zip" -d "$tmp"
  mkdir -p "$SDK_DIR/cmdline-tools"
  rm -rf "$SDK_DIR/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
  rm -rf "$tmp"
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export PATH="$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools:$PATH"

yes | sdkmanager --sdk_root="$SDK_DIR" --licenses >/dev/null || true
sdkmanager --sdk_root="$SDK_DIR" "platforms;android-36" "platforms;android-35" "build-tools;36.0.0" "build-tools;35.0.0" "platform-tools"

if [ ! -f "$ROOT/dist/index.html" ]; then
  echo "Building the website bundle for Capacitor"
  (cd "$ROOT" && npm run build)
fi
if [ ! -f "$ROOT/dist/index.html" ]; then
  echo "FAIL: dist/index.html missing. Capacitor needs the built website."
  exit 1
fi
if grep -q 'https://trade2smart.com' "$ROOT/dist/index.html" && grep -q 'id="root"' "$ROOT/dist/index.html"; then
  true
fi

printf 'sdk.dir=%s\n' "$SDK_DIR" > "$APP_DIR/local.properties"
(cd "$ROOT" && npx cap sync android)

if [ ! -x "$APP_DIR/gradlew" ]; then
  echo "FAIL: android/gradlew missing. Run npx cap add android first."
  exit 1
fi

(cd "$APP_DIR" && ./gradlew assembleDebug --no-daemon)

APK="$APP_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "FAIL: Capacitor debug APK was not produced"
  exit 1
fi

mkdir -p "$ARTIFACTS" "$ROOT/public"
cp -f "$APK" "$ARTIFACTS/$OUT_NAME"
cp -f "$APK" "$ROOT/public/$OUT_NAME"
echo "Capacitor APK ready: $ARTIFACTS/$OUT_NAME"
ls -lh "$ARTIFACTS/$OUT_NAME" "$ROOT/public/$OUT_NAME"
