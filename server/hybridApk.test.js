import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("login page has a real Android APK download link", () => {
  const login = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
  const nginx = fs.readFileSync(path.join(root, "deploy/nginx-trade2smart.conf"), "utf8");
  const writer = fs.readFileSync(path.join(root, "deploy/write_nginx_trade2smart.py"), "utf8");
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const apk = path.join(root, "public/Trade2Smart-web.apk");
  assert.match(login, /data-android-apk="download"/);
  assert.match(login, /href="\/Trade2Smart-web\.apk"/);
  assert.match(login, /download="Trade2Smart-web\.apk"/);
  assert.match(index, /sendAndroidApk/);
  assert.match(nginx, /Content-Disposition 'attachment; filename="Trade2Smart-web\.apk"'/);
  assert.match(writer, /location = \/Trade2Smart-web\.apk/);
  assert.equal(fs.existsSync(apk), true);
  assert.ok(fs.statSync(apk).size > 1000);
});

test("hybrid APK wrapper opens the full Trade 2 Smart website", () => {
  const activity = fs.readFileSync(path.join(root, "android-hybrid/app/src/main/java/com/t2s/algo/MainActivity.java"), "utf8");
  const gradle = fs.readFileSync(path.join(root, "android-hybrid/app/build.gradle"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "android-hybrid/app/src/main/AndroidManifest.xml"), "utf8");
  const expo = fs.readFileSync(path.join(root, "mobile/src/screens/HybridDeskScreen.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "mobile/App.tsx"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts/build-hybrid-apk.sh"), "utf8");

  assert.match(gradle, /applicationId "com\.t2s\.algo"/);
  assert.match(gradle, /https:\/\/trade2smart\.com/);
  assert.match(activity, /https:\/\/trade2smart\.com|BuildConfig\.DESK_URL/);
  assert.match(activity, /setJavaScriptEnabled\(true\)/);
  assert.match(activity, /setDomStorageEnabled\(true\)/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /trade2smart\.com/);
  assert.match(expo, /https:\/\/trade2smart\.com/);
  assert.match(app, /HybridDeskScreen/);
  assert.match(build, /assembleDebug/);
});
