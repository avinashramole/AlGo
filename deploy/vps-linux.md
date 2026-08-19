# Linux VPS (Ubuntu)

VPS public IPv4: **66.116.248.198**

This runs **one Node process**. The website and `/api` share the same port (default 4000). Do not use `npm start` on the VPS — that is the Windows/PC Vite desk.

Open in Chrome: **http://66.116.248.198:4000**

## Dhan IP

BUY/SELL leaves from **this VPS** (`66.116.248.198`), not from Chrome and not from your home PC. After start, the log prints:

`Dhan BUY/SELL uses this PC public IPv4: 66.116.248.198`

Dhan Static IP 1 on your account is **150.129.129.108** (home PC). Those two numbers are different. Quotes can still run on the VPS. Live BUY/SELL from the VPS will not, unless Dhan Static IP 1 is already `66.116.248.198`. For live orders today, keep using the PC desk at http://localhost:5173.

## Install (Ubuntu)

```bash
sudo apt update
sudo apt install -y git unzip
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo mkdir -p /opt/t2s
sudo chown "$USER":"$USER" /opt/t2s
git clone https://github.com/avinashramole/AlGo.git /opt/t2s
cd /opt/t2s
git checkout cursor/all-desk-checks-00e8
git pull origin cursor/all-desk-checks-00e8
npm run setup:vps
npm run build
cp .env.example .env
nano .env
```

Put `DHAN_CLIENT_ID` and `DHAN_ACCESS_TOKEN` in `.env` if you want the feed to start on boot. Token lasts about 24 hours; you can also paste it on Brokers after login.

Open the firewall:

```bash
sudo ufw allow 4000/tcp
sudo ufw allow OpenSSH
sudo ufw enable
```

If this VPS uses a cloud security group (not ufw), allow inbound TCP **4000** to `66.116.248.198`.

## Run once (test)

```bash
cd /opt/t2s
PORT=4000 npm run start:vps
```

Chrome: **http://66.116.248.198:4000**. Keep this terminal open for the test. Ctrl+C to stop.

## Run forever (systemd)

```bash
sudo cp /opt/t2s/deploy/t2s.service /etc/systemd/system/t2s.service
sudo systemctl daemon-reload
sudo systemctl enable --now t2s
sudo systemctl status t2s
```

Logs:

```bash
sudo journalctl -u t2s -f
```

Update later:

```bash
cd /opt/t2s
git pull origin cursor/all-desk-checks-00e8
npm run setup:vps
npm run build
sudo systemctl restart t2s
```
