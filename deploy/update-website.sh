#!/bin/bash
# Rebuild the live website from /opt/t2s and publish it to nginx.
# Chrome reads /var/www/trade2smart — restarting t2s alone does not update the page.
# Usage: bash /opt/t2s/deploy/update-website.sh [branch]
set -euo pipefail

BRANCH=${1:-main}
WEBROOT=/var/www/trade2smart
MARKER="Script · NIFTY BANKNIFTY SENSEX"
HOME_DIR=/opt/t2s

if [ ! -f "$HOME_DIR/server/index.js" ]; then
  if [ -f /root/t2s/server/index.js ]; then
    HOME_DIR=/root/t2s
  elif [ -f "$(cd "$(dirname "$0")/.." && pwd)/server/index.js" ]; then
    HOME_DIR=$(cd "$(dirname "$0")/.." && pwd)
  else
    echo "Could not find T2S. Live checkout is /opt/t2s."
    exit 1
  fi
fi

echo "HOME=$HOME_DIR branch=$BRANCH"
cd "$HOME_DIR"

if [ -d .git ]; then
  git fetch origin "$BRANCH"
  git checkout "$BRANCH" || git checkout -B "$BRANCH" "origin/$BRANCH"
  git pull --ff-only origin "$BRANCH" || git merge --ff-only "origin/$BRANCH" || true
  git checkout "origin/$BRANCH" -- \
    src/components/dashboard/StrategyBuilder.tsx \
    src/pages/Algo.tsx \
    src/lib/strategies.ts \
    src/index.css \
    deploy/update-website.sh \
    deploy/publish-web.js
  echo "git=$(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
else
  echo "No .git in $HOME_DIR — building whatever is already there."
fi

if [ -f "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" ] && ! grep -q "$MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 edit form (no $MARKER)."
  echo "That means this folder is not the new GitHub code. Do not build it."
  exit 1
fi

npm run build

if ! grep -Rql "$MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $MARKER. The website build is still old."
  echo "Do not copy this dist to nginx."
  exit 1
fi

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $MARKER. nginx would keep the old page."
  exit 1
fi

if [ "$HOME_DIR" != /opt/t2s ] && [ -d /opt/t2s ]; then
  echo "Also copying this dist into /opt/t2s/dist (t2s service home)."
  mkdir -p /opt/t2s/dist
  /bin/cp -af "$HOME_DIR/dist/." /opt/t2s/dist/
fi

systemctl restart t2s
systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true

echo "OK website published. grep hit:"
grep -l "$MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com and press Ctrl+Shift+R. TEST2 Edit must show: $MARKER"
