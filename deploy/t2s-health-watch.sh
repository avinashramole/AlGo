#!/bin/bash
# If Node quotes hang, login 504s on :4000. Restart t2s. Keep the login gate up.
# Does NOT turn LIVE on. Does not restart while a backtest is writing backtest.busy.
set -euo pipefail

BUSY="${T2S_BACKTEST_BUSY_FILE:-/opt/t2s/server/data/backtest.busy}"
if [ -f "$BUSY" ]; then
  now=$(date +%s)
  stamp=$(date -r "$BUSY" +%s 2>/dev/null || echo 0)
  if [ "$((now - stamp))" -lt 300 ]; then
    echo "backtest in progress — not restarting t2s"
    exit 0
  fi
fi

if systemctl is-active t2s-login >/dev/null 2>&1; then
  gate=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3999/api/health || echo 000)
  if [ "$gate" != "200" ]; then
    echo "t2s-login health=$gate — restarting login gate. LIVE not turned on."
    systemctl restart t2s-login || true
  fi
fi

systemctl is-active t2s >/dev/null 2>&1 || exit 0
for _try in 1 2 3 4; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4000/api/health || echo 000)
  if [ "$code" = "200" ]; then
    exit 0
  fi
  sleep 3
done
echo "t2s health=$code — restarting hung API so quotes can recover. LIVE not turned on."
systemctl restart t2s
