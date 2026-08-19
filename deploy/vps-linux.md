# Linux VPS (Ubuntu)

This runs **one Node process**. The website and `/api` share the same port (default 4000). Do not use `npm start` on the VPS — that is the Windows/PC Vite desk.

## Dhan IP

BUY/SELL leaves from **this VPS public IPv4**, not from Chrome and not from your home PC. After `npm run start:vps`, the log prints:

`Dhan BUY/SELL uses this PC public IPv4: …`

That address must already be Dhan Static IP 1. Your home PC is `150.129.129.108`. A VPS is a different computer. Quotes can still run if the IPs differ; live BUY/SELL will not.

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

## Run once (test)

```bash
cd /opt/t2s
PORT=4000 npm run start:vps
```

Open `http://VPS-IP:4000` in Chrome. Keep this terminal open for the test. Ctrl+C to stop.

Open port 4000 (or 80) in the VPS firewall / security group.

## Run forever (systemd)

```bash
sudo cp /opt/t2s/deploy/t2s.service /etc/systemd/system/t2s.service
sudo sed -i "s|/opt/t2s|$PWD|g" /etc/systemd/system/t2s.service
sudo systemctl daemon-reload
sudo systemctl enable --now t2s
sudo systemctl status t2s
```

If the folder is `/opt/t2s`, skip the `sed` line.

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
