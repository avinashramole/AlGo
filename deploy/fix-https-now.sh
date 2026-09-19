#!/bin/bash
# One-shot: make https://trade2smart.com answer.
# Run as root on the VPS only. PC path is C:\Users\SHIVAMFINTECH\Desktop\AlGo.
# Restart does NOT turn LIVE on. Do not open localhost.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root on the VPS SSH console, not on the PC."
  exit 1
fi
case "$(uname -s)" in
  Linux) ;;
  *) echo "This is not the Linux VPS. Do not run this in Windows."; exit 1 ;;
esac

WEBROOT=/var/www/trade2smart
setenforce 0 2>/dev/null || true
mkdir -p "$WEBROOT"
chmod 755 /var /var/www "$WEBROOT"
if [ -f /opt/t2s/dist/index.html ]; then
  /bin/cp -af /opt/t2s/dist/. "$WEBROOT/"
fi
if [ ! -f "$WEBROOT/index.html" ]; then
  printf '%s\n' '<!doctype html><title>Trade 2 Smart</title><p>Trade 2 Smart</p>' > "$WEBROOT/index.html"
fi
chmod -R a+rX "$WEBROOT"
chown -R nginx:nginx "$WEBROOT" 2>/dev/null || true
restorecon -Rv "$WEBROOT" 2>/dev/null || true
chcon -Rt httpd_sys_content_t "$WEBROOT" 2>/dev/null || true

CERT=/etc/letsencrypt/live/trade2smart.com/fullchain.pem
KEY=/etc/letsencrypt/live/trade2smart.com/privkey.pem
if [ ! -e "$CERT" ] || [ ! -e "$KEY" ]; then
  for d in /etc/letsencrypt/live/www.trade2smart.com /etc/letsencrypt/live/* /etc/letsencrypt/archive/*; do
    [ -d "$d" ] || continue
    if [ -e "$d/fullchain.pem" ] && [ -e "$d/privkey.pem" ]; then
      CERT=$d/fullchain.pem
      KEY=$d/privkey.pem
      break
    fi
    fc=$(ls "$d"/fullchain*.pem 2>/dev/null | tail -n 1 || true)
    pk=$(ls "$d"/privkey*.pem 2>/dev/null | tail -n 1 || true)
    if [ -n "$fc" ] && [ -n "$pk" ]; then
      CERT=$fc
      KEY=$pk
      break
    fi
  done
fi
if [ ! -e "$CERT" ] || [ ! -e "$KEY" ]; then
  CERT=/etc/nginx/t2s-selfsigned.crt
  KEY=/etc/nginx/t2s-selfsigned.key
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -keyout "$KEY" -out "$CERT" -subj "/CN=trade2smart.com"
fi
echo "CERT=$CERT"

cat > /etc/nginx/conf.d/trade2smart.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name trade2smart.com www.trade2smart.com;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name trade2smart.com www.trade2smart.com;
    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
    root $WEBROOT;
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Connection "";
        proxy_connect_timeout 2s;
        proxy_read_timeout 8s;
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF

if [ -d /etc/nginx/conf.d ]; then
  for f in /etc/nginx/conf.d/*.conf; do
    [ -f "$f" ] || continue
    [ "$f" = /etc/nginx/conf.d/trade2smart.conf ] && continue
    if grep -qE 'root[[:space:]]+/root/|server_name[[:space:]]+trade2smart' "$f"; then
      mv "$f" "$f.bak-https-now"
    fi
  done
fi

nginx -t
systemctl restart nginx || systemctl start nginx

if [ -d /opt/t2s/.git ]; then
  git -C /opt/t2s fetch origin main || true
  git -C /opt/t2s checkout main || true
  git -C /opt/t2s pull origin main || true
  systemctl restart t2s || systemctl start t2s || true
fi

sleep 2
echo "== listeners (must include :443) =="
ss -tlnp 2>/dev/null | grep -E ':80|:443|:4000' || netstat -tlnp 2>/dev/null | grep -E ':80|:443|:4000' || true
echo "== curl =="
curl -sS -o /dev/null -w "http80:%{http_code}\n" --max-time 5 -H "Host: trade2smart.com" http://127.0.0.1/ || true
curl -skS -o /dev/null -w "https443:%{http_code}\n" --max-time 5 --resolve trade2smart.com:443:127.0.0.1 https://trade2smart.com/ || true
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 5 http://127.0.0.1:4000/api/health || true
echo "Want :443 in ss, http80:301 or 200, https443:200."
echo "Then Chrome https://trade2smart.com and Ctrl+Shift+R. Do not open localhost."
