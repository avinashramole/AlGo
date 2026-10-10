#!/bin/bash
# Publish the live site from GitHub to nginx + restart t2s.
# Chrome reads /var/www/trade2smart. Restarting t2s alone does not change the page.
# One TEST2 Script window (do not deploy main until this is merged):
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/cursor/test2-one-script-6826/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh cursor/test2-one-script-6826
# Orange phone UI + bundled APK:
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/cursor/trade2smart-mobile-ui-ddae/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh cursor/trade2smart-mobile-ui-ddae
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
    src/components/dashboard/OneMinuteHistoryBar.tsx \
    src/pages/Algo.tsx \
    src/pages/ReportsHub.tsx \
    src/context/MarketContext.tsx \
    src/pages/UserHome.tsx \
    src/pages/MemberPlans.tsx \
    src/pages/PositionsDesk.tsx \
    src/components/users/UserDetailModal.tsx \
    src/api/client.ts \
    src/lib/strategies.ts \
    src/index.css \
    server/niftyTest2/Test2Engine.js \
    server/dhanRollingOption.js \
    server/dhan.js \
    server/index.js \
    server/indexHistory.js \
    server/indexHistorySync.js \
    server/market.js \
    server/memberBrokerPnl.js \
    server/memberDesk.js \
    server/memberQuotesFeed.js \
    src/components/dashboard/MemberIndexBoard.tsx \
    src/components/layout/Header.tsx \
    mobile/src/screens/HomeScreen.tsx \
    server/niftyVwap/config.js \
    server/niftyTest1/Test1Strategy.js \
    server/strategies.js \
    server/backtestReport.js \
    deploy/publish-web.js 2>/dev/null || true
fi

pull_raw() {
  local rel=$1
  mkdir -p "$(dirname "$HOME_DIR/$rel")"
  curl -fsSL "$RAW/$rel" -o "$HOME_DIR/$rel"
  echo "downloaded $rel"
}

if [ ! -f "$HOME_DIR/src/pages/Algo.tsx" ] || ! grep -q "$RESULT_MARKER" "$HOME_DIR/src/pages/Algo.tsx" || ! grep -q "$UI_MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'data-test1-timeframe' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'timeframe: \["1m", "2m", "5m", "10m", "15m"\].includes' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "Git checkout did not bring the one-script TEST2 form. Downloading files from GitHub."
  pull_raw src/components/dashboard/StrategyBuilder.tsx
  pull_raw src/components/dashboard/OneMinuteHistoryBar.tsx
  pull_raw src/pages/Algo.tsx
  pull_raw src/pages/ReportsHub.tsx
  pull_raw src/context/MarketContext.tsx
  pull_raw src/pages/UserHome.tsx
  pull_raw src/pages/MemberPlans.tsx
  pull_raw src/pages/PositionsDesk.tsx
  pull_raw src/components/users/UserDetailModal.tsx
  pull_raw src/api/client.ts
  pull_raw src/lib/strategies.ts
  pull_raw src/index.css
  pull_raw server/niftyTest2/Test2Engine.js
  pull_raw server/dhanRollingOption.js
  pull_raw server/dhan.js
  pull_raw server/index.js
  pull_raw server/indexHistory.js
  pull_raw server/indexHistorySync.js
  pull_raw server/market.js
  pull_raw server/memberBrokerPnl.js
  pull_raw server/memberDesk.js
  pull_raw server/memberQuotesFeed.js
  pull_raw src/components/dashboard/MemberIndexBoard.tsx
  pull_raw src/components/layout/Header.tsx
  pull_raw mobile/src/screens/HomeScreen.tsx
  pull_raw server/niftyVwap/config.js
  pull_raw server/niftyTest1/Test1Strategy.js
  pull_raw server/strategies.js
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
if ! grep -q "1m history store" "$HOME_DIR/src/components/dashboard/OneMinuteHistoryBar.tsx" || ! grep -q "ensureReplayBars" "$HOME_DIR/server/index.js"; then
  echo "FAIL: $HOME_DIR still has the old 1m history sync."
  exit 1
fi
if ! grep -q 'data-test1-timeframe' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'FIRST_CANDLE_TIMEFRAMES\[algo.timeframe\]' "$HOME_DIR/server/niftyVwap/config.js"; then
  echo "FAIL: $HOME_DIR still has the locked TEST1 5m timeframe."
  exit 1
fi
if ! grep -q 'timeframe: \["1m", "2m", "5m", "10m", "15m"\].includes' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: TEST1 Save still hardcodes 5m. Deploy cursor/test1-save-timeframe-6826."
  exit 1
fi
if ! grep -q 'overlayLiveUnrealized' "$HOME_DIR/server/memberBrokerPnl.js" || ! grep -q 'unrealizedPnl: Number(report?.unrealizedPnl || 0)' "$HOME_DIR/server/market.js"; then
  echo "FAIL: Live Unrealized/Net P&L still waits on the slow broker book. Deploy cursor/fast-live-pnl-6826."
  exit 1
fi
if ! grep -q 'data-reports-tabs="position-order-reports"' "$HOME_DIR/src/pages/ReportsHub.tsx"; then
  echo "FAIL: Reports tabs are not Position, Orders, Reports. Deploy cursor/fast-live-pnl-6826."
  exit 1
fi
if ! grep -q 'data-mir-strategy' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'multi-index-reversal' "$HOME_DIR/server/multiIndexReversal/config.js"; then
  echo "FAIL: Multi-Index Reversal Strategy is missing. Deploy cursor/multi-index-reversal-6826."
  exit 1
