import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Reports hub opens Position first, then Orders, then Reports", () => {
  const hub = fs.readFileSync(path.join(root, "src/pages/ReportsHub.tsx"), "utf8");
  assert.match(hub, /data-reports-tabs="position-order-reports"/);
  assert.match(hub, /if \(value === "orders"\) return "orders";/);
  assert.match(hub, /if \(value === "reports"\) return "reports";/);
  assert.match(hub, /return "positions";/);
  const tabs = hub.split("desk-tabs")[1] || "";
  const position = tabs.indexOf("Position");
  const orders = tabs.indexOf("Orders");
  const reports = tabs.lastIndexOf("Reports");
  assert.ok(position >= 0 && orders > position && reports > orders);
});
