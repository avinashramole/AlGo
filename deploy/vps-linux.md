# Host Trade 2 Smart on Linux VPS — step by step

VPS: **66.116.248.198**  
Domain: **trade2smart.com**  
Website: **https://trade2smart.com** (after Step 6)  
Until DNS is ready: **http://66.116.248.198:4000**  
This machine is **not Ubuntu**. If `apt` is missing, use **dnf** or **yum** (Rocky / Alma / CentOS / RHEL).

Do **not** run these commands in Windows PowerShell. SSH first until you see `[root@trade2smart ~]#`.

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

```bash
mkdir -p /opt/t2s
cd /opt/t2s
git clone https://github.com/avinashramole/AlGo.git /opt/t2s
cd /opt/t2s
git checkout cursor/all-desk-checks-00e8
git pull origin cursor/all-desk-checks-00e8
```

If clone says the folder is not empty:

```bash
cd /opt/t2s
git checkout cursor/all-desk-checks-00e8
git pull origin cursor/all-desk-checks-00e8
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
git pull origin cursor/all-desk-checks-00e8
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

Login: `demo@t2s.app` / `demo123`

If Chrome cannot open the domain, the hosting panel is still blocking 80/443. **http://66.116.248.198:4000** can still work.

---

## Later updates

```bash
cd /opt/t2s
git pull origin cursor/all-desk-checks-00e8
npm run setup:vps
npm run build
systemctl restart t2s
```
