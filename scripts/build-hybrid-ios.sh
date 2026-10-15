#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/ios/App"
ARTIFACTS="${T2S_IPA_OUT:-/opt/cursor/artifacts}"
OUT_NAME="${T2S_IPA_NAME:-Trade2Smart-web.ipa}"

if [ ! -d "$APP_DIR/App.xcodeproj" ]; then
  echo "FAIL: ios/App/App.xcodeproj missing. Run npx cap add ios first."
  exit 1
fi

echo "Building the website bundle for Capacitor iOS"
(cd "$ROOT" && npm run build)
if [ ! -f "$ROOT/dist/index.html" ]; then
  echo "FAIL: dist/index.html missing. Capacitor needs the built website."
  exit 1
fi

(cd "$ROOT" && npx cap sync ios)

if [ "$(uname -s)" != "Darwin" ]; then
  echo "iOS IPA needs a Mac with Xcode."
  echo "iPhone users install from the website: Safari → Share → Add to Home Screen."
  echo "On a Mac: open ios/App/App.xcodeproj then Product → Archive for TestFlight ($OUT_NAME)."
  exit 0
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "FAIL: xcodebuild missing. Install Xcode from the App Store."
  exit 1
fi

mkdir -p "$ARTIFACTS" "$ROOT/releases"
(cd "$APP_DIR" && xcodebuild -scheme App -destination 'generic/platform=iOS' -configuration Release CODE_SIGNING_ALLOWED=NO build)
echo "Capacitor iOS project synced. Archive in Xcode for $ARTIFACTS/$OUT_NAME"
