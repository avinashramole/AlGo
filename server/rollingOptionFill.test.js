import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-rolling-1m-"));
process.env.T2S_NIFTY_ROLLING_DIR = path.join(dir, "nifty-rolling-options");

const {
  downloadRollingOptionRange,
  rollingDayStatus,
  rollingOptionDir,
  wipeRollingOptions,
  writeRollingDay,
} = await import("./dhanRollingOption.js");
const {
  resetRollingFillState,
  rollingFillStatus,
  rollingFillWindow,
  stepRollingOptionFill,
} = await import("./rollingOptionFill.js");

test("1m rolling files stay out of the 15m TEST2 folder", async () => {
  wipeRollingOptions();
  const t = Math.floor(Date.parse("2026-09-01T04:05:00.000Z") / 1000);
  const result = await downloadRollingOptionRange({
    from: "2026-09-01",
    to: "2026-09-01",
    interval: 1,
    delayMs: 0,
    wings: 1,
    fetchRolling: async ({ interval }) => {
      assert.equal(interval, 1);
      return {
        data: {
          ce: { timestamp: [t], close: [24], high: [25], low: [23], strike: [24700], spot: [24500] },
          pe: { timestamp: [t], close: [23], high: [24], low: [22], strike: [24700], spot: [24500] },
        },
      };
    },
  });
  assert.equal(result.interval, 1);
  assert.equal(result.days, 1);
  assert.equal(rollingDayStatus("NIFTY", "2026-09-01", 1), "complete");
  assert.equal(rollingDayStatus("NIFTY", "2026-09-01", 15), "missing");
  assert.match(rollingOptionDir(1), /-1m$/);
  assert.equal(rollingOptionDir(1).includes("-15m"), false);
  wipeRollingOptions();
});

test("background fill walks each NSE index for one year of 1m OHLC", async () => {
  wipeRollingOptions();
  resetRollingFillState();
  const now = new Date("2026-10-08T06:00:00.000Z");
  const window = rollingFillWindow(now, 1);
  assert.equal(window.to, "2026-10-08");
  assert.equal(window.from, "2025-10-08");
  const t = Math.floor(Date.parse("2026-10-08T04:05:00.000Z") / 1000);
  const seen = [];
  const fillDay = (symbol, ymd) =>
    writeRollingDay(
      symbol,
      ymd,
      {
        weekly: { slots: [{ t: t * 1000, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21 }] }] },
        monthly: { slots: [{ t: t * 1000, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90 }] }] },
      },
      1,
    );
  let cursor = window.from;
  while (cursor < "2026-10-08") {
    for (const symbol of ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]) fillDay(symbol, cursor);
    const [year, month, day] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  const first = await stepRollingOptionFill({
    now,
    isLive: () => true,
    busy: () => false,
    deadlineMs: 20_000,
    delayMs: 0,
    fetchRolling: async (args) => {
      seen.push(args);
      return {
        data: {
          ce: { timestamp: [t], close: [24], high: [25], low: [23], strike: [24700], spot: [24500] },
          pe: { timestamp: [t], close: [23], high: [24], low: [22], strike: [24700], spot: [24500] },
        },
      };
    },
  });
  assert.equal(first.interval, "1m");
  assert.equal(first.from, "2025-10-08");
  assert.equal(first.to, "2026-10-08");
  assert.ok(seen.length);
  assert.equal(seen.every((row) => row.interval === 1), true);
  assert.equal(seen[0].securityId, 13);
  assert.equal(first.indexes.find((row) => row.symbol === "NIFTY").coverage, "stored");
  wipeRollingOptions();
  resetRollingFillState();
});

test("rolling fill waits when Dhan is down or a backtest is busy", async () => {
  resetRollingFillState();
  const down = await stepRollingOptionFill({
    isLive: () => false,
    fetchRolling: async () => null,
  });
  assert.equal(down.error, "Dhan not live");
  const busy = await stepRollingOptionFill({
    isLive: () => true,
    busy: () => true,
    fetchRolling: async () => null,
  });
  assert.match(busy.error, /backtest/);
  resetRollingFillState();
});
