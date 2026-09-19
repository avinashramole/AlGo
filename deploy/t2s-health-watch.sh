#!/bin/bash
# If Node quotes hang, login 504s on :4000. Restart t2s. Keep the login gate up.
# Does NOT turn LIVE on.
set -euo pipefail

if systemctl is-active t2s-login >/dev/null 2>&1; then
  gate=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3999/api/health || echo 000)
  if [ "$gate" != "200" ]; then
    echo "t2s-login health=$gate — restarting login gate. LIVE not turned on."
    systemctl restart t2s-login || true
  fi
fi

systemctl is-active t2s >/dev/null 2>&1 || exit 0
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4000/api/health || echo 000)
if [ "$code" = "200" ]; then
  exit 0
fi
sleep 2
code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4000/api/health || echo 000)
if [ "$code" = "200" ]; then
  exit 0
fi
echo "t2s health=$code — restarting hung API so quotes can recover. LIVE not turned on."
systemctl restart t2s
