#!/bin/bash
# Publish the live site from GitHub to nginx + restart t2s.
# Chrome reads /var/www/trade2smart. Restarting t2s alone does not change the page.
# Always download THIS script from GitHub first. The copy already on the VPS is often old
# and only sparse-updates a few files, so last deploys built a stale desk.
# Do not pipe https://trade2smart.com/deploy/github.sh until this file exists in the webroot
# (nginx otherwise serves index.html and bash errors on `<!doctype html>`).
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/main/deploy/github.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/avinashramole/AlGo/main/deploy/update-website.sh -o /tmp/update-website.sh
#   bash /tmp/update-website.sh main
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
  echo "git-head-before=$(git rev-parse --short HEAD 2>/dev/null || echo none) $(git log -1 --pretty=%s 2>/dev/null || true)"
  git remote -v | head -n 2 || true
  git fetch origin "$BRANCH"
  if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
    echo "FAIL: origin/$BRANCH is missing after fetch."
    exit 1
  fi
  echo "discarding local VPS checkout edits so origin/$BRANCH can land"
  git reset --hard HEAD || true
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  WANTED=$(git rev-parse "origin/$BRANCH")
  HAVE=$(git rev-parse HEAD)
  if [ "$HAVE" != "$WANTED" ]; then
    echo "FAIL: checkout is $HAVE, origin/$BRANCH is $WANTED. Dirty pull left a stale tree."
    exit 1
  fi
  echo "git-head-after=$(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
  if [ "${T2S_DEPLOY_REEXEC:-}" != "1" ] && [ -f "$HOME_DIR/deploy/update-website.sh" ]; then
    echo "re-exec $HOME_DIR/deploy/update-website.sh $BRANCH"
    T2S_DEPLOY_REEXEC=1 exec bash "$HOME_DIR/deploy/update-website.sh" "$BRANCH"
  fi
fi

pull_raw() {
  local rel=$1
  mkdir -p "$(dirname "$HOME_DIR/$rel")"
  curl -fsSL "$RAW/$rel" -o "$HOME_DIR/$rel"
  echo "downloaded $rel"
}

GIT_MATCHED=0
if [ -d "$HOME_DIR/.git" ] && git -C "$HOME_DIR" rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  if [ "$(git -C "$HOME_DIR" rev-parse HEAD)" = "$(git -C "$HOME_DIR" rev-parse "origin/$BRANCH")" ]; then
    GIT_MATCHED=1
  fi
fi

if [ "$GIT_MATCHED" = "1" ]; then
  echo "git checkout is current; skipping GitHub file downloads"
elif [ ! -f "$HOME_DIR/src/pages/Algo.tsx" ] || ! grep -q "$RESULT_MARKER" "$HOME_DIR/src/pages/Algo.tsx" || ! grep -q "$UI_MARKER" "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'data-first-candle-timeframe-bar' "$HOME_DIR/src/components/dashboard/FirstCandleTimeframeBar.tsx"; then
  echo "Git checkout did not bring the desk. Downloading files from GitHub."
  pull_raw src/components/dashboard/StrategyBuilder.tsx
  pull_raw src/components/dashboard/OneMinuteHistoryBar.tsx
  pull_raw src/components/dashboard/FirstCandleTimeframeBar.tsx
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
if ! grep -q 'data-test1-timeframe' "$HOME_DIR/src/components/dashboard/FirstCandleTimeframeBar.tsx" || ! grep -q 'resolveFirstCandleTimeframe' "$HOME_DIR/server/niftyVwap/config.js"; then
  echo "FAIL: $HOME_DIR still has the locked TEST1 5m timeframe."
  exit 1
fi
if ! grep -q 'data-first-candle-timeframe-bar' "$HOME_DIR/src/components/dashboard/FirstCandleTimeframeBar.tsx" || ! grep -q 'DESK_TIMEFRAME_PRESETS = \["5m", "15m", "30m", "1H"\]' "$HOME_DIR/src/lib/strategies.ts"; then
  echo "FAIL: Nifty and Crude first-candle chips (5m 15m 30m 1hr Custom) are missing."
  exit 1
