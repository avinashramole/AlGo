#!/bin/bash
# If Node quotes hang, desk APIs 504. Restart t2s. Keep the login gate up.
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

if ! systemctl is-active t2s >/dev/null 2>&1; then
  echo "t2s is not active — starting API on :4000. LIVE not turned on."
  systemctl reset-failed t2s || true
  systemctl start t2s || true
  exit 0
fi
for _try in 1 2 3; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:4000/api/desk-health || echo 000)
  if [ "$code" != "200" ]; then
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:4000/api/health || echo 000)
  fi
  if [ "$code" = "200" ]; then
    exit 0
  fi
  sleep 2
done
echo "t2s desk-health=$code — restarting hung API so quotes can recover. LIVE not turned on."
systemctl reset-failed t2s || true
systemctl restart t2s
