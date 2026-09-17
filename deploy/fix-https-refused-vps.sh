#!/bin/bash
# Chrome ERR_CONNECTION_REFUSED on https://trade2smart.com
# nginx 500 on Host trade2smart.com (root under /root) + HTTPS handshake drop.
# VPS is /opt/t2s. PC is C:\Users\SHIVAMFINTECH\Desktop\AlGo.
# Restart does NOT turn LIVE on. Does not open localhost.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "== listeners =="
ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:4000 ' || netstat -tlnp 2>/dev/null | grep -E ':80 |:443 |:4000 ' || true
echo "== certs =="
ls -l /etc/letsencrypt/live/trade2smart.com/ 2>/dev/null || echo "NO Let's Encrypt files"
echo "== nginx roots =="
grep -RInE 'root |listen |server_name' /etc/nginx/conf.d /etc/nginx/nginx.conf 2>/dev/null | head -n 80 || true

bash "$SCRIPT_DIR/install-t2s-service.sh"

echo "== after =="
ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:4000 ' || true
echo "Want t2s active, nginx active, http80 200 or 301, https443 200."
echo "Then Chrome https://trade2smart.com and Ctrl+Shift+R. Do not open localhost."
echo "If still refused, paste: ss -tlnp | grep -E ':80|:443|:4000' ; ls /etc/letsencrypt/live/trade2smart.com ; nginx -T | grep -E 'listen |root |ssl_certificate|server_name'"
