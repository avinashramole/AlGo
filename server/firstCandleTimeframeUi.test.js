import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Nifty and Crude edit form offers 5 10 15 30 60 and custom minutes", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(root, "src/lib/strategies.ts"), "utf8");
  assert.match(lib, /FIRST_CANDLE_TIMEFRAMES = \["5m", "10m", "15m", "30m", "60m"\]/);
  assert.match(builder, /data-first-candle-settings=\{crudeFirst \? "crude" : "nifty"\}/);
  assert.match(builder, /data-first-candle-timeframe="true"/);
  assert.match(builder, /FIRST_CANDLE_TIMEFRAMES, "custom"/);
  assert.match(builder, /data-first-candle-custom-minutes="true"/);
  assert.match(builder, /Custom minutes/);
  assert.match(builder, /Pick 5, 10, 15, 30, 60, or custom minutes/);
});
