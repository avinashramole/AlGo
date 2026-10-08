import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TEST1 edit form lets the user pick 1m 2m 5m 10m 15m", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  assert.match(builder, /data-test1-timeframe=\{test1 \? "true"/);
  assert.match(builder, /disabled=\{\(engine && !firstCandle && !test1\) \|\| test2\}/);
  assert.match(builder, /value=\{reversal \|\| hedge \? "15m" : vwap \|\| test2 \? "5m" : form\.timeframe \|\| "5m"\}/);
  assert.equal(builder.includes("vwap || test1 || test2 ? \"5m\""), false);
  assert.equal(builder.includes("|| test1 || test2}"), false);
  assert.match(builder, /test1 \|\| test2 \|\| firstCandle \|\| crudeFirst \|\| niftyTest/);
  assert.match(builder, /\["1m", "2m", "5m", "10m", "15m"\]/);
  const test1Save = builder.split(": test1")[1]?.split(": crudeFirst")[0] || "";
  assert.match(test1Save, /timeframe: \["1m", "2m", "5m", "10m", "15m"\]\.includes/);
  assert.equal(test1Save.includes('timeframe: "5m"'), false);
});
