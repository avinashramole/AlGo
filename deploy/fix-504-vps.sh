#!/bin/bash
# Permanent 504 fix on the VPS. Does NOT git merge. Does NOT touch users/tokens/.env.
# Restart does NOT turn LIVE on.
set -euo pipefail

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

echo "== t2s memory cap 1500M =="
mkdir -p /etc/systemd/system/t2s.service.d
cat > /etc/systemd/system/t2s.service.d/memory.conf <<'EOF'
[Service]
MemoryMax=1500M
TimeoutStartSec=25
TimeoutStopSec=15
RestartSec=2
Environment=NODE_OPTIONS=--max-old-space-size=512
EOF
systemctl daemon-reload

echo "== nginx: website from dist, API to Node with short timeout =="
python3 - <<'PY'
from pathlib import Path
import re

SEARCH_ROOTS = [Path("/etc/nginx/conf.d"), Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/nginx.conf")]
NEW_BLOCK = """
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 2s;
        proxy_send_timeout 15s;
        proxy_read_timeout 15s;
    }

    location / {
        root /opt/t2s/dist;
        try_files $uri $uri/ /index.html;
    }
""".rstrip()
LOCATION_RE = re.compile(
    r"location\s+/\s*\{(?:[^{}]|\{[^{}]*\})*proxy_pass\s+http://127\.0\.0\.1:4000[^;]*;(?:[^{}]|\{[^{}]*\})*\}",
    re.DOTALL,
)

def iter_confs():
    seen = set()
    for root in SEARCH_ROOTS:
        if root.is_file():
            yield root
            continue
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and (path.suffix in {".conf", ".inc"} or path.name == "nginx.conf"):
                key = str(path.resolve())
                if key in seen:
                    continue
                seen.add(key)
                yield path

changed = 0
for path in iter_confs():
    try:
        original = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    if "root /opt/t2s/dist" in original and "location /api/" in original:
        continue
    if "proxy_pass http://127.0.0.1:4000" not in original:
        continue
    updated, count = LOCATION_RE.subn(NEW_BLOCK, original, count=8)
    if not count or updated == original:
        continue
    bak = path.with_suffix(path.suffix + ".bak-t2s504")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
    path.write_text(updated, encoding="utf-8")
    print("patched", path)
    changed += 1
print("nginx files patched:", changed)
if changed == 0:
    print("No proxy_pass 4000 location / found. Check: grep -R proxy_pass /etc/nginx")
PY
nginx -t
systemctl reload nginx || systemctl start nginx

echo "== restart hung Node =="
systemctl stop t2s || true
sleep 1
pkill -9 -f "node server/index.js" 2>/dev/null || true
pkill -9 -f "npm run build" 2>/dev/null || true
sleep 1
systemctl start t2s
sleep 4
systemctl is-active t2s nginx
systemctl show t2s -p MemoryMax -p Environment
curl -sS -o /dev/null -w "app:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/ || true
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health || true
echo "Done. Hard-refresh https://trade2smart.com (Ctrl+Shift+R)."
echo "HTML should load from nginx even if API is still starting. Restart did not turn LIVE on."
