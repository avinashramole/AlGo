#!/bin/bash
# If Node is hung, login 504s. Restart t2s. Does NOT turn LIVE on.
set -euo pipefail
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
echo "t2s health=$code — restarting hung API so login can work. LIVE not turned on."
systemctl restart t2s
