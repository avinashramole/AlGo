import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Phone app uses Trade2Smart home, tabs, and member book", () => {
  const home = fs.readFileSync(path.join(root, "src/components/home/HomeOverview.tsx"), "utf8");
  const adminHome = fs.readFileSync(path.join(root, "src/pages/Dashboard.tsx"), "utf8");
  const userHome = fs.readFileSync(path.join(root, "src/pages/UserHome.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const login = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
  const book = fs.readFileSync(path.join(root, "src/pages/MemberBook.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

  assert.match(home, /data-home-overview="phone"/);
  assert.match(home, /Hello,/);
  assert.match(home, /\{tape\}/);
  assert.match(home, /data-home-shortcuts="algos-orders-positions"/);
  assert.doesNotMatch(home, /Active Strategies/);
  assert.doesNotMatch(home, /Position and Orders/);
  assert.match(home, /label="Orders"/);
  assert.match(home, /label="Positions"/);
  assert.doesNotMatch(home, /Waiting for the next quote/);
  assert.doesNotMatch(home, /quote\?\.symbol/);
  assert.match(adminHome, /tape=\{<TickerStrip/);
  assert.match(userHome, /tape=\{<MemberIndexBoard/);
  assert.doesNotMatch(userHome, /hidden md:block/);
  assert.doesNotMatch(adminHome, /quote=/);
  assert.doesNotMatch(userHome, /quote=/);
  assert.match(nav, /label: "Algos"/);
  assert.match(nav, /label: "Position & Orders"/);
  assert.match(nav, /label: "Profile"/);
  assert.doesNotMatch(nav, /to: "\/orders"/);
  assert.match(login, /t2s-auth-tabs/);
  assert.match(login, /Login with Google/);
  assert.match(book, /data-member-book="orders"/);
  assert.match(book, /Position & Orders/);
  assert.match(app, /MemberReports/);
  assert.match(app, /RoleReports/);
  assert.match(app, /Navigate to="\/reports\?tab=orders"/);
});
