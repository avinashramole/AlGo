# Host Trade 2 Smart on Linux VPS — step by step

VPS: **66.116.248.198**  
Domain: **trade2smart.com**  
Website: **https://trade2smart.com** (after Step 6)  
Until DNS is ready: **http://66.116.248.198:4000**  
This machine is **not Ubuntu**. If `apt` is missing, use **dnf** or **yum** (Rocky / Alma / CentOS / RHEL).

Do **not** run these commands in Windows PowerShell. SSH first until you see `[root@trade2smart ~]#`.

**Paths (two different machines):**

| Machine | Folder |
| --- | --- |
| **PC** | `C:\Users\SHIVAMFINTECH\Desktop\AlGo` |
| **VPS** | `/opt/t2s` |

Do not `cd` into the Windows path over SSH. Do not clone `download/algo` on the VPS. `systemctl start t2s` must use `/opt/t2s`.

Live Dhan BUY/SELL from this VPS uses **66.116.248.198**. Dhan Static IP 1 is your home PC **150.129.129.108**. Quotes can run on the VPS. Live orders stay on the PC desk (`http://localhost:5173`) unless Dhan Static IP 1 is already the VPS address.

---

## Step 0 — See which Linux it is

```bash
cat /etc/os-release
```

If you see Ubuntu/Debian, use `apt`. If you see Rocky, Alma, CentOS, RHEL, Fedora, or Amazon Linux, use **dnf** (or **yum** if `dnf` is missing).

---

## Step 1 — Install Git and Node (Rocky / Alma / CentOS)

```bash
dnf -y update
dnf -y install git unzip curl
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf -y install nodejs
node -v
npm -v
```

If `dnf` is not found, use `yum` in the same way:

```bash
yum -y update
yum -y install git unzip curl
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
yum -y install nodejs
node -v
npm -v
```

---

## Step 2 — Download T2S

The live checkout on the **VPS** is **`/opt/t2s`**. The **PC** folder is **`C:\Users\SHIVAMFINTECH\Desktop\AlGo`**. Those are not the same path. `systemctl start t2s` must use `/opt/t2s`.

```bash
mkdir -p /opt/t2s
git clone https://github.com/avinashramole/AlGo.git /opt/t2s
cd /opt/t2s
git checkout main
git pull origin main
```

If clone says the folder is not empty:

```bash
cd /opt/t2s
git checkout main
git pull origin main
```

---

## Step 3 — Build

```bash
cd /opt/t2s
npm run setup:vps
npm run build
```

---

## Step 4 — Open port 4000

```bash
firewall-cmd --permanent --add-port=4000/tcp
firewall-cmd --reload
```

If it prints **FirewallD is not running**, skip this step. The site can still work. If Chrome cannot open the site, allow TCP **4000** in the VPS **hosting panel** (not on Windows).

If `firewall-cmd` is missing:

```bash
iptables -I INPUT -p tcp --dport 4000 -j ACCEPT
```

---

## Step 5 — Test

```bash
cd /opt/t2s
PORT=4000 npm run start:vps
```

On your PC, Chrome: **http://66.116.248.198:4000**

Stop the test with Ctrl+C, then keep it running:

```bash
cp /opt/t2s/deploy/t2s.service /etc/systemd/system/t2s.service
bash /opt/t2s/deploy/install-t2s-service.sh
systemctl daemon-reload
systemctl enable --now t2s
systemctl status t2s
```

Press `q` to leave status.

---

## Step 6 — Point trade2smart.com at this VPS

Do this on the website where you bought the domain (GoDaddy, Namecheap, Hostinger, Cloudflare, BigRock, etc.). Not in SSH.

Add two **A** records:

| Host / Name | Type | Value | TTL |
|---|---|---|---|
| `@` (or blank, or `trade2smart.com`) | A | `66.116.248.198` | 300 or Auto |
| `www` | A | `66.116.248.198` | 300 or Auto |

Save. Wait until this works on your PC (can take a few minutes):