fi
if ! grep -q 'data-algo-live-signals="recent-2"' "$HOME_DIR/src/components/dashboard/SignalFeed.tsx" || ! grep -q 'slice(0, 2)' "$HOME_DIR/server/liveSignals.js"; then
  echo "FAIL: Algo Live book must show only the 2 newest BUY/SELL fills. Deploy cursor/algo-signals-recent-2-6826."
  exit 1
fi
if ! grep -q 'data-mir-trade-mode="true"' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx"; then
  echo "FAIL: Multi-Index Edit has no Paper/Live selector. Deploy cursor/multi-index-paper-live-6826."
  exit 1
fi
if ! grep -q 'data-android-apk="download"' "$HOME_DIR/src/pages/Login.tsx" || ! [ -f "$HOME_DIR/releases/Trade2Smart-web.apk" ]; then
  echo "FAIL: Android APK download is missing. Deploy cursor/capacitor-hybrid-apk-6826."
  exit 1
fi
if ! grep -q 'webDir: "dist"' "$HOME_DIR/capacitor.config.ts"; then
  echo "FAIL: Capacitor app must ship the website from dist."
  exit 1
fi
if ! grep -q 'LIVE_DESK_ORIGIN = "https://trade2smart.com"' "$HOME_DIR/src/lib/hybrid.ts"; then
  echo "FAIL: Capacitor APK must call the live API."
  exit 1
fi
if ! grep -q '#fd6b01' "$HOME_DIR/src/index.css" || ! grep -q 'data-home-overview="phone"' "$HOME_DIR/src/components/home/HomeOverview.tsx"; then
  echo "FAIL: Phone orange UI is missing. Deploy cursor/trade2smart-mobile-ui-ddae."
  exit 1
fi
if ! grep -q 'source: "admin"' "$HOME_DIR/server/memberQuotesFeed.js" || ! grep -q "adminDeskBoard" "$HOME_DIR/server/memberQuotesFeed.js"; then
  echo "FAIL: New members must see admin desk live cards when no broker is installed. Deploy cursor/member-admin-live-cards-6826."
  exit 1
fi
if ! grep -q "dropEmptyRollingDays" "$HOME_DIR/server/dhanRollingOption.js" || ! grep -q "dropEmptyRollingDays" "$HOME_DIR/server/index.js"; then
  echo "FAIL: $HOME_DIR index.js and dhanRollingOption.js do not match. API would crash on boot."
  exit 1
fi
if ! grep -q 'T2S_STANDARD_BRAND_REPORT' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'Confidential desk report' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'Backtest report' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'FFFD6B01' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'FF000F29' "$HOME_DIR/server/backtestReport.js"; then
  echo "downloaded branded report from $BRANCH"
  pull_raw server/backtestReport.js
fi
if ! grep -q 'T2S_STANDARD_BRAND_REPORT' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'Confidential desk report' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'Backtest report' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'FFFD6B01' "$HOME_DIR/server/backtestReport.js" || ! grep -q 'FF000F29' "$HOME_DIR/server/backtestReport.js"; then
  echo "FAIL: branded PDF/Excel backtest report is missing the T2S logo navy + orange colors. Do not deploy an old backtestReport.js."
  exit 1
fi
if ! grep -q 'data-report-download="pdf"' "$HOME_DIR/src/pages/Reports.tsx" || ! grep -q 'downloadDeskReport' "$HOME_DIR/src/api/client.ts"; then
  echo "FAIL: Reports page still downloads a plain CSV. Deploy the branded PDF/Excel proposal buttons."
  exit 1
fi

# VPS checkouts often keep an old node_modules. Install before tsc so
# new website packages such as @capacitor/browser do not fail the build.
npm install --no-audit --no-fund
npm run build

if ! grep -Rql "$UI_MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $UI_MARKER. Build is still old."
  exit 1
fi
if ! grep -Rql "$RESULT_MARKER" "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ does not contain $RESULT_MARKER. Build is still old."
  exit 1
fi
cp -f "$HOME_DIR/releases/Trade2Smart-web.apk" "$HOME_DIR/dist/Trade2Smart-web.apk"

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$RESULT_MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $RESULT_MARKER."
  exit 1
fi
if ! [ -f "$WEBROOT/Trade2Smart-web.apk" ]; then
  echo "FAIL: $WEBROOT is missing Trade2Smart-web.apk so the login download will 404."
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
  /bin/cp -af "$HOME_DIR/server/memberQuotesFeed.js" /opt/t2s/server/memberQuotesFeed.js
fi

if [ -f "$HOME_DIR/deploy/write_nginx_trade2smart.py" ]; then
  python3 "$HOME_DIR/deploy/write_nginx_trade2smart.py" --webroot "$WEBROOT" --out /etc/nginx/conf.d/trade2smart.conf || echo "nginx writer skipped; keeping current conf"
fi

systemctl restart t2s
systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true

api=000
for _try in 1 2 3 4 5 6 7 8; do
  sleep 2
  api=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4000/api/health || echo 000)
  if [ "$api" = "200" ]; then
    break
  fi
done
if [ "$api" != "200" ]; then
  echo "FAIL: t2s did not answer /api/health (got $api). Last log:"
  journalctl -u t2s -n 40 --no-pager || true
  exit 1
fi

echo "OK website published. api:$api"
grep -l "$RESULT_MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com and press Ctrl+Shift+R."
echo "Run TEST2 Backtest again with Dhan LIVE. The card must fetch rolling option tape."
