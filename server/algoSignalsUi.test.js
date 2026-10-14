import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("first-candle card shows three condition dots and hides NO TRADE", () => {
  const page = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  assert.match(page, /data-first-candle-dots/);
  assert.match(page, /data-first-candle-buy/);
  assert.match(page, /ConditionDot/);
  assert.match(page, /BUY \{buy\}/);
  assert.match(page, /\^NO TRADE/);
});

test("Algo Live book shows only the two newest fills", () => {
  const feed = fs.readFileSync(path.join(root, "src/components/dashboard/SignalFeed.tsx"), "utf8");
  const live = fs.readFileSync(path.join(root, "server/liveSignals.js"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "deploy/update-website.sh"), "utf8");
  assert.match(feed, /data-algo-live-signals="recent-2"/);
  assert.equal(feed.includes('data-algo-live-signals="all"'), false);
  assert.equal(feed.includes("max-h-[min(70vh,44rem)]"), false);
  assert.match(live, /slice\(0, 2\)/);
  assert.equal(live.includes("slice(0, 80)"), false);
  assert.match(live, /isPreviewOrWaitSignal/);
  assert.match(deploy, /data-algo-live-signals="recent-2"/);
});
