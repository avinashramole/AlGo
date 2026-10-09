import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Capacitor hybrid app bundles the website instead of opening the live URL", () => {
  const cap = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
  const hybrid = fs.readFileSync(path.join(root, "src/lib/hybrid.ts"), "utf8");
  const client = fs.readFileSync(path.join(root, "src/api/client.ts"), "utf8");
  const main = fs.readFileSync(path.join(root, "src/main.tsx"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts/build-hybrid-apk.sh"), "utf8");
  const login = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");

  assert.match(cap, /webDir:\s*"dist"/);
  assert.match(cap, /appId:\s*"com\.t2s\.algo"/);
  assert.equal(/server:\s*\{[^}]*url:\s*"https:\/\/trade2smart\.com"/s.test(cap), false);
  assert.equal(hybrid.includes("@capacitor/core"), false);
  assert.match(hybrid, /isNativePlatform/);
  assert.match(hybrid, /LIVE_DESK_ORIGIN = "https:\/\/trade2smart\.com"/);
  assert.match(hybrid, /\$\{LIVE_DESK_ORIGIN\}\/api/);
  assert.match(client, /apiBase\(\)/);
  assert.match(main, /HashRouter/);
  assert.match(build, /cap sync android/);
  assert.match(login, /data-android-apk="download"/);
  const shell = fs.readFileSync(path.join(root, "src/components/layout/AppShell.tsx"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
  const hybridSrc = fs.readFileSync(path.join(root, "src/lib/hybrid.ts"), "utf8");
  assert.match(shell, /data-mobile-app="responsive"/);
  assert.match(css, /html\.t2s-hybrid aside\.desk-chrome/);
  assert.match(hybridSrc, /markHybridDocument/);
  const activity = fs.readFileSync(path.join(root, "android/app/src/main/java/com/t2s/algo/MainActivity.java"), "utf8");
  assert.match(activity, /BridgeActivity/);
  assert.equal(activity.includes("trade2smart.com"), false);
});

test("login page has a real Android APK download link", () => {
  const login = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
  const nginx = fs.readFileSync(path.join(root, "deploy/nginx-trade2smart.conf"), "utf8");
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const apk = path.join(root, "releases/Trade2Smart-web.apk");
  assert.match(login, /href="\/Trade2Smart-web\.apk"/);
  assert.match(index, /sendAndroidApk/);
  assert.match(nginx, /Trade2Smart-web\.apk/);
  assert.equal(fs.existsSync(apk), true);
  assert.ok(fs.statSync(apk).size > 1000);
});
