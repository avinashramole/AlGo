#!/bin/bash
# Fix Chrome "API is down" / login 504 on trade2smart.com.
# Run as root on the VPS SSH console only. Does NOT turn LIVE on.
# Does not touch users/tokens/.env. Do not open localhost.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the VPS SSH console, not on the PC."
  exit 1
fi
case "$(uname -s)" in
  Linux) ;;
  *) echo "This is not the Linux VPS. Do not run this in Windows."; exit 1 ;;
esac

cd /opt/t2s
git fetch origin --prune
git checkout main
git pull origin main || true
if [ ! -f /opt/t2s/server/loginGate.js ]; then
  echo "loginGate.js not on main yet — using the login-gate branch"
  git fetch origin cursor/login-gate-hung-api-0a8c
  git checkout -B cursor/login-gate-hung-api-0a8c origin/cursor/login-gate-hung-api-0a8c
fi
bash /opt/t2s/deploy/install-t2s-service.sh

if [ -f /opt/t2s/package.json ]; then
  echo "== rebuild website so the banner text matches =="
  (cd /opt/t2s && npm run build) || echo "build skipped (npm run build failed). Login gate still installed."
  if [ -f /opt/t2s/dist/index.html ]; then
    mkdir -p /var/www/trade2smart
    /bin/cp -af /opt/t2s/dist/. /var/www/trade2smart/
    chmod -R a+rX /var/www/trade2smart
  fi
fi

sleep 2
echo "== login gate must answer even if quotes hang =="
systemctl is-active t2s-login || true
systemctl is-active t2s || true
curl -sS -o /dev/null -w "gate:%{http_code}\n" --max-time 5 http://127.0.0.1:3999/api/health || true
curl -sS -o /dev/null -w "login:%{http_code}\n" --max-time 5 -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:3999/api/login || true
curl -skS -o /dev/null -w "https-health:%{http_code}\n" --max-time 8 https://trade2smart.com/api/health || true
curl -skS -o /dev/null -w "https-login:%{http_code}\n" --max-time 8 -X POST -H "Content-Type: application/json" -d "{}" https://trade2smart.com/api/login || true
echo "Want gate:200 and https-login:401. Then Ctrl+Shift+R on https://trade2smart.com. Do not open localhost."
echo "Restart did not turn LIVE on."
