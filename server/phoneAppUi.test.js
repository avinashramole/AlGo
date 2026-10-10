import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Phone app uses Trade2Smart home, tabs, and member book", () => {
  const home = fs.readFileSync(path.join(root, "src/components/home/HomeOverview.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const login = fs.readFileSync(path.join(root, "src/pages/Login.tsx"), "utf8");
  const book = fs.readFileSync(path.join(root, "src/pages/MemberBook.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

  assert.match(home, /data-home-overview="phone"/);
  assert.match(home, /Hello,/);
  assert.match(home, /Active Strategies/);
  assert.match(nav, /label: "Algos"/);
  assert.match(nav, /label: "Orders"/);
  assert.match(nav, /label: "Reports"/);
  assert.match(nav, /label: "Profile"/);
  assert.match(login, /t2s-auth-tabs/);
  assert.match(login, /Login with Google/);
  assert.match(book, /data-member-book="orders"/);
  assert.match(app, /MemberOrders/);
  assert.match(app, /RoleOrders/);
});
