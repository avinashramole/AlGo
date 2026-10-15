import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Nifty and Crude cards and edit forms offer 5m 15m 30m 1hr and custom 1-60", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const bar = fs.readFileSync(path.join(root, "src/components/dashboard/FirstCandleTimeframeBar.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(root, "src/lib/strategies.ts"), "utf8");
  const mobile = fs.readFileSync(path.join(root, "mobile/src/screens/AlgoScreen.tsx"), "utf8");
  assert.match(lib, /DESK_TIMEFRAME_PRESETS = \["5m", "15m", "30m", "1H"\]/);
  assert.match(lib, /FIRST_CANDLE_TIMEFRAMES = DESK_TIMEFRAME_PRESETS/);
  assert.match(bar, /DESK_TIMEFRAME_PRESETS, "custom"/);
  assert.match(bar, /data-first-candle-timeframe-bar/);
  assert.match(bar, /data-desk-timeframe-bar/);
  assert.match(bar, /data-first-candle-custom-minutes="true"/);
  assert.match(bar, /max=\{60\}/);
  assert.match(bar, /1hr/);
  assert.match(builder, /FirstCandleTimeframeBar/);
  assert.match(builder, /mark=\{crudeFirst \? "crude" : firstCandle \? "nifty"/);
  assert.ok((builder.match(/<FirstCandleTimeframeBar/g) || []).length >= 1);
  assert.doesNotMatch(builder, /data-first-candle-lots-timeframe/);
  assert.doesNotMatch(builder, /data-first-candle-timeframe="true"/);
  assert.match(lib, /export function showsFirstCandleTimeframe/);
  assert.match(page, /<CardTimeframe algo=\{algo\} \/>/);
  assert.match(page, /showsFirstCandleTimeframe\(algo\) \? <CardTimeframe/);
  assert.match(page, /mark=\{isCrudeFirstCandleKind\(algo\) \? "crude" : "nifty"\}/);
  assert.match(mobile, /FIRST_CANDLE_TIMEFRAMES = \["5m", "15m", "30m", "1H"\]/);
  assert.match(mobile, /function FirstCandleTfChips/);
  assert.match(mobile, /isFirstCandleKind\(draft\.kind\)/);
  assert.match(mobile, /isFirstCandleKind\(algo\.kind\)/);
});
