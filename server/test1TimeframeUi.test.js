import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TEST1 edit form uses the shared 5m 15m 30m 1hr custom picker", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const bar = fs.readFileSync(path.join(root, "src/components/dashboard/FirstCandleTimeframeBar.tsx"), "utf8");
  assert.match(bar, /data-test1-timeframe=\{mark === "test1" \? "true"/);
  assert.match(builder, /mark=\{crudeFirst \? "crude" : firstCandle \? "nifty" : test1 \? "test1"/);
  assert.match(builder, /firstCandleTimeframeValue\(String\(form\.timeframe \|\| "5m"\)\)/);
  assert.doesNotMatch(builder, /\["1m", "2m", "5m", "10m", "15m"\]/);
});
