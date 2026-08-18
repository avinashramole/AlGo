# T2S Algo — complete project (web + iOS + Android)

One trading desk. Same login, same live demo data.

| App | How you open it |
| --- | --- |
| **Web** | Chrome on your computer |
| **Android** | Expo Go app on your phone |
| **iOS** | Expo Go app on iPhone / iPad |

Demo login: **demo@t2s.app** / **demo123**

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

Open **http://localhost:5173** in Chrome. Log in with `demo@t2s.app` / `demo123`.

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

Login: `demo@t2s.app` / `demo123`

The phone talks to the API on your computer, so leave `npm start` running in the first terminal.

---

## If the phone cannot load data

The website still works. For the phone, the API must be reachable on your Wi‑Fi.

1. Keep `npm start` running  
2. In the Expo terminal you will see an IP like `192.168.x.x`  
3. The app uses that IP automatically (`http://YOUR-IP:4000`)

Windows firewall: allow Node.js on private networks if the phone cannot connect.

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
