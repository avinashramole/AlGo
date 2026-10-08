#!/bin/bash
# Publish the live site from GitHub to nginx + restart t2s.
# Chrome reads /var/www/trade2smart. Restarting t2s alone does not change the page.
# One TEST2 Script window (do not deploy main until this is merged):
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/cursor/test2-one-script-6826/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh cursor/test2-one-script-6826
set -euo pipefail

BRANCH=${1:-main}
WEBROOT=/var/www/trade2smart
UI_MARKER="test2-script-v5"
SCRIPT_LABEL="Script · NIFTY BANKNIFTY SENSEX"
RESULT_MARKER="Connect Dhan LIVE"
ENGINE_MARKER="storedTrades.length ? storedTrades : synthTrades"
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
  git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/$BRANCH" || true
  git pull origin "$BRANCH" || true
  git checkout "origin/$BRANCH" -- \
    src/components/dashboard/StrategyBuilder.tsx \
    src/pages/Algo.tsx \
    src/lib/strategies.ts \
    src/index.css \
    server/niftyTest2/Test2Engine.js \
    server/dhanRollingOption.js \
    server/dhan.js \
    server/index.js \
    server/market.js \
    server/backtestReport.js \
    deploy/publish-web.js 2>/dev/null || true
fi

pull_raw() {
  local rel=$1
  mkdir -p "$(dirname "$HOME_DIR/$rel")"
  curl -fsSL "$RAW/$rel" -o "$HOME_DIR/$rel"
  echo "downloaded $rel"
}

if [ ! -f "$HOME_DIR/src/pages/Algo.tsx" ] || ! grep -q "$RESULT_MARKER" "$HOME_DIR/src/pages/Algo.tsx" || ! grep -q "$UI_MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "Git checkout did not bring the one-script TEST2 form. Downloading files from GitHub."
  pull_raw src/components/dashboard/StrategyBuilder.tsx
  pull_raw src/pages/Algo.tsx
  pull_raw src/lib/strategies.ts
  pull_raw src/index.css
  pull_raw server/niftyTest2/Test2Engine.js
  pull_raw server/dhanRollingOption.js
  pull_raw server/dhan.js
  pull_raw server/index.js
  pull_raw server/market.js
  pull_raw server/backtestReport.js
fi

if ! grep -q "$UI_MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 edit form. Deploy cursor/test2-one-script-6826."
  exit 1
fi
if ! grep -q "$SCRIPT_LABEL" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: $HOME_DIR is missing the TEST2 Script label."
  exit 1
fi
SELECTS=$(grep -c '<Test2ScriptSelect ' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || true)
if [ "$SELECTS" != "1" ]; then
  echo "FAIL: TEST2 Script dropdown count is $SELECTS, need 1. Branch $BRANCH still has copies."
  exit 1
fi
if grep -q 'mark="premiums"' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || grep -q 'mark="name-slot"' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: TEST2 Edit still has extra Script dropdowns."
  exit 1
fi
if grep -q 'data-test2-scripts="card"' "$HOME_DIR/src/pages/Algo.tsx"; then
  echo "FAIL: TEST2 card still has a Script dropdown."
  exit 1
fi
if ! grep -q "$RESULT_MARKER" "$HOME_DIR/src/pages/Algo.tsx"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 result card."
  exit 1
fi
if ! grep -q "$ENGINE_MARKER" "$HOME_DIR/server/niftyTest2/Test2Engine.js"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 engine (no research book)."
  exit 1
fi
if ! grep -q "ROLLING_BACKTEST_DEADLINE_MS" "$HOME_DIR/server/dhanRollingOption.js" || ! grep -q "dhan-not-live" "$HOME_DIR/server/index.js"; then
  echo "FAIL: $HOME_DIR still has the old TEST2 rolling download."
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

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$RESULT_MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $RESULT_MARKER."
  exit 1
fi

if [ "$HOME_DIR" != /opt/t2s ] && [ -d /opt/t2s ]; then
  mkdir -p /opt/t2s/dist
  /bin/cp -af "$HOME_DIR/dist/." /opt/t2s/dist/
  /bin/cp -af "$HOME_DIR/server/niftyTest2/Test2Engine.js" /opt/t2s/server/niftyTest2/Test2Engine.js
  /bin/cp -af "$HOME_DIR/server/dhanRollingOption.js" /opt/t2s/server/dhanRollingOption.js
  /bin/cp -af "$HOME_DIR/server/dhan.js" /opt/t2s/server/dhan.js
  /bin/cp -af "$HOME_DIR/server/index.js" /opt/t2s/server/index.js
  /bin/cp -af "$HOME_DIR/server/market.js" /opt/t2s/server/market.js
  /bin/cp -af "$HOME_DIR/server/backtestReport.js" /opt/t2s/server/backtestReport.js
fi

systemctl restart t2s
systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true

echo "OK website published."
grep -l "$RESULT_MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com and press Ctrl+Shift+R."
echo "Run TEST2 Backtest again with Dhan LIVE. The card must fetch rolling option tape."
