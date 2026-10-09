#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/android-hybrid"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
ARTIFACTS="${T2S_APK_OUT:-/opt/cursor/artifacts}"
OUT_NAME="${T2S_APK_NAME:-Trade2Smart-web.apk}"

mkdir -p "$SDK_DIR" "$ARTIFACTS" "$APP_DIR/app/src/main/res/mipmap-xxxhdpi"

ICON_SRC="$ROOT/mobile/assets/icon.png"
if [ -f "$ICON_SRC" ]; then
  cp -f "$ICON_SRC" "$APP_DIR/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
fi

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
sdkmanager --sdk_root="$SDK_DIR" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

printf 'sdk.dir=%s\n' "$SDK_DIR" > "$APP_DIR/local.properties"

WRAPPER_JAR="$APP_DIR/gradle/wrapper/gradle-wrapper.jar"
if [ ! -s "$WRAPPER_JAR" ]; then
  echo "Downloading Gradle wrapper jar"
  curl -fsSL "https://raw.githubusercontent.com/gradle/gradle/v8.7.0/gradle/wrapper/gradle-wrapper.jar" -o "$WRAPPER_JAR"
fi

chmod +x "$APP_DIR/gradlew"
(cd "$APP_DIR" && ./gradlew assembleDebug --no-daemon)

APK="$APP_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "FAIL: debug APK was not produced"
  exit 1
fi

cp -f "$APK" "$ARTIFACTS/$OUT_NAME"
cp -f "$APK" "$ROOT/public/$OUT_NAME"
echo "APK ready: $ARTIFACTS/$OUT_NAME"
echo "Website download: $ROOT/public/$OUT_NAME"
ls -lh "$ARTIFACTS/$OUT_NAME" "$ROOT/public/$OUT_NAME"
