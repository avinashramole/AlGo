import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("User desk uses the same type and padding sizes as the admin desk", () => {
  const book = fs.readFileSync(path.join(root, "src/pages/MemberBook.tsx"), "utf8");
  const orders = fs.readFileSync(path.join(root, "src/pages/Orders.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(root, "src/pages/Settings.tsx"), "utf8");
  const memberSettings = fs.readFileSync(path.join(root, "src/pages/MemberSettings.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(root, "src/pages/Profile.tsx"), "utf8");
  const setup = fs.readFileSync(path.join(root, "src/components/desk/MemberAccountSetup.tsx"), "utf8");
  const plans = fs.readFileSync(path.join(root, "src/pages/MemberPlans.tsx"), "utf8");
  const memberTape = fs.readFileSync(path.join(root, "src/components/dashboard/MemberIndexBoard.tsx"), "utf8");
  const adminTape = fs.readFileSync(path.join(root, "src/components/dashboard/TickerStrip.tsx"), "utf8");

  assert.match(orders, /card p-4/);
  assert.match(orders, /text-2xl font-bold/);
  assert.match(book, /card p-4/);
  assert.match(book, /text-2xl font-bold/);
  assert.match(book, /PhoneCard className="p-4"/);
  assert.doesNotMatch(book, /className="p-3"/);
  assert.doesNotMatch(book, /block text-lg/);

  assert.match(settings, /max-w-2xl/);
  assert.doesNotMatch(settings, /Open broker hub/);
  assert.doesNotMatch(settings, /to="\/brokers"/);
  assert.match(memberSettings, /max-w-2xl/);
  assert.match(memberSettings, /text-xl font-bold/);
  assert.doesNotMatch(memberSettings, /desk-page/);
  const passwordCard = fs.readFileSync(path.join(root, "src/components/desk/LoginPasswordCard.tsx"), "utf8");
  assert.match(passwordCard, /h-10 w-full rounded-lg/);

  assert.match(profile, /h-10 w-full rounded-lg/);
  assert.match(profile, /text-sm font-normal/);
  assert.match(setup, /h-10 w-full rounded-lg/);
  assert.match(setup, /text-sm font-normal/);
  assert.match(setup, /card space-y-3 p-4/);

  assert.match(plans, /text-xl font-extrabold text-up/);
  assert.match(adminTape, /text-lg font-extrabold leading-none/);
  assert.match(memberTape, /<TapeTodayChange/);
  assert.doesNotMatch(memberTape, /detail=\{<TapeTodayChange/);
});
