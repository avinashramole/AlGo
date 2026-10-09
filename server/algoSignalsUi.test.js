import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Algo Live book keeps the full signal list visible", () => {
  const feed = fs.readFileSync(path.join(root, "src/components/dashboard/SignalFeed.tsx"), "utf8");
  const live = fs.readFileSync(path.join(root, "server/liveSignals.js"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "deploy/update-website.sh"), "utf8");
  assert.match(feed, /data-algo-live-signals="all"/);
  assert.match(feed, /max-h-\[min\(70vh,44rem\)\]/);
  assert.match(feed, /overflow-y-auto/);
  assert.match(live, /slice\(0, 80\)/);
  assert.equal(live.includes(".slice(0, 20)"), false);
  assert.match(live, /signalLabel/);
  assert.match(deploy, /data-algo-live-signals="all"/);
});
