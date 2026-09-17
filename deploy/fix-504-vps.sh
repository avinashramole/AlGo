#!/bin/bash
# Permanent 504 / API-down fix on the VPS. Points t2s at /opt/t2s.
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

bash "$SCRIPT_DIR/install-t2s-service.sh"
if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || systemctl start nginx
fi
echo "Done. Hard-refresh https://trade2smart.com (Ctrl+Shift+R). Do not open localhost."
echo "Restart did not turn LIVE on."
