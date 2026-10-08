import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-1m-sync-"));
process.env.T2S_INDEX_HISTORY_DIR = dir;

const { wipeIndexHistory, saveIndexBars } = await import("./indexHistory.js");
const { oneMinuteSyncStatus, oneMinuteSyncWindow, syncOneMinuteIndexHistory } = await import("./indexHistorySync.js");

test("1m sync window is one year of IST dates", () => {
  const window = oneMinuteSyncWindow({ from: "2025-10-08", to: "2026-10-08" });
  assert.equal(window.from, "2025-10-08");
  assert.equal(window.to, "2026-10-08");
  assert.equal(window.years, 1);
});

test("1m sync fills missing symbols then a second run reuses disk", async () => {
  wipeIndexHistory();
  saveIndexBars(
    "NIFTY",
    [0, 1].map((i) => ({
      time: Date.parse("2026-08-21T03:45:00.000Z") + i * 60_000,
      open: 24800 + i,
      high: 24810 + i,
      low: 24790 + i,
      close: 24805 + i,
      volume: 10,
    })),
    { overwrite: true },
  );
  let calls = 0;
  const first = await syncOneMinuteIndexHistory({
    from: "2026-08-21",
    to: "2026-08-21",
    symbols: ["NIFTY", "BANKNIFTY"],
    fetchRange: async ({ symbol, timeframe }) => {
      calls += 1;
      assert.equal(timeframe, "1m");
      assert.equal(symbol, "BANKNIFTY");
      return [0, 1].map((i) => ({
        time: Date.parse("2026-08-21T03:45:00.000Z") + i * 60_000,
        open: 52000 + i,
        high: 52010 + i,
        low: 51990 + i,
        close: 52005 + i,
        volume: 4,
      }));
    },
  });
  assert.equal(calls, 1);
  assert.equal(first.fineEnough, true);
  assert.equal(first.symbols.find((row) => row.symbol === "NIFTY")?.fineEnough, true);
  assert.equal(first.symbols.find((row) => row.symbol === "BANKNIFTY")?.fineEnough, true);
  let extra = 0;
  const second = await syncOneMinuteIndexHistory({
    from: "2026-08-21",
    to: "2026-08-21",
    symbols: ["NIFTY", "BANKNIFTY"],
    fetchRange: async () => {
      extra += 1;
      throw new Error("should reuse stored 1m");
    },
  });
  assert.equal(extra, 0);
  assert.equal(second.fineEnough, true);
  const status = await oneMinuteSyncStatus({ from: "2026-08-21", to: "2026-08-21", symbols: ["NIFTY", "BANKNIFTY"] });
  assert.equal(status.job.running, false);
  assert.equal(status.storedDays >= 2, true);
});
