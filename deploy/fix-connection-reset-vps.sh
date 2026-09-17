#!/bin/bash
# Bring t2s back when Chrome says the API is down, or curl 4000 resets.
# VPS checkout is /opt/t2s. PC checkout is C:\Users\SHIVAMFINTECH\Desktop\AlGo.
# Does NOT git merge. Does NOT touch users/tokens/.env.
# Restart does NOT turn LIVE on.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "== RAM / swap =="
free -h || true
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  chmod 600 /swapfile
  mkswap /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon /swapfile 2>/dev/null || true
free -h || true

echo "== what is on 4000 =="
ss -tlnp 2>/dev/null | grep 4000 || netstat -tlnp 2>/dev/null | grep 4000 || true
systemctl is-active t2s || true

bash "$SCRIPT_DIR/install-t2s-service.sh"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || systemctl start nginx
fi

echo "== last t2s logs =="
journalctl -u t2s -n 20 --no-pager || true
echo "If still app:000, paste: journalctl -u t2s -n 40 --no-pager ; free -h ; systemctl cat t2s"
