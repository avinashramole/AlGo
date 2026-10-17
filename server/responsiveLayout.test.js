import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("web, Android, and iOS desks auto-adjust for phone, tablet, and laptop widths", () => {
  const shell = fs.readFileSync(path.join(root, "src/components/layout/AppShell.tsx"), "utf8");
  const sidebar = fs.readFileSync(path.join(root, "src/components/layout/Sidebar.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
  const loginCss = fs.readFileSync(path.join(root, "src/login.css"), "utf8");
  const brokers = fs.readFileSync(path.join(root, "src/pages/Brokers.tsx"), "utf8");
  const memberHome = fs.readFileSync(path.join(root, "src/components/home/UserHomeBoard.tsx"), "utf8");
  const expoLogin = fs.readFileSync(path.join(root, "mobile/src/screens/LoginScreen.tsx"), "utf8");
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

  assert.match(shell, /data-mobile-app="responsive"/);
  assert.match(shell, /data-layout="fluid"/);
  assert.match(shell, /md:pl-56/);
  assert.match(shell, /md:p-4 md:pb-4/);
  assert.doesNotMatch(shell, /isNativeHybrid/);
  assert.doesNotMatch(shell, /const phone/);

  assert.match(sidebar, /hidden w-56 flex-col py-3 md:flex/);
  assert.doesNotMatch(sidebar, /isNativeHybrid/);

  assert.match(nav, /md:hidden/);
  assert.match(nav, /data-apk-nav="member"/);
  assert.match(nav, /t2s-apk-member-nav[\s\S]*md:hidden/);

  assert.match(css, /@media \(max-width: 767px\) \{[\s\S]*html\.t2s-hybrid aside\.desk-chrome/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*html\.t2s-hybrid aside\.desk-chrome \{[\s\S]*display: flex !important/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*html\.t2s-hybrid \.t2s-mobile-nav \{[\s\S]*display: none !important/);
  assert.doesNotMatch(css, /\(pointer: coarse\)/);
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1023px\) \{[\s\S]*grid-template-columns: repeat\(3/);

  assert.match(loginCss, /html\.t2s-hybrid \.t2s-app-downloads/);
  assert.match(loginCss, /@media \(max-width: 767px\) \{[\s\S]*html\.t2s-hybrid \.t2s-login-main[\s\S]*max-width: 28rem/);

  assert.doesNotMatch(brokers, /min-w-\[16rem\]/);
  assert.match(brokers, /w-full min-w-0 max-w-full/);
  assert.match(memberHome, /grid-cols-2 gap-2 md:grid-cols-4/);
  assert.match(memberHome, /grid-cols-1 gap-2 sm:grid-cols-3/);

  assert.match(expoLogin, /useWindowDimensions/);
  assert.match(expoLogin, /width >= 768/);
  assert.match(expoLogin, /maxWidth: 440/);

  assert.match(indexHtml, /width=device-width, initial-scale=1, viewport-fit=cover/);
  assert.match(gradle, /versionName "1.11"/);
  const pbx = fs.readFileSync(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
  assert.match(pbx, /MARKETING_VERSION = 1.11/);
});