```bat
nslookup trade2smart.com
```

You must see **66.116.248.198**. If you still see an old IP, wait and try again. Do not continue until it matches.

T2S must already be running (`systemctl status t2s` shows **active**). Open TCP **80** and **443** in the VPS **hosting panel**. Then in SSH:

```bash
cd /opt/t2s
git pull origin main
dnf -y install epel-release
dnf -y install nginx certbot python3-certbot-nginx
setsebool -P httpd_can_network_connect 1
cp /opt/t2s/deploy/nginx-trade2smart.conf /etc/nginx/conf.d/trade2smart.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx
certbot --nginx -d trade2smart.com -d www.trade2smart.com
```

If `dnf` is missing, use `yum` in those same lines. If `setsebool` errors, skip it.

If certbot asks questions: type your email, agree to terms, then choose to redirect HTTP to HTTPS.

Chrome: **https://trade2smart.com**

Login: `trades2smart@gmail.com` / `demo123`

If Chrome cannot open the domain, the hosting panel is still blocking 80/443. **http://66.116.248.198:4000** can still work.

---

## If SSH times out from Windows

`Connection timed out` means your **PC** cannot reach port **22**. The VPS can still be up.

1. Do **not** keep retrying from the same PC. That can ban your home IP.
2. SSH user is **root**, not the hosting-panel name:

```bat
ssh root@66.116.248.198
```

`tradeadmin` is usually the website-panel login. It is not the SSH user unless you created it on Linux.

3. Turn on your phone hotspot, join it from the PC, then run the same `ssh root@...` command. If that works, your home internet or a ban is blocking port 22.
4. Open the VPS **hosting panel** in Chrome (not PowerShell). Look for **Console**, **VNC**, **KVM**, or **Terminal**. Login there as **root**.
5. In that console, allow SSH and unban (skip any command that prints `command not found`):

```bash
systemctl start sshd || systemctl start ssh
firewall-cmd --permanent --add-service=ssh
firewall-cmd --reload
csf -a YOUR.HOME.IP
fail2ban-client set sshd unbanip YOUR.HOME.IP
```

Get **YOUR.HOME.IP** on the PC Chrome: https://api.ipify.org  
Also allow TCP **22** in the same hosting-panel firewall where you opened 80/443/4000.

6. `C:\Users\SHIVAMFINTECH\Desktop\AlGo` is the Windows PC folder. Linux commands belong in SSH or the web console, not in that Command Prompt.

---

## ERR_CONNECTION_REFUSED (trade2smart.com)

Chrome: **Hmmm… can't reach this page / trade2smart.com refused to connect.**

Port **80** is nginx. Port **443** is HTTPS. Node on **4000** is only for the API behind nginx. Two bugs made this tab fail:

1. nginx `root` was `/root/download/algo/dist`. The nginx user cannot read `/root`, so **trade2smart.com returned 500**.
2. The HTTP-only nginx file replaced Let's Encrypt, so **HTTPS closed during the handshake** (Chrome reports that as refused).

The **VPS** folder is **`/opt/t2s`**. The **PC** folder is **`C:\Users\SHIVAMFINTECH\Desktop\AlGo`**. Restart does **not** turn LIVE on. Do **not** open localhost.

On the VPS as root (even if the prompt says `algo`):

