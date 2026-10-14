import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { showsStrategyTimeframe, strategyTimeframeValue } from "../src/lib/strategies.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every strategy card uses one 5 10 15 30 60 custom picker", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const bar = fs.readFileSync(path.join(root, "src/components/dashboard/FirstCandleTimeframeBar.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(root, "src/lib/strategies.ts"), "utf8");
  const mobile = fs.readFileSync(path.join(root, "mobile/src/screens/AlgoScreen.tsx"), "utf8");
  assert.match(lib, /FIRST_CANDLE_TIMEFRAMES = \["5m", "10m", "15m", "30m", "60m"\]/);
  assert.match(lib, /export function showsFirstCandleTimeframe/);
  assert.match(lib, /export function showsStrategyTimeframe/);
  assert.match(lib, /export function strategyTimeframeValue/);
  assert.match(bar, /FIRST_CANDLE_TIMEFRAMES, "custom"/);
  assert.match(bar, /data-first-candle-timeframe-bar/);
  assert.match(bar, /data-first-candle-custom-minutes="true"/);
  assert.match(builder, /FirstCandleTimeframeBar/);
  assert.match(builder, /mark=\{crudeFirst \? "crude" : "nifty"\}/);
  assert.equal((builder.match(/<FirstCandleTimeframeBar/g) || []).length, 1);
  assert.match(builder, /editing \? null : \(/);
  assert.match(builder, /data-test1-timeframe=\{test1 \? "true"/);
  assert.match(builder, /data-mir-timeframe=\{mir \? "true"/);
  assert.doesNotMatch(builder, /data-first-candle-lots-timeframe/);
  assert.doesNotMatch(builder, /data-first-candle-timeframe="true"/);
  assert.doesNotMatch(builder, /<select[\s\S]{0,400}data-test1-timeframe/);
  assert.doesNotMatch(builder, />\s*Timeframe\s*<select/);
  assert.match(page, /<CardTimeframe algo=\{algo\} \/>/);
  assert.match(page, /showsStrategyTimeframe\(algo\) \? <CardTimeframe/);
  assert.match(page, /mark=\{isCrudeFirstCandleKind\(algo\) \? "crude" : "nifty"\}/);
  assert.match(builder, /firstCandleTf \? \(/);
  assert.match(mobile, /FIRST_CANDLE_TIMEFRAMES = \["5m", "10m", "15m", "30m", "60m"\]/);
  assert.match(mobile, /function FirstCandleTfChips/);
  assert.match(mobile, /draft\.id \? null : \(/);
  assert.match(mobile, /<FirstCandleTfChips/);
  assert.equal((mobile.match(/<FirstCandleTfChips/g) || []).length, 2);
});

test("every strategy kind uses the same card timeframe helper", () => {
  assert.equal(showsStrategyTimeframe({ kind: "nifty-first-candle" }), true);
  assert.equal(showsStrategyTimeframe({ kind: "crude-first-candle" }), true);
  assert.equal(showsStrategyTimeframe({ kind: "nifty-test1" }), true);
  assert.equal(showsStrategyTimeframe({ kind: "multi-index-reversal" }), true);
  assert.equal(showsStrategyTimeframe({ kind: "nifty-test2" }), true);
  assert.equal(strategyTimeframeValue({ kind: "multi-index-reversal" }, "60m"), "1H");
  assert.equal(strategyTimeframeValue({ kind: "nifty-first-candle" }, "30m"), "30m");
  assert.equal(strategyTimeframeValue({ kind: "nifty-test1" }, "15m"), "15m");
});
