#!/bin/bash
# Point systemd t2s at the checkout (download/algo or /opt/t2s) and start it.
# Restart does NOT turn LIVE on. Does not touch users/tokens/.env.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=t2s-home.sh
. "$SCRIPT_DIR/t2s-home.sh"

HOME_DIR=$(t2s_find_home) || {
  echo "Could not find T2S. Put the repo at /root/download/algo (or /opt/t2s) so server/index.js exists."
  exit 1
}
echo "T2S_HOME=$HOME_DIR"

if [ -f "$HOME_DIR/deploy/t2s.service" ]; then
  cp "$HOME_DIR/deploy/t2s.service" /etc/systemd/system/t2s.service
fi

mkdir -p /etc/systemd/system/t2s.service.d
cat > /etc/systemd/system/t2s.service.d/home.conf <<EOF
[Service]
WorkingDirectory=$HOME_DIR
EnvironmentFile=-$HOME_DIR/.env
EnvironmentFile=-$HOME_DIR/tokan.env
Environment=T2S_HOME=$HOME_DIR
EOF

cat > /etc/systemd/system/t2s.service.d/memory.conf <<'EOF'
[Service]
MemoryMax=1500M
TimeoutStopSec=15
RestartSec=2
Environment=NODE_OPTIONS=--max-old-space-size=512
EOF

if [ -f "$HOME_DIR/deploy/nginx-trade2smart.conf" ]; then
  mkdir -p /etc/nginx/conf.d
  sed "s|/opt/t2s|$HOME_DIR|g" "$HOME_DIR/deploy/nginx-trade2smart.conf" > /etc/nginx/conf.d/trade2smart.conf
fi

python3 - "$HOME_DIR" <<'PY'
from pathlib import Path
import re
import sys

home = sys.argv[1]
dist = f"{home}/dist"
SEARCH_ROOTS = [Path("/etc/nginx/conf.d"), Path("/etc/nginx/sites-enabled"), Path("/etc/nginx/nginx.conf")]
NEW_BLOCK = f"""
    location /api/ {{
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_connect_timeout 2s;
        proxy_send_timeout 15s;
        proxy_read_timeout 15s;
    }}

    location / {{
        root {dist};
        try_files $uri $uri/ /index.html;
    }}
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
    if f"root {dist}" in original and "location /api/" in original and 'Connection ""' in original:
        continue
    if "proxy_pass http://127.0.0.1:4000" not in original:
        continue
    updated, count = LOCATION_RE.subn(NEW_BLOCK, original, count=8)
    if not count or updated == original:
        continue
    bak = path.with_suffix(path.suffix + ".bak-t2shome")
    if not bak.exists():
        bak.write_text(original, encoding="utf-8")
    path.write_text(updated, encoding="utf-8")
    print("patched", path)
    changed += 1
print("nginx files patched:", changed)
PY

systemctl daemon-reload
systemctl enable t2s >/dev/null 2>&1 || true
systemctl stop t2s || true
sleep 1
pkill -9 -f "node server/index.js" 2>/dev/null || true
sleep 1
systemctl start t2s
sleep 4
echo "== service =="
systemctl is-active t2s || true
systemctl show t2s -p WorkingDirectory -p FragmentPath || true
echo "== curl =="
curl -sS -o /dev/null -w "app:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/ || true
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health || true
echo "Want app:200 and api:200. Restart did not turn LIVE on."
echo "Then hard-refresh https://trade2smart.com (Ctrl+Shift+R). Do not open localhost."
