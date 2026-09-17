#!/bin/bash
# Point systemd t2s at /opt/t2s (VPS). PC path is C:\Users\SHIVAMFINTECH\Desktop\AlGo.
# Publish dist where nginx can read it, restore HTTP+HTTPS, start Node + nginx.
# Restart does NOT turn LIVE on. Does not touch users/tokens/.env.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WEBROOT=/var/www/trade2smart
# shellcheck source=t2s-home.sh
. "$SCRIPT_DIR/t2s-home.sh"
T2S_SCRIPT_HOME=$(cd "$SCRIPT_DIR/.." && pwd)
export T2S_SCRIPT_HOME

FOUND=$(t2s_find_home) || {
  echo "Could not find T2S. On the VPS clone to /opt/t2s. PC path is C:\\Users\\SHIVAMFINTECH\\Desktop\\AlGo."
  exit 1
}
echo "found=$FOUND"
if t2s_is_pc_path "$FOUND"; then
  echo "That path is a PC-style folder. VPS home is /opt/t2s."
fi
if ! t2s_is_home "$(t2s_vps_home)"; then
  t2s_seed_opt_t2s "$FOUND" || true
fi
HOME_DIR=$(t2s_vps_home)
if ! t2s_is_home "$HOME_DIR"; then
  echo "Could not use $HOME_DIR; staying on $FOUND only until /opt/t2s exists."
  HOME_DIR=$FOUND
fi
echo "T2S_HOME=$HOME_DIR"
t2s_ensure_server_modules "$HOME_DIR"

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
Environment=T2S_SKIP_LIVE_ALGOS=1
Environment=T2S_DHAN_BOOT_DELAY_MS=4000
EOF

cat > /etc/systemd/system/t2s.service.d/memory.conf <<'EOF'
[Service]
MemoryMax=1500M
TimeoutStopSec=15
RestartSec=2
Environment=NODE_OPTIONS=--max-old-space-size=512
EOF

echo "== publish dist to $WEBROOT (nginx cannot read /root) =="
mkdir -p "$WEBROOT"
chmod 755 /var /var/www "$WEBROOT" || true
if [ -f "$HOME_DIR/dist/index.html" ]; then
  cp -a "$HOME_DIR/dist/." "$WEBROOT/"
elif [ -n "${FOUND:-}" ] && [ -f "$FOUND/dist/index.html" ]; then
  cp -a "$FOUND/dist/." "$WEBROOT/"
fi
if [ ! -f "$WEBROOT/index.html" ]; then
  printf '%s\n' '<!doctype html><html><head><meta charset="utf-8"><title>Trade 2 Smart</title></head><body><p>Trade 2 Smart</p></body></html>' > "$WEBROOT/index.html"
fi
chmod -R a+rX "$WEBROOT" || true
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true

echo "== nginx HTTP+HTTPS, not root /root/... =="
if ! python3 "$SCRIPT_DIR/write_nginx_trade2smart.py" --webroot "$WEBROOT" --out /etc/nginx/conf.d/trade2smart.conf; then
  echo "python nginx writer failed. Leaving /etc/nginx/conf.d as-is and still restarting t2s."
fi
# Extra copies that still `root /root/...` make Chrome 500 / ERR_CONNECTION_REFUSED.
if [ -d /etc/nginx/conf.d ]; then
  for f in /etc/nginx/conf.d/*.conf; do
    [ -f "$f" ] || continue
    [ "$f" = /etc/nginx/conf.d/trade2smart.conf ] && continue
    if grep -qE 'root[[:space:]]+/root/|server_name[[:space:]]+trade2smart' "$f"; then
      echo "moving aside $f (was pointing Chrome at /root or duplicating the vhost)"
      mv "$f" "$f.bak-https-refused"
    fi
  done
fi
restorecon -Rv "$WEBROOT" 2>/dev/null || true
chcon -Rt httpd_sys_content_t "$WEBROOT" 2>/dev/null || true
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce 2>/dev/null)" = Enforcing ]; then
  setenforce 0 || true
  echo "SELinux set Permissive so nginx can read $WEBROOT (was causing HTTP 500)"
fi

if command -v setsebool >/dev/null 2>&1; then
  setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --permanent --add-service=https || true
  firewall-cmd --reload || true
fi
iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true

systemctl daemon-reload
systemctl enable t2s >/dev/null 2>&1 || true
if [ -f "$HOME_DIR/deploy/t2s-login.service" ]; then
  cp "$HOME_DIR/deploy/t2s-login.service" /etc/systemd/system/t2s-login.service
  mkdir -p /etc/systemd/system/t2s-login.service.d
  cat > /etc/systemd/system/t2s-login.service.d/home.conf <<EOF
[Service]
WorkingDirectory=$HOME_DIR
EnvironmentFile=-$HOME_DIR/.env
EnvironmentFile=-$HOME_DIR/tokan.env
Environment=T2S_HOME=$HOME_DIR
EOF
fi
install -m 755 "$SCRIPT_DIR/t2s-health-watch.sh" /usr/local/sbin/t2s-health-watch.sh
cp "$SCRIPT_DIR/t2s-health-watch.service" /etc/systemd/system/t2s-health-watch.service
cp "$SCRIPT_DIR/t2s-health-watch.timer" /etc/systemd/system/t2s-health-watch.timer
systemctl daemon-reload
systemctl enable --now t2s-health-watch.timer >/dev/null 2>&1 || true
systemctl enable --now t2s-login >/dev/null 2>&1 || true
systemctl restart t2s-login || systemctl start t2s-login || true
systemctl stop t2s || true
sleep 1
pkill -9 -f "node server/index.js" 2>/dev/null || true
sleep 1
systemctl start t2s
sleep 4

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx || systemctl restart nginx || systemctl start nginx
fi

echo "== service =="
systemctl is-active t2s || true
systemctl is-active t2s-login || true
systemctl is-active nginx || true
systemctl show t2s -p WorkingDirectory -p FragmentPath || true
ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:4000 |:3999 ' || netstat -tlnp 2>/dev/null | grep -E ':80 |:443 |:4000 |:3999 ' || true
echo "== curl =="
curl -sS -o /dev/null -w "app:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/ || true
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health || true
curl -sS -o /dev/null -w "gate:%{http_code}\n" --max-time 5 http://127.0.0.1:3999/api/health || true
curl -sS -o /dev/null -w "login:%{http_code}\n" --max-time 8 -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:3999/api/login || true
curl -sS -o /dev/null -w "http80:%{http_code}\n" --max-time 8 -H "Host: trade2smart.com" http://127.0.0.1/ || true
if [ -f /etc/letsencrypt/live/trade2smart.com/fullchain.pem ]; then
  curl -skS -o /dev/null -w "https443:%{http_code}\n" --max-time 8 --resolve trade2smart.com:443:127.0.0.1 https://trade2smart.com/ || true
fi
echo "Want t2s and t2s-login active, nginx active, app:200, gate:200, login:401, and http80/https443 200 or 301."
echo "Restart did not turn LIVE on. Then hard-refresh https://trade2smart.com (Ctrl+Shift+R). Do not open localhost."
