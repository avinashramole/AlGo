import assert from "node:assert/strict";
import test from "node:test";
import { ema, sessionVwap, sma } from "./chartIndicators.ts";

test("sma waits for a full window then rolls", () => {
  assert.deepEqual(sma([2, 4, 6, 8], 2), [null, 3, 5, 7]);
});

test("ema seeds from the first SMA then follows closes", () => {
  const values = [10, 12, 11, 13, 14];
  const out = ema(values, 3);
  assert.equal(out[0], null);
  assert.equal(out[1], null);
  assert.equal(out[2], 11);
  assert.ok(Math.abs(out[3] - 12) < 1e-9);
  assert.ok(Math.abs(out[4] - 13) < 1e-9);
});

test("session VWAP resets on a new IST day", () => {
  const candles = [
    { time: Date.parse("2026-04-06T03:45:00Z"), high: 100, low: 100, close: 100, volume: 10 },
    { time: Date.parse("2026-04-06T04:00:00Z"), high: 110, low: 110, close: 110, volume: 10 },
    { time: Date.parse("2026-04-06T18:45:00Z"), high: 200, low: 200, close: 200, volume: 10 },
  ];
  const out = sessionVwap(candles);
  assert.equal(out[0], 100);
  assert.equal(out[1], 105);
  assert.equal(out[2], 200);
});
