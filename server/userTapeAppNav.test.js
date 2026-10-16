import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("user home opens a dedicated tape page and APK splits Position, Orders, Broker, Logout", () => {
  const home = fs.readFileSync(path.join(root, "src/components/home/UserHomeBoard.tsx"), "utf8");
  const userHome = fs.readFileSync(path.join(root, "src/pages/UserHome.tsx"), "utf8");
  const tape = fs.readFileSync(path.join(root, "src/pages/MemberTape.tsx"), "utf8");
  const broker = fs.readFileSync(path.join(root, "src/pages/MemberBroker.tsx"), "utf8");
  const nav = fs.readFileSync(path.join(root, "src/components/layout/MobileNav.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const roles = fs.readFileSync(path.join(root, "src/lib/roles.ts"), "utf8");
  const book = fs.readFileSync(path.join(root, "src/pages/MemberBook.tsx"), "utf8");

  assert.match(home, /to="\/tape"/);
  assert.match(home, /to="\/broker"/);
  assert.doesNotMatch(home, /id="market-tape"/);
  assert.doesNotMatch(userHome, /MemberIndexBoard/);
  assert.match(tape, /data-member-tape-page="true"/);
  assert.match(tape, /MemberIndexBoard/);
  assert.match(broker, /data-member-broker-page="true"/);
  assert.match(broker, /MemberAccountSetup/);
  assert.match(app, /path="tape"/);
  assert.match(app, /path="broker"/);
  assert.match(roles, /clean === "\/tape" \|\| clean === "\/broker"/);
  assert.match(nav, /data-apk-nav="member"/);
  assert.match(nav, /label: "Position"/);
  assert.match(nav, /label: "Orders"/);
  assert.match(nav, /label: "Broker"/);
  assert.match(nav, /data-apk-logout="true"/);
  assert.match(nav, /to: "\/positions"/);
  assert.match(nav, /to: "\/orders"/);
  assert.match(nav, /label: "Position & Orders", icon: FileText, admin: true/);
  assert.match(book, /data-member-positions-page="true"/);
  assert.match(book, /data-member-orders-page="true"/);
  assert.match(book, /data-member-report-download="pdf"/);
  const positionsBlock = book.slice(book.indexOf("export function MemberPositions"), book.indexOf("export function MemberReports"));
  const ordersBlock = book.slice(book.indexOf("export function MemberOrders"), book.indexOf("export function MemberPositions"));
  assert.match(positionsBlock, /data-member-report-download="pdf"/);
  assert.doesNotMatch(ordersBlock, /data-member-report-download="pdf"/);
});
