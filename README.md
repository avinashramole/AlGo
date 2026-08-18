# T2S Algo — complete project (web + iOS + Android)

One trading desk. Same login, same live demo data.

| App | How you open it |
| --- | --- |
| **Web** | Chrome on your computer |
| **Android** | Expo Go app on your phone |
| **iOS** | Expo Go app on iPhone / iPad |

Demo login (Avinash): **demo@t2s.app** / **demo123**

New user **Segin** (and any other Gmail): sign in with **Gmail OTP** on the login screen.

---

## First time setup (do once)

1. Install **Node.js LTS** from https://nodejs.org  
2. Install **Git** from https://git-scm.com  
3. Open Command Prompt (Windows) or Terminal (Mac) and run:

```bash
cd Desktop
git clone https://github.com/avinashramole/AlGo.git
cd AlGo
git checkout cursor/t2s-algo-dashboard-00e8
npm install
npm --prefix server install
npm --prefix mobile install
```

---

## Start the web app (computer)

In the `AlGo` folder:

```bash
npm start
```

This starts:

- API on http://localhost:4000  
- Website on http://localhost:5173  

Open **http://localhost:5173** in Chrome.

- **Segin / new user:** Gmail OTP tab → **Connect Gmail** (Gmail + App Password) → name + Gmail → Send code → enter the OTP from inbox. After login, T2S emails a sign-in notice to that Gmail.
- **Avinash demo:** Password tab → `demo@t2s.app` / `demo123`

You can also connect Gmail later in **Settings**. Google Account → Security → 2-Step Verification → App passwords. Do not use your normal Gmail password.

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

```bash
cd Desktop
cd AlGo
npm run dev:mobile
```

A QR code appears.

- **Android:** open Expo Go and scan the QR code  
- **iPhone:** open the Camera app, scan the QR code, then open in Expo Go  

Login: Gmail OTP (Segin) or `demo@t2s.app` / `demo123`

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
```

**Gmail OTP:** Google Account → Security → 2-Step Verification → App passwords. Paste the 16-character password. Without these, the login screen still shows a one-time code so you can add Segin immediately.

Then restart `npm start`. The header shows **DHAN LIVE** when quotes are coming from Dhan. Open positions and NIFTY candles also load from your Dhan account. The token is kept in server memory only.

Sandbox connect for Zerodha / Kotak / Fyers: client ID `demo` and API key `demo123`.

The header broker dropdown sets which account new orders use. Each algo can be routed to a different connected broker.

Open **Chain** in the left menu for the full option chain (NIFTY / BANKNIFTY / FINNIFTY / SENSEX). With a Dhan Access Token connected, strikes, OI, IV, and PCR come from DhanHQ.

---

## Project folders

```
AlGo/
  src/        Web dashboard (React)
  server/     API (live prices, algos, orders)
  mobile/     iOS + Android app (Expo / React Native)
```

---

## Later: put the app on Play Store / App Store

This needs an Expo account and Apple/Google developer accounts:

```bash
cd mobile
npx eas-cli login
npx eas build -p android --profile preview
npx eas build -p ios --profile preview
```

You do **not** need this to try the app today. Expo Go is enough.