```bash
systemctl stop t2s || true
if [ ! -f /opt/t2s/server/index.js ] && [ -f server/index.js ]; then
  mkdir -p /opt/t2s
  tar -C . --exclude=node_modules -cf - . | tar -C /opt/t2s -xf -
  mkdir -p /opt/t2s/server
  [ -d server/node_modules ] && cp -a server/node_modules /opt/t2s/server/ || true
  [ -f .env ] && [ ! -f /opt/t2s/.env ] && cp -a .env /opt/t2s/.env
  [ -f tokan.env ] && [ ! -f /opt/t2s/tokan.env ] && cp -a tokan.env /opt/t2s/tokan.env
fi
cd /opt/t2s
NODE_OPTIONS=--max-old-space-size=256 npm --prefix server install --omit=dev
mkdir -p /etc/systemd/system/t2s.service.d
cat > /etc/systemd/system/t2s.service.d/home.conf <<'EOF'
[Service]
WorkingDirectory=/opt/t2s
EnvironmentFile=-/opt/t2s/.env
EnvironmentFile=-/opt/t2s/tokan.env
Environment=T2S_HOME=/opt/t2s
EOF
systemctl daemon-reload
systemctl start t2s
mkdir -p /var/www/trade2smart
if [ -f /opt/t2s/dist/index.html ]; then cp -a /opt/t2s/dist/. /var/www/trade2smart/; fi
chmod -R a+rX /var/www/trade2smart || true
restorecon -Rv /var/www/trade2smart 2>/dev/null || true
python3 - <<'PY'
from pathlib import Path
webroot = "/var/www/trade2smart"
cert = Path("/etc/letsencrypt/live/trade2smart.com/fullchain.pem")
key = Path("/etc/letsencrypt/live/trade2smart.com/privkey.pem")
locs = f"""
    client_max_body_size 2m;
    location /api/ {{
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }}
    location / {{
        root {webroot};
        try_files $uri $uri/ /index.html;
    }}
    location @node {{
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
    }}
"""
if cert.is_file() and key.is_file():
    text = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name trade2smart.com www.trade2smart.com;
    return 301 https://$host$request_uri;
}}
server {{
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name trade2smart.com www.trade2smart.com;
    ssl_certificate {cert};
    ssl_certificate_key {key};
    ssl_protocols TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
{locs}
}}
"""
else:
    text = f"""
server {{
    listen 80;
    listen [::]:80;
    server_name trade2smart.com www.trade2smart.com;
{locs}
}}
"""
Path("/etc/nginx/conf.d/trade2smart.conf").write_text(text)
print("wrote /etc/nginx/conf.d/trade2smart.conf certs", cert.is_file())
PY
for f in /etc/nginx/conf.d/*.conf; do
  [ "$f" = /etc/nginx/conf.d/trade2smart.conf ] && continue
  if grep -qE 'root[[:space:]]+/root/|server_name[[:space:]]+trade2smart' "$f"; then mv "$f" "$f.bak-https-refused"; fi
done
nginx -t && (systemctl reload nginx || systemctl restart nginx || systemctl start nginx)
sleep 4
systemctl is-active t2s nginx
systemctl show t2s -p WorkingDirectory
ss -tlnp | grep -E ':80|:443|:4000'
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health
curl -sS -o /dev/null -w "http80:%{http_code}\n" --max-time 8 -H "Host: trade2smart.com" http://127.0.0.1/
curl -skS -o /dev/null -w "https443:%{http_code}\n" --max-time 8 --resolve trade2smart.com:443:127.0.0.1 https://trade2smart.com/ || true
```

You want `t2s` **active**, `nginx` **active**, WorkingDirectory=`/opt/t2s`, `api:200`, `http80:301` or `200`, and `https443:200`. Then Chrome **https://trade2smart.com** and Ctrl+Shift+R.

If that output is `http80:500`, no `:443` in `ss`, and `api:000`:

- **500** = nginx cannot read `/var/www/trade2smart` (mode `700` on `/var` or SELinux).
- **no 443** = nginx never started HTTPS, so Chrome HSTS shows ERR_CONNECTION_REFUSED.
- **api:000** = Node accepted 4000 but did not answer yet.

