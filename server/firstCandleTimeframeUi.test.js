import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Nifty and Crude cards and edit forms offer 5 10 15 30 60 and custom minutes", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const bar = fs.readFileSync(path.join(root, "src/components/dashboard/FirstCandleTimeframeBar.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(root, "src/lib/strategies.ts"), "utf8");
  assert.match(lib, /FIRST_CANDLE_TIMEFRAMES = \["5m", "10m", "15m", "30m", "60m"\]/);
  assert.match(bar, /FIRST_CANDLE_TIMEFRAMES, "custom"/);
  assert.match(bar, /data-first-candle-timeframe-bar/);
  assert.match(bar, /data-first-candle-custom-minutes="true"/);
  assert.match(builder, /FirstCandleTimeframeBar/);
  assert.match(builder, /mark=\{crudeFirst \? "crude" : "nifty"\}/);
  assert.match(page, /<CardTimeframe algo=\{algo\} \/>/);
  assert.match(page, /isCrudeFirstCandleKind\(algo\) \|\| isNiftyFirstCandleKind\(algo\) \? <CardTimeframe/);
  assert.match(page, /mark=\{isCrudeFirstCandleKind\(algo\) \? "crude" : "nifty"\}/);
});
