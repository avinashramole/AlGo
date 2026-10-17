import assert from "node:assert/strict";
import test from "node:test";
import { CANDLE_ENTRY_RULE, candleAllowsEntry, candleQuality } from "./candleQuality.js";

test("doji and wick greater than body skip the entry candle", () => {
  assert.match(CANDLE_ENTRY_RULE, /last completed candle/);
  assert.match(CANDLE_ENTRY_RULE, /Skip doji/);
  assert.match(CANDLE_ENTRY_RULE, /wick/);
  const green = candleQuality({ open: 100, high: 108, low: 99, close: 107 });
  assert.equal(green.color, "green");
  assert.equal(green.usable, true);
  assert.equal(candleAllowsEntry({ open: 100, high: 108, low: 99, close: 107 }), true);
  const doji = candleQuality({ open: 100, high: 104, low: 96, close: 100 });
  assert.equal(doji.doji, true);
  assert.equal(doji.skipEntry, true);
  const upper = candleQuality({ open: 100, high: 120, low: 99, close: 108 });
  assert.equal(upper.upperWick > upper.body, true);
  assert.equal(upper.skipEntry, true);
  const lower = candleQuality({ open: 108, high: 109, low: 80, close: 100 });
  assert.equal(lower.lowerWick > lower.body, true);
  assert.equal(lower.skipEntry, true);
  assert.equal(candleAllowsEntry({ open: 108, high: 109, low: 80, close: 100 }), false);
  const equalWick = candleQuality({ open: 100, high: 108, low: 92, close: 108 });
  assert.equal(equalWick.lowerWick, equalWick.body);
  assert.equal(equalWick.usable, true);
});
