import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-bt-job-"));
process.env.T2S_BACKTEST_BUSY_FILE = path.join(dir, "backtest.busy");

const { clearBacktestBusy, isBacktestBusy, markBacktestBusy, runReplayInWorker } = await import("./backtestJob.js");

test("busy file is only live while a backtest is marked", () => {
  clearBacktestBusy();
  assert.equal(isBacktestBusy(), false);
  markBacktestBusy();
  assert.equal(isBacktestBusy(), true);
  clearBacktestBusy();
  assert.equal(isBacktestBusy(), false);
});

test("stale busy file does not block the next backtest", () => {
  markBacktestBusy();
  const stamp = Date.now() - 400_000;
  fs.utimesSync(process.env.T2S_BACKTEST_BUSY_FILE, stamp / 1000, stamp / 1000);
  assert.equal(isBacktestBusy(), false);
  clearBacktestBusy();
});

test("health-watch skips restart while backtest.busy is younger than 5 minutes", () => {
  const script = fs.readFileSync(new URL("../deploy/t2s-health-watch.sh", import.meta.url), "utf8");
  assert.match(script, /backtest\.busy/);
  assert.match(script, /lt 300/);
});

test("browser does not retry Run backtest after a gateway timeout", () => {
  const src = fs.readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8");
  assert.match(src, /\/algos\/\$\{id\}\/backtest/);
  assert.match(src, /retries:\s*1/);
});

test("indicator replay runs in a worker and returns a compact book", async () => {
  const T0 = Date.parse("2026-08-21T03:45:00.000Z");
  const candles = Array.from({ length: 80 }, (_, i) => {
    const close = 24000 + Math.sin(i / 4) * 25 + i * 0.8;
    return {
      time: T0 + i * 5 * 60_000,
      open: close - 2,
      high: close + 4,
      low: close - 4,
      close,
      volume: 1000 + i,
    };
  });
  const result = await runReplayInWorker({
    kind: "indicator",
    algo: { name: "EMA", indicator: "EMA", timeframe: "5m", fast: 9, slow: 21 },
    candles,
  });
  assert.equal(typeof result.pnl, "number");
  assert.equal(result.bars, 80);
  assert.equal(Array.isArray(result.book), true);
});
