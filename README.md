# Trade 2 Smart — complete project (web + iOS + Android)

One trading desk. Same login, same live demo data.

| App | How you open it |
| --- | --- |
| **Web** | Chrome on your computer |
| **Android** | Expo Go app on your phone |
| **iOS** | Expo Go app on iPhone / iPad |

Demo login: **trades2smart@gmail.com** / **demo123**

**Sign up:** Gmail or mobile + code, then set a password. Use **New here? Create account**.

**Sign in:** one screen — Gmail or mobile + password, or **Sign in with code**. Phone also has **Use thumb**.

---

## First time setup (do once)

1. Install **Node.js LTS** from https://nodejs.org  
2. Install **Git** from https://git-scm.com  
3. Open Command Prompt (Windows) or Terminal (Mac) and run:

```bat
cd /d C:\Users\SHIVAMFINTECH\Desktop
git clone https://github.com/avinashramole/AlGo.git
cd AlGo
git checkout main
npm install
npm --prefix server install
npm --prefix mobile install
```

---

## Start the web app (computer)

In `C:\Users\SHIVAMFINTECH\Desktop\AlGo`:

```bat
npm start
```

This starts:

- API on http://localhost:4000  
- Website on http://localhost:5173  

Open **http://localhost:5173** in Chrome.

- **New user:** Create account → Gmail or mobile → send code → set password.
- **Sign in:** Gmail or mobile + password, or Sign in with code. Phone also has Use thumb.
- **Admin:** `trades2smart@gmail.com` / `demo123`

Connect Gmail (App Password) so Gmail codes and login notices are emailed. Mobile SMS needs `FAST2SMS_API_KEY`. Without those, the screen shows a temporary code. Google Account → Security → 2-Step Verification → App passwords. Do not use your normal Gmail password.

Keep this terminal open.

---

## Start the phone app (iOS and Android)

The phone app is one Expo project. It runs on **both** iPhone and Android.

### On your phone

1. Install **Expo Go**  
   - Android: Google Play → “Expo Go”  
   - iPhone: App Store → “Expo Go”
2. Phone and computer must be on the **same Wi‑Fi**.

### On your computer

Open a **second** terminal:

```bat
cd /d C:\Users\SHIVAMFINTECH\Desktop\AlGo
npm run dev:mobile
```

A QR code appears.

- **Android:** open Expo Go and scan the QR code  
- **iPhone:** open the Camera app, scan the QR code, then open in Expo Go  

Login: Sign up with Gmail or mobile code, then password / Gmail / mobile. Phone also has thumb. Admin: `trades2smart@gmail.com` / `demo123`

The phone talks to the API on your computer, so leave `npm start` running in the first terminal.

---

## If the phone cannot load data

The website still works. For the phone, the API must be reachable on your Wi‑Fi.

1. Keep `npm start` running  
2. In the Expo terminal you will see an IP like `192.168.x.x`  
3. The app uses that IP automatically (`http://YOUR-IP:4000`)

Windows firewall: allow Node.js on private networks if the phone cannot connect.

---

## Multi-broker

Open **Brokers** in the left menu (or on the phone: Portfolio → Brokers).

Supported accounts:

- **Dhan** (main, always connected)
- Zerodha Kite
- Kotak Neo
- Fyers
- Paper Trading (backup)

### Dhan live feed (Access Token)

1. Log in at https://web.dhan.co  
2. Open **My Profile → Access DhanHQ APIs**  
3. Copy **Client ID** and the **Access Token** (valid about 24 hours)  
4. In T2S open **Brokers → Connect live feed** and paste both fields  

Or put them in a local `.env` file (never commit this file):

```
DHAN_CLIENT_ID=your-client-id
DHAN_ACCESS_TOKEN=your-jwt
GMAIL_USER=yourname@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
FAST2SMS_API_KEY=your-fast2sms-key
```

**Gmail codes:** Google Account → Security → 2-Step Verification → App passwords. Paste the 16-character password. **Mobile codes:** Fast2SMS API key, or use the on-screen code. Without Gmail/SMS, the login screen still shows a one-time code so you can sign up immediately.

Then restart `npm start`. The header shows **DHAN LIVE** when quotes are coming from Dhan. Open positions and NIFTY candles also load from your Dhan account. The token is kept in server memory only.

Sandbox connect for Zerodha / Kotak / Fyers: client ID `demo` and API key `demo123`.

The header broker dropdown sets which account new orders use. Each algo can be routed to a different connected broker.

Open **Chain** in the left menu for the full option chain (NIFTY / BANKNIFTY / FINNIFTY / SENSEX). With a Dhan Access Token connected, strikes, OI, IV, and PCR come from DhanHQ.

---

## Project folders

```
AlGo/
  src/             Web dashboard (React) — also bundled into the Android APK
  server/          API (live prices, algos, orders)
  mobile/          Optional Expo preview
  android/         Capacitor Android project (real hybrid app)
  capacitor.config.ts
  scripts/build-hybrid-apk.sh
```

---

## Android APK (real Capacitor hybrid)

The phone APK is a **Capacitor** app. It uses the Trade 2 Smart logo on the launcher, splash, and login screen — the same `/t2s-logo.png` as the website.

**Google / Gmail login stays in the app.** Continue with Google opens Google inside the app WebView and returns through `t2salgo://auth`. It must not leave you on the public website login page. If a browser ever opens, tap **Open the app** to finish inside Trade 2 Smart.

Login, Algo, Reports, Brokers, and Multi-Index are the same screens as the website. Live quotes and orders still use `https://trade2smart.com/api`.

On a Linux machine with Java 17+:

```bash
bash scripts/build-hybrid-apk.sh
```

Download from the login page, or open:

https://trade2smart.com/Trade2Smart-web.apk

On the phone allow **Install unknown apps**, then open the APK.

Expo Go (`npm run dev:mobile`) is still the older native preview. Play Store upload needs a Google developer account.

---

## Linux VPS

The PC desk is `npm start` (Vite on 5173). A VPS should use the production build:

```bash
npm run setup:vps
npm run build
PORT=4000 npm run start:vps
```

Open `http://66.116.248.198:4000`. Step-by-step Ubuntu + systemd: `deploy/vps-linux.md`.

Live Dhan BUY/SELL on the VPS uses **66.116.248.198**. Dhan Static IP 1 is your home PC `150.129.129.108`. For live orders keep the PC desk, or only run BUY/SELL on the machine whose public IPv4 is already saved on Dhan.