fi
if ! grep -q 'overlayLiveUnrealized' "$HOME_DIR/server/memberBrokerPnl.js" || ! grep -q 'unrealizedPnl: Number(report?.unrealizedPnl || 0)' "$HOME_DIR/server/market.js"; then
  echo "FAIL: Live Unrealized/Net P&L still waits on the slow broker book. Deploy cursor/fast-live-pnl-6826."
  exit 1
fi
if ! grep -q 'data-reports-tabs="position-order-reports"' "$HOME_DIR/src/pages/ReportsHub.tsx" \
  || ! grep -q 'data-reports-tabs="position-order-reports"' "$HOME_DIR/src/components/desk/ReportsBookTabs.tsx" \
  || ! grep -q 'to: "/master-report", label: "Master report"' "$HOME_DIR/src/components/layout/Sidebar.tsx"; then
  echo "FAIL: Reports tabs are not Position, Orders, Reports, Master report."
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
if ! grep -q 'export function AlgoTest' "$HOME_DIR/src/pages/Algo.tsx" || ! grep -q 'SHIVAM_T2S_SEED_ID' "$HOME_DIR/server/strategies.js"; then
  echo "FAIL: Algo Test page is missing the seeded Shivam T2S card."
  exit 1
fi
if ! grep -q '{SHIVAM_T2S_BUY_RULE}. {SHIVAM_T2S_SELL_RULE}. {CANDLE_ENTRY_RULE}' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" \
  || ! grep -q 'data-shivam-rules="true"' "$HOME_DIR/src/pages/Algo.tsx" \
  || ! grep -q 'BUY CE: IDX green + FUT green + CE green' "$HOME_DIR/src/lib/strategies.ts" \
  || ! grep -q 'Skip doji' "$HOME_DIR/server/candleQuality.js" \
  || ! grep -q 'candleAllowsEntry(indexBar)' "$HOME_DIR/server/shivamT2s/signals.js" \
  || ! grep -q 'isDojiColor' "$HOME_DIR/server/shivamT2s/signals.js"; then
  echo "FAIL: Shivam T2S must show BUY/SELL rules and skip doji candles on index, future, and option."
  exit 1
fi
if ! grep -q 'data-shivam-atm="true"' "$HOME_DIR/src/components/dashboard/StrategyBuilder.tsx" || ! grep -q 'const strike = atmStrike' "$HOME_DIR/server/shivamT2s/ShivamT2sStrategy.js"; then
  echo "FAIL: Shivam T2S must always auto-select the live ATM strike."
  exit 1
fi
if ! grep -q 'data-android-apk="download"' "$HOME_DIR/src/pages/Login.tsx"; then
  echo "FAIL: Android APK download is missing. Deploy cursor/capacitor-hybrid-apk-6826."
  exit 1
fi
if ! grep -q 'function installIosApp' "$HOME_DIR/src/pages/Login.tsx" || ! grep -q 't2s-ios-install' "$HOME_DIR/src/pages/Login.tsx"; then
  echo "FAIL: iPhone app install is missing."
  exit 1
fi
if [ ! -d "$HOME_DIR/ios/App/App.xcodeproj" ]; then
  echo "FAIL: Capacitor iOS project is missing."
  exit 1
fi
if [ ! -f "$HOME_DIR/releases/Trade2Smart-web.apk" ]; then
  echo "WARN: releases/Trade2Smart-web.apk is missing. Website still publishes."
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
if ! grep -q 'data-report-download="pdf"' "$HOME_DIR/src/pages/MasterReport.tsx" || ! grep -q 'data-report-download="xlsx"' "$HOME_DIR/src/pages/MasterReport.tsx" || ! grep -q 'downloadMasterReport' "$HOME_DIR/src/api/client.ts"; then
  echo "FAIL: Master report is missing PDF/Excel download."
  exit 1
