# Host Trade 2 Smart on Linux VPS — step by step

VPS: **66.116.248.198**  
Website: **http://66.116.248.198:4000**  
Do **not** run `npm start` on the VPS. That is only for your Windows PC (port 5173).

Live Dhan BUY/SELL from this VPS uses **66.116.248.198**. Dhan Static IP 1 is your home PC **150.129.129.108**. Quotes can run on the VPS. Live orders stay on the PC desk (`http://localhost:5173`) unless Dhan Static IP 1 is already the VPS address.

---

## Step 1 — Log in to the VPS from Windows

On your PC, open **Command Prompt** (or PowerShell):

```bat
ssh root@66.116.248.198
```

If your login is not `root`, use that username instead, for example `ssh ubuntu@66.116.248.198`.

Type `yes` if it asks about the fingerprint. Enter the VPS password. You should see a Linux prompt.

---

## Step 2 — Install Node.js and Git

Paste these lines one block at a time:

```bash
sudo apt update
sudo apt install -y git unzip curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

You should see Node v22.x and an npm version.

---

## Step 3 — Download T2S

```bash
sudo mkdir -p /opt/t2s
sudo chown "$USER":"$USER" /opt/t2s
git clone https://github.com/avinashramole/AlGo.git /opt/t2s
cd /opt/t2s
git checkout cursor/all-desk-checks-00e8
git pull origin cursor/all-desk-checks-00e8
```

---

## Step 4 — Install packages and build the website

```bash
cd /opt/t2s
npm run setup:vps
npm run build
```

Wait until the build finishes with no red error.

---

## Step 5 — Open the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 4000/tcp
sudo ufw enable
sudo ufw status
```

If the VPS panel has a **security group / firewall** (not only ufw), also allow inbound **TCP 4000** there.

---

## Step 6 — Optional Dhan token on boot

```bash
cd /opt/t2s
cp .env.example .env
nano .env
```

Fill `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` if you want the live feed to start with the server. Save: Ctrl+O, Enter, Ctrl+X.

You can skip this and paste the token later on Brokers in the browser.

---

## Step 7 — Test once

```bash
cd /opt/t2s
PORT=4000 npm run start:vps
```

On your PC Chrome open **http://66.116.248.198:4000**

You should see Trade 2 Smart login (demo: `demo@t2s.app` / `demo123`).

In the VPS terminal you should see `T2S API running` and `Website is served from this same port`.

Stop the test with **Ctrl+C**.

---

## Step 8 — Keep it running after you close SSH

```bash
sudo cp /opt/t2s/deploy/t2s.service /etc/systemd/system/t2s.service
sudo systemctl daemon-reload
sudo systemctl enable --now t2s
sudo systemctl status t2s
```

Press `q` to leave the status screen. Site stays up at **http://66.116.248.198:4000**

Watch logs:

```bash
sudo journalctl -u t2s -f
```

---

## Later updates

```bash
cd /opt/t2s
git pull origin cursor/all-desk-checks-00e8
npm run setup:vps
npm run build
sudo systemctl restart t2s
```

If Chrome cannot open the site: VPS is running (`sudo systemctl status t2s`), port 4000 is open, and you are using **http://66.116.248.198:4000** (not 5173, not localhost).
