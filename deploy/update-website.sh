#!/bin/bash
# Publish the live site from GitHub to nginx + restart t2s.
# Chrome reads /var/www/trade2smart. Restarting t2s alone does not change the page.
# Run on the VPS as root to publish the fast rolling Backtest branch:
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/cursor/fast-rolling-backtest-eae6/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh
set -euo pipefail

BRANCH=${1:-cursor/fast-rolling-backtest-eae6}
BRANCH=${BRANCH%%[[:space:].]*}
BRANCH=${BRANCH%/}
if [ -z "$BRANCH" ]; then
  BRANCH=cursor/fast-rolling-backtest-eae6
fi
WEBROOT=/var/www/trade2smart
UI_MARKER="Script · NIFTY BANKNIFTY SENSEX"
RESULT_MARKER="Connect Dhan LIVE"
SPEED_MARKER="fills newest missing weekdays first"
RANGE_MARKER="fastest Dhan rolling fill"
ENGINE_MARKER="storedTrades.length ? storedTrades : synthTrades"
RAW="https://raw.githubusercontent.com/avinashramole/AlGo/${BRANCH}"
HOME_DIR=/opt/t2s

FILES="
src/components/dashboard/StrategyBuilder.tsx
src/components/dashboard/BacktestRange.tsx
src/pages/Algo.tsx
src/lib/strategies.ts
src/index.css
server/niftyTest2/Test2Engine.js
server/dhanRollingOption.js
server/dhan.js
server/index.js
server/market.js
server/backtestReport.js
deploy/publish-web.js
deploy/write_nginx_trade2smart.py
deploy/nginx-trade2smart.conf
deploy/install-t2s-service.sh
"

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
  git fetch origin "$BRANCH"
  # Discard dirty tracked copies from older hotfixes. Leaves .env, tokan.env, and server/data alone.
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  # shellcheck disable=SC2086
  git checkout "origin/$BRANCH" -- $FILES
fi

pull_raw() {
  local rel=$1
  mkdir -p "$(dirname "$HOME_DIR/$rel")"
  curl -fsSL "$RAW/$rel" -o "$HOME_DIR/$rel"
  echo "downloaded $rel"
}

need_raw=0
if [ ! -f "$HOME_DIR/src/pages/Algo.tsx" ] || ! grep -q "$SPEED_MARKER" "$HOME_DIR/src/pages/Algo.tsx"; then
  need_raw=1
fi
if [ ! -f "$HOME_DIR/server/dhanRollingOption.js" ] || ! grep -q "ROLLING_CONCURRENCY" "$HOME_DIR/server/dhanRollingOption.js"; then
  need_raw=1
fi
if [ ! -f "$HOME_DIR/src/components/dashboard/BacktestRange.tsx" ] || ! grep -q "$RANGE_MARKER" "$HOME_DIR/src/components/dashboard/BacktestRange.tsx"; then
  need_raw=1
fi
if [ "$need_raw" = 1 ]; then
  echo "Git checkout missed the fast rolling files. Downloading from GitHub $BRANCH."
  for rel in $FILES; do
    [ -n "$rel" ] || continue
    pull_raw "$rel"
  done
fi

if ! grep -q "$UI_MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 edit form."
  exit 1
fi
if ! grep -q "$RESULT_MARKER" "$HOME_DIR/src/pages/Algo.tsx" || ! grep -q "$SPEED_MARKER" "$HOME_DIR/src/pages/Algo.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 result card."
  exit 1
fi
if ! grep -q "$RANGE_MARKER" "$HOME_DIR/src/components/dashboard/BacktestRange.tsx"; then
  echo "FAIL: $HOME_DIR still has the old backtest range picker."
  exit 1
fi
if ! grep -q "$ENGINE_MARKER" "$HOME_DIR/server/niftyTest2/Test2Engine.js"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 engine (no research book)."
  exit 1
fi
if ! grep -q "ROLLING_CONCURRENCY" "$HOME_DIR/server/dhanRollingOption.js" || ! grep -q "newestFirst" "$HOME_DIR/server/dhanRollingOption.js"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 rolling download."
  exit 1
fi
if ! grep -q "newestFirst: true" "$HOME_DIR/server/index.js" || ! grep -q "dhan-not-live" "$HOME_DIR/server/index.js"; then
  echo "FAIL: $HOME_DIR still has the old Backtest rolling call."
  exit 1
fi

npm run build

if ! grep -Rql "$UI_MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $UI_MARKER. Build is still old."
  exit 1
fi
if ! grep -Rql "$RESULT_MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $RESULT_MARKER. Build is still old."
  exit 1
fi
if ! grep -Rql "$SPEED_MARKER" "$HOME_DIR/dist/assets" && ! grep -Rql "newest missing weekdays" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain the fast rolling Backtest copy."
  exit 1
fi

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$RESULT_MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $RESULT_MARKER."
  exit 1
fi

if [ "$HOME_DIR" != /opt/t2s ] && [ -d /opt/t2s ]; then
  mkdir -p /opt/t2s/dist /opt/t2s/server/niftyTest2 /opt/t2s/deploy
  /bin/cp -af "$HOME_DIR/dist/." /opt/t2s/dist/
  /bin/cp -af "$HOME_DIR/server/niftyTest2/Test2Engine.js" /opt/t2s/server/niftyTest2/Test2Engine.js
  /bin/cp -af "$HOME_DIR/server/dhanRollingOption.js" /opt/t2s/server/dhanRollingOption.js
  /bin/cp -af "$HOME_DIR/server/dhan.js" /opt/t2s/server/dhan.js
  /bin/cp -af "$HOME_DIR/server/index.js" /opt/t2s/server/index.js
  /bin/cp -af "$HOME_DIR/server/market.js" /opt/t2s/server/market.js
  /bin/cp -af "$HOME_DIR/server/backtestReport.js" /opt/t2s/server/backtestReport.js
  /bin/cp -af "$HOME_DIR/deploy/write_nginx_trade2smart.py" /opt/t2s/deploy/write_nginx_trade2smart.py
  /bin/cp -af "$HOME_DIR/deploy/nginx-trade2smart.conf" /opt/t2s/deploy/nginx-trade2smart.conf
fi

if [ -f "$HOME_DIR/deploy/write_nginx_trade2smart.py" ]; then
  python3 "$HOME_DIR/deploy/write_nginx_trade2smart.py" --webroot "$WEBROOT" --out /etc/nginx/conf.d/trade2smart.conf || true
fi
if [ -f /etc/nginx/conf.d/trade2smart.conf ] && ! grep -q "proxy_read_timeout 600s" /etc/nginx/conf.d/trade2smart.conf; then
  echo "WARN: nginx backtest timeout is not 600s yet. Check /etc/nginx/conf.d/trade2smart.conf"
fi

systemctl restart t2s
nginx -t && (systemctl reload nginx || systemctl restart nginx) || true

echo "OK website published from $BRANCH."
grep -l "$RESULT_MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com and press Ctrl+Shift+R."
echo "Run TEST2 Backtest on this month with Dhan LIVE. Newest missing weekdays fill first."
