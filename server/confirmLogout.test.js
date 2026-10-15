import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("native iOS and Android logout buttons ask for confirmation", () => {
  const helper = fs.readFileSync(path.join(root, "mobile/src/confirmLogout.ts"), "utf8");
  const profile = fs.readFileSync(path.join(root, "mobile/src/screens/ProfileScreen.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(root, "mobile/src/screens/SettingsScreen.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const header = fs.readFileSync(path.join(root, "src/components/layout/Header.tsx"), "utf8");
  const webHelper = fs.readFileSync(path.join(root, "src/lib/confirmLogout.ts"), "utf8");
  const memberSettings = fs.readFileSync(path.join(root, "src/pages/MemberSettings.tsx"), "utf8");
  const webProfile = fs.readFileSync(path.join(root, "src/pages/Profile.tsx"), "utf8");
  assert.match(helper, /Alert\.alert\("Log out\?"/);
  assert.match(helper, /Are you sure you want to log out\?/);
  assert.match(helper, /style: "cancel"/);
  assert.match(helper, /style: "destructive"/);
  assert.match(profile, /confirmLogout\(logout\)/);
  assert.match(settings, /confirmLogout\(logout\)/);
  assert.doesNotMatch(profile, /onPress=\{\(\) => void logout\(\)\}/);
  assert.doesNotMatch(settings, /onPress=\{\(\) => void logout\(\)\}/);
  assert.match(nav, /requestLogout\(logout\)/);
  assert.match(nav, /data-apk-logout="true"/);
  assert.match(header, /requestLogout\(logout\)/);
  assert.match(header, /t2s-desktop-only[\s\S]*onClick=\{logout\}/);
  assert.match(webHelper, /isNativeHybrid\(\)/);
  assert.match(webHelper, /iPhone\|iPad\|iPod\|Android/);
  assert.match(webHelper, /window\.confirm/);
  assert.match(memberSettings, /requestLogout\(logout\)/);
  assert.match(webProfile, /requestLogout\(logout\)/);
});
