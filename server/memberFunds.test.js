import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("user home uses broker available and used, not the empty wallet topup", () => {
  const funds = fs.readFileSync(path.join(root, "src/lib/memberFunds.ts"), "utf8");
  const home = fs.readFileSync(path.join(root, "src/pages/UserHome.tsx"), "utf8");
  assert.match(funds, /brokerBalance/);
  assert.match(funds, /brokerUsed/);
  assert.match(funds, /capital: broker \+ usedAmt/);
  assert.match(funds, /available: Math.max\(0, broker\)/);
  assert.doesNotMatch(home, /memberBalance/);
  assert.match(home, /memberDeskFunds/);
  assert.match(home, /funds\.capital/);
  assert.match(home, /funds\.available/);
});