fi
if grep -q 'data-report-download="pdf"' "$HOME_DIR/src/pages/Reports.tsx" || grep -q 'onClick={() => navigate(reportsBookPath("reports"))}' "$HOME_DIR/src/components/desk/ReportsBookTabs.tsx"; then
  echo "FAIL: Old Reports tab/download is still on Position & Orders."
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
if ! grep -Rql 'first-candle-timeframe-bar' "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ is missing Nifty/Crude timeframe chips. Build is still old."
  exit 1
fi
if ! grep -Rql 'Master report' "$HOME_DIR/dist/assets"; then
  echo "FAIL: dist/ is missing Master report. Website would publish without the admin menu."
  exit 1
fi
if [ -d "$HOME_DIR/.git" ]; then
  printf '{"sha":"%s","short":"%s","branch":"%s","at":"%s"}\n' \
    "$(git -C "$HOME_DIR" rev-parse HEAD)" \
    "$(git -C "$HOME_DIR" rev-parse --short HEAD)" \
    "$BRANCH" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$HOME_DIR/dist/version.json"
fi
if [ -f "$HOME_DIR/releases/Trade2Smart-web.apk" ]; then
  cp -f "$HOME_DIR/releases/Trade2Smart-web.apk" "$HOME_DIR/dist/Trade2Smart-web.apk"
elif [ -f "$WEBROOT/Trade2Smart-web.apk" ]; then
  cp -f "$WEBROOT/Trade2Smart-web.apk" "$HOME_DIR/dist/Trade2Smart-web.apk"
fi

mkdir -p "$WEBROOT"
/bin/cp -af "$HOME_DIR/dist/." "$WEBROOT/"
mkdir -p "$WEBROOT/deploy"
if [ -f "$HOME_DIR/deploy/github.sh" ]; then
  cp -f "$HOME_DIR/deploy/github.sh" "$WEBROOT/deploy/github.sh"
fi
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

if ! grep -Rql "$RESULT_MARKER" "$WEBROOT/assets"; then
  echo "FAIL: $WEBROOT/assets still missing $RESULT_MARKER."
  exit 1
fi
if ! [ -f "$WEBROOT/Trade2Smart-web.apk" ]; then
  echo "WARN: $WEBROOT is missing Trade2Smart-web.apk so the login download will 404."
fi
if [ -f "$WEBROOT/version.json" ]; then
  echo "published $(cat "$WEBROOT/version.json")"
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

echo "Auto-start admin Dhan data feed (same as Brokers → Start data feed)"
feed_live=0
for _try in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 3
  start_body=$(curl -sS --max-time 20 -X POST http://127.0.0.1:4000/api/internal/start-data-feed || echo '{}')
  health_body=$(curl -sS --max-time 3 http://127.0.0.1:4000/api/health || echo '{}')
  echo "data-feed-try=$_try start=$start_body health=$health_body"
  if echo "$health_body" | grep -q '"dhanLive":true'; then
    feed_live=1
    break
  fi
  if echo "$start_body" | grep -q '"live":true'; then
    feed_live=1
    break
  fi
done
if [ "$feed_live" = "1" ]; then
  echo "OK admin data feed is live. Start data feed click was not required."
else
  echo "WARN data feed is not live yet. t2s will keep retrying in the background."
  journalctl -u t2s -n 30 --no-pager || true
fi

echo "OK website published. api:$api head=$(git -C "$HOME_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
grep -l "$RESULT_MARKER" "$WEBROOT/assets/"*.js | head
echo "Open https://trade2smart.com/version.json — sha must match origin/$BRANCH."
echo "Then open https://trade2smart.com and press Ctrl+Shift+R."
echo "Run TEST2 Backtest again with Dhan LIVE. The card must fetch rolling option tape."
