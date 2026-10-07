#!/bin/bash
# Publish the TEST2 script dropdown to nginx.
# Chrome reads /var/www/trade2smart. Restarting t2s alone does not change the page.
# Run from anywhere:
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/main/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh
set -euo pipefail

BRANCH=${1:-main}
WEBROOT=/var/www/trade2smart
MARKER="Script · NIFTY BANKNIFTY SENSEX"
RAW="https://raw.githubusercontent.com/avinashramole/AlGo/${BRANCH}"
HOME_DIR=/opt/t2s

if [ ! -f "$HOME_DIR/server/index.js" ]; then
  if [ -f /root/t2s/server/index.js ]; then
    HOME_DIR=/root/t2s
  else
    echo "Could not find T2S. Live checkout is /opt/t2s."
    exit 1
  fi
fi

echo "HOME=$HOME_DIR branch=$BRANCH"
cd "$HOME_DIR"
if [ -d .git ]; then
  echo "git-head=$(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
  git remote -v | head -n 2 || true
  git fetch origin "$BRANCH" || git fetch origin || true
  git checkout "origin/$BRANCH" -- \
    src/components/dashboard/StrategyBuilder.tsx \
    src/pages/Algo.tsx \
    src/lib/strategies.ts \
    src/index.css \
    deploy/publish-web.js 2>/dev/null || true
fi

pull_raw() {
  local rel=$1
  mkdir -p "$(dirname "$HOME_DIR/$rel")"
  curl -fsSL "$RAW/$rel" -o "$HOME_DIR/$rel"
  echo "downloaded $rel"
}

if [ ! -f "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" ] || ! grep -q "$MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "Git checkout did not bring the new TEST2 form. Downloading files from GitHub."
  pull_raw src/components/dashboard/StrategyBuilder.tsx
  pull_raw src/pages/Algo.tsx
  pull_raw src/lib/strategies.ts
fi

if ! grep -q "$MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 edit form."
  exit 1
fi

npm run build

if ! grep -Rql "$MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $MARKER. Build is still old."
  exit 1
fi

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $MARKER."
  exit 1
fi

if [ "$HOME_DIR" != /opt/t2s ] && [ -d /opt/t2s ]; then
  mkdir -p /opt/t2s/dist
  /bin/cp -af "$HOME_DIR/dist/." /opt/t2s/dist/
fi

systemctl restart t2s
systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true

echo "OK website published."
grep -l "$MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com and press Ctrl+Shift+R."
echo "TEST2 Edit and the TEST2 card must show: $MARKER"