This block **always** opens 443 (Let's Encrypt if present, otherwise a 30-day cert so nginx listens). Restart does **not** turn LIVE on. Do **not** open localhost.

```bash
setenforce 0 || true
mkdir -p /var/www/trade2smart
chmod 755 /var /var/www /var/www/trade2smart
if [ -f /opt/t2s/dist/index.html ]; then cp -a /opt/t2s/dist/. /var/www/trade2smart/; fi
if [ ! -f /var/www/trade2smart/index.html ]; then
  printf '%s\n' '<!doctype html><title>Trade 2 Smart</title><p>Trade 2 Smart</p>' > /var/www/trade2smart/index.html
fi
chmod -R a+rX /var/www/trade2smart
chown -R nginx:nginx /var/www/trade2smart
restorecon -Rv /var/www/trade2smart 2>/dev/null || true
chcon -Rt httpd_sys_content_t /var/www/trade2smart 2>/dev/null || true
CERT=/etc/letsencrypt/live/trade2smart.com/fullchain.pem
KEY=/etc/letsencrypt/live/trade2smart.com/privkey.pem
if [ ! -e "$CERT" ] || [ ! -e "$KEY" ]; then
  CERT=/etc/nginx/t2s-selfsigned.crt
  KEY=/etc/nginx/t2s-selfsigned.key
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -keyout "$KEY" -out "$CERT" -subj "/CN=trade2smart.com"
fi
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
    root /var/www/trade2smart;
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Connection "";
    }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
nginx -t && (systemctl restart nginx || systemctl start nginx)
cd /opt/t2s
git fetch origin main
git checkout main
git pull origin main
systemctl restart t2s
sleep 2
echo "CERT=$CERT"
ss -tlnp | grep -E ':80|:443|:4000'
curl -sS -o /dev/null -w "http80:%{http_code}\n" --max-time 5 -H "Host: trade2smart.com" http://127.0.0.1/
curl -skS -o /dev/null -w "https443:%{http_code}\n" --max-time 5 --resolve trade2smart.com:443:127.0.0.1 https://127.0.0.1/
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 5 http://127.0.0.1:4000/api/health || true
```

---

## API is down (`systemctl start t2s`)

Chrome on **trade2smart.com** shows: *API is down on the server. On the VPS as root run: systemctl start t2s.*

On the **VPS** the checkout is **`/opt/t2s`**. The **PC** folder is **`C:\Users\SHIVAMFINTECH\Desktop\AlGo`**. Do not `cd` into `/root/download/algo` or any Windows path on the server.

If logs show `Cannot find package 'cors'` from `/root/download/algo/server/index.js`, systemd is pointed at the PC path. Restart does **not** turn LIVE on. Do **not** open localhost.

On the VPS as root (even if the prompt says `algo`):

```bash
systemctl stop t2s || true
if [ ! -f /opt/t2s/server/index.js ] && [ -f server/index.js ]; then
  mkdir -p /opt/t2s
  tar -C . --exclude=node_modules -cf - . | tar -C /opt/t2s -xf -
  mkdir -p /opt/t2s/server
  [ -d server/node_modules ] && cp -a server/node_modules /opt/t2s/server/ || true
  [ -f .env ] && [ ! -f /opt/t2s/.env ] && cp -a .env /opt/t2s/.env
  [ -f tokan.env ] && [ ! -f /opt/t2s/tokan.env ] && cp -a tokan.env /opt/t2s/tokan.env
fi
cd /opt/t2s
NODE_OPTIONS=--max-old-space-size=256 npm --prefix server install --omit=dev
mkdir -p /etc/systemd/system/t2s.service.d
cat > /etc/systemd/system/t2s.service.d/home.conf <<'EOF'
[Service]
WorkingDirectory=/opt/t2s
EnvironmentFile=-/opt/t2s/.env
EnvironmentFile=-/opt/t2s/tokan.env
Environment=T2S_HOME=/opt/t2s
EOF
systemctl daemon-reload
systemctl start t2s
sleep 4
systemctl is-active t2s
systemctl show t2s -p WorkingDirectory
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health
```

Then:

```bash
cd /opt/t2s
git fetch origin main
git checkout main
git pull origin main
bash deploy/fix-connection-reset-vps.sh
```

You want `t2s` **active** and `api:200`. Wait 10 seconds, then Chrome **https://trade2smart.com** and press Ctrl+Shift+R.

---

## Connection reset by peer (`app:000`)

`curl` to `http://127.0.0.1:4000/` printed:

```
app:000
curl: (56) Recv failure: Connection reset by peer
```

Something accepted TCP **4000** and then died (Node crash loop / OOM while loading Dhan). Nginx then shows 502. Restarting `t2s` does **not** turn LIVE on. Do **not** paste Block A again.

On the VPS as root:

```bash
cd /opt/t2s
git fetch origin main
git checkout main
git pull origin main
bash /opt/t2s/deploy/fix-connection-reset-vps.sh
```

Skip `npm run build` unless you also want the website JS rebuilt. This fix is the Node process on port 4000.

You want `t2s` **active**, `app:200`, and `api:200`. Then Chrome: **https://trade2smart.com**

If it still prints `app:000`, paste:

```bash
journalctl -u t2s -n 40 --no-pager
free -h
ss -tlnp | grep 4000
```

---

## 502 Bad Gateway (nginx)

Nginx is running. Node on **127.0.0.1:4000** is not. This happens if Block A stopped `t2s` and Block B did not finish (`npm run build` OOM). Restarting `t2s` does **not** turn LIVE on.

**Bring the site back first. Do not paste Block A again** (Block A stops `t2s`).

```bash
swapon /swapfile 2>/dev/null
sync
echo 3 > /proc/sys/vm/drop_caches
systemctl start t2s
sleep 2
systemctl is-active t2s
curl -sS -o /dev/null -w "app:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health
systemctl start nginx
systemctl is-active nginx
```

You want `t2s` **active** and `app:200` (or `302`). Then Chrome: **https://trade2smart.com**

If `systemctl start t2s` fails, paste this and send the last lines:

```bash
journalctl -u t2s -n 40 --no-pager
free -h
```

---

## Cannot allocate memory (`-bash: fork: Cannot allocate memory`)

The VPS RAM is full. `git` and `npm` cannot start until something is freed. Restarting `t2s` does **not** turn LIVE on.

**If even `free -h` fails:** reboot from the hosting panel (Console / Restart), wait 1 minute, SSH again, then paste Block A then Block B.

**Block A — free RAM and add 2G swap (one time)**

```bash
systemctl stop t2s
killall -9 node 2>/dev/null
sync
echo 3 > /proc/sys/vm/drop_caches
free -h
swapon --show
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon /swapfile
free -h
```

You must see **Swap** with about **2.0Gi** before continuing.

**Block B — deploy IP management (keep the site running until the last line)**

Do **not** stop `t2s` first. Skip `npm run setup:vps`. Restarting `t2s` does **not** turn LIVE on.

```bash
cd /opt/t2s
git fetch origin cursor/ip-management-1488
git checkout cursor/ip-management-1488
git pull origin cursor/ip-management-1488
git log -1 --oneline
NODE_OPTIONS=--max-old-space-size=384 npm run build
grep -l "All account assignments" dist/assets/*.js
systemctl restart t2s
sleep 2
systemctl is-active t2s
curl -sS -o /dev/null -w "app:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/
curl -sS -o /dev/null -w "api:%{http_code}\n" --max-time 8 http://127.0.0.1:4000/api/health
```

`grep` must print a `dist/assets/index-….js` file. If it prints nothing, the table is not in the build — do not restart yet; send `free -h` and the npm error.

Press `q` only if you run `systemctl status`. After **active** and `app:200`, Chrome **https://trade2smart.com/settings/ips** and hard refresh (`Ctrl+Shift+R`). The table is under the four summary cards.

If `npm run build` still dies, start the API anyway (server CE/PE preview still works; the card layout needs the build):

```bash
systemctl start t2s
```

---

## Later updates

```bash
cd /opt/t2s
git fetch origin main
git checkout main
git pull origin main
NODE_OPTIONS=--max-old-space-size=384 npm run build
systemctl restart t2s
```

Only run `npm run setup:vps` if `node_modules` is missing. It uses a lot of RAM. Restart does **not** turn LIVE on.
