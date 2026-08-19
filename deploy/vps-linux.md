# Host Trade 2 Smart on Linux VPS — step by step

VPS: **66.116.248.198**  
Website: **http://66.116.248.198:4000**  
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

If `firewall-cmd` is missing:

```bash
iptables -I INPUT -p tcp --dport 4000 -j ACCEPT
```

Also allow TCP **4000** in the VPS panel firewall if it has one.

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

## Later updates

```bash
cd /opt/t2s
git pull origin cursor/all-desk-checks-00e8
npm run setup:vps
npm run build
systemctl restart t2s
```
