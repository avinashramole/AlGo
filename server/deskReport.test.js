import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, lastTradingDayKeys, seedClosedTrades } from "./desk.js";

test("last trading days are 5 IST weekdays ending today, not a simulated week", () => {
  const monday = new Date("2026-10-12T08:30:00.000Z");
  const keys = lastTradingDayKeys(monday, 5);
  assert.deepEqual(keys, ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"]);
  assert.equal(keys.includes("2026-08-18"), false);
  assert.equal(keys.some((key) => key > "2026-10-12"), false);
});

test("Daily P&L keeps a real 5-day week and drops simulated seed trades", () => {
  const now = new Date("2026-10-12T08:30:00.000Z");
  const report = buildReport(
    {
      closedTrades: [
        ...seedClosedTrades(),
        {
          id: "live-1",
          symbol: "NIFTY 22450 CE",
          side: "BUY",
          qty: 65,
          pnl: 410,
          brokerId: "dhan",
          live: true,
          closedAt: "2026-10-09T09:40:00.000Z",
        },
        {
          id: "future-1",
          symbol: "NIFTY 22500 CE",
          side: "BUY",
          qty: 65,
          pnl: 999,
          brokerId: "dhan",
          live: true,
          closedAt: "2026-10-20T09:40:00.000Z",
        },
      ],
      positions: [],
      orders: [],
    },
    now,
  );
  assert.deepEqual(
    report.daily.map((row) => row.date),
    ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"],
  );
  assert.equal(report.daily.find((row) => row.date === "2026-10-09").pnl, 410);
  assert.equal(report.daily.find((row) => row.date === "2026-10-09").trades, 1);
  assert.equal(report.daily.some((row) => row.date.startsWith("2026-08")), false);
  assert.equal(report.daily.some((row) => row.date === "2026-10-20"), false);
});
