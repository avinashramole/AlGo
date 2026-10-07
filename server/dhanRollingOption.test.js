import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkDateRange,
  downloadRollingOptionRange,
  dropEmptyRollingDays,
  isWeekendYmd,
  needsRollingFetch,
  parseRollingPayload,
  rollingChainAt,
  rollingContract,
  rollingCoverage,
  rollingDayStatus,
  rollingPremiumAt,
  wingLabels,
  wipeRollingOptions,
  writeRollingDay,
} from "./dhanRollingOption.js";

test("rollingContract maps index scripts to Dhan rolling ids", () => {
  assert.equal(rollingContract("NIFTY")?.securityId, 13);
  assert.equal(rollingContract("BANKNIFTY")?.securityId, 25);
  assert.equal(rollingContract("SENSEX")?.exchangeSegment, "BSE_FNO");
  assert.equal(rollingContract("CRUDEOIL"), null);
});

test("rolling helpers chunk dates and label wings", () => {
  const chunks = chunkDateRange("2024-01-01", "2024-02-10", 30);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].from, "2024-01-01");
  assert.equal(chunks[0].toExclusive, "2024-01-31");
  assert.equal(chunks[1].to, "2024-02-10");
  assert.equal(wingLabels(2).includes("ATM+2"), true);
  assert.equal(wingLabels(2).includes("ATM-2"), true);
});

test("empty rolling stubs are not treated as stored tape", () => {
  wipeRollingOptions();
  writeRollingDay("NIFTY", "2026-09-01", {
    empty: true,
    weekly: { slots: [] },
    monthly: { slots: [] },
    source: "dhan-rolling-empty",
  });
  assert.equal(rollingDayStatus("NIFTY", "2026-09-01"), "empty");
  assert.equal(needsRollingFetch("NIFTY", "2026-09-01"), true);
  assert.equal(rollingCoverage("NIFTY", "2026-09-01", "2026-09-01"), "synth");
  assert.equal(dropEmptyRollingDays("NIFTY"), 1);
  assert.equal(rollingDayStatus("NIFTY", "2026-09-01"), "missing");
  wipeRollingOptions();
});

test("parseRollingPayload reads CE bars", () => {
  const bars = parseRollingPayload(
    {
      data: {
        ce: {
          timestamp: [1_725_500_100, 1_725_500_200],
          close: [82.5, 79],
          high: [84, 80],
          low: [80, 78],
          strike: [24600, 24600],
          spot: [24510, 24520],
        },
      },
    },
    "CE",
  );
  assert.equal(bars.length, 2);
  assert.equal(bars[0].strike, 24600);
  assert.equal(bars[0].c, 82.5);
  const alias = parseRollingPayload(
    {
      data: {
        CALL: {
          timestamp: [1_725_500_100],
          close: [80],
          strikePrice: [24600],
          spotPrice: [24500],
        },
      },
    },
    "CE",
  );
  assert.equal(alias[0].strike, 24600);
  assert.equal(alias[0].c, 80);
});

test("rolling chain lookup and coverage", () => {
  wipeRollingOptions();
  const t = Date.parse("2026-09-01T04:05:00.000Z");
  writeRollingDay("NIFTY", "2026-09-01", {
    weekly: {
      slots: [{ t, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21, ceL: 20, peL: 19 }] }],
    },
    monthly: {
      slots: [{ t, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90, ceL: 80, peL: 82 }] }],
    },
  });
  const weekly = rollingChainAt({ ymd: "2026-09-01", time: t, kind: "weekly" });
  assert.equal(weekly[0].callLtp, 22);
  assert.equal(rollingPremiumAt({ ymd: "2026-09-01", time: t, strike: 24600, option: "CE", kind: "monthly" }), 88);
  assert.equal(rollingCoverage("NIFTY", "2026-09-01", "2026-09-02"), "mixed");
  wipeRollingOptions();
});

test("downloadRollingOptionRange writes merged weekly and monthly days", async () => {
  wipeRollingOptions();
  const t = Math.floor(Date.parse("2026-09-01T04:05:00.000Z") / 1000);
  const result = await downloadRollingOptionRange({
    from: "2026-09-01",
    to: "2026-09-01",
    delayMs: 0,
    wings: 1,
    fetchRolling: async ({ expiryFlag, option }) => ({
      data: {
        ce:
          option === "CE"
            ? {
                timestamp: [t],
                close: [expiryFlag === "MONTH" ? 90 : 24],
                high: [92],
                low: [88],
                strike: [expiryFlag === "MONTH" ? 24600 : 24700],
                spot: [24500],
              }
            : null,
        pe:
          option === "PE"
            ? {
                timestamp: [t],
                close: [expiryFlag === "MONTH" ? 91 : 23],
                high: [93],
                low: [87],
                strike: [expiryFlag === "MONTH" ? 24400 : 24300],
                spot: [24500],
              }
            : null,
      },
    }),
  });
  assert.equal(result.days, 1);
  assert.equal(result.source, "dhan-rolling");
  const monthly = rollingChainAt({ ymd: "2026-09-01", time: t * 1000, kind: "monthly" });
  assert.equal(monthly.some((row) => row.strike === 24600 && row.callLtp === 90), true);
  const reused = await downloadRollingOptionRange({
    from: "2026-09-01",
    to: "2026-09-01",
    delayMs: 0,
    wings: 1,
    fetchRolling: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.calls, 0);
  wipeRollingOptions();
});

test("weekends do not force a re-download and stored chunks are skipped", async () => {
  wipeRollingOptions();
  assert.equal(isWeekendYmd("2026-09-05"), true);
  assert.equal(isWeekendYmd("2026-09-01"), false);
  const t = Date.parse("2026-09-01T04:05:00.000Z");
  writeRollingDay("NIFTY", "2026-09-01", {
    weekly: { slots: [{ t, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21 }] }] },
    monthly: { slots: [{ t, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90 }] }] },
  });
  writeRollingDay("NIFTY", "2026-09-02", {
    weekly: { slots: [{ t, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21 }] }] },
    monthly: { slots: [{ t, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90 }] }] },
  });
  writeRollingDay("NIFTY", "2026-09-03", {
    weekly: { slots: [{ t, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21 }] }] },
    monthly: { slots: [{ t, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90 }] }] },
  });
  writeRollingDay("NIFTY", "2026-09-04", {
    weekly: { slots: [{ t, spot: 24500, rows: [{ s: 24700, ce: 22, pe: 21 }] }] },
    monthly: { slots: [{ t, spot: 24500, rows: [{ s: 24600, ce: 88, pe: 90 }] }] },
  });
  assert.equal(rollingDayStatus("NIFTY", "2026-09-01"), "complete");
  assert.equal(rollingCoverage("NIFTY", "2026-09-01", "2026-09-06"), "stored");
  let calls = 0;
  const reused = await downloadRollingOptionRange({
    from: "2026-09-01",
    to: "2026-09-06",
    delayMs: 0,
    wings: 1,
    fetchRolling: async () => {
      calls += 1;
      throw new Error("should not fetch stored weekdays");
    },
  });
  assert.equal(calls, 0);
  assert.equal(reused.reused, true);
  assert.equal(reused.reusedDays >= 4, true);
  wipeRollingOptions();
});

test("failed Dhan rolling calls do not stub empty days as stored", async () => {
  wipeRollingOptions();
  const result = await downloadRollingOptionRange({
    from: "2026-09-01",
    to: "2026-09-01",
    delayMs: 0,
    wings: 1,
    fetchRolling: async () => null,
  });
  assert.equal(result.days, 0);
  assert.equal(result.source, "none");
  assert.equal(rollingCoverage("NIFTY", "2026-09-01", "2026-09-01"), "synth");
  wipeRollingOptions();
});

test("BANKNIFTY rolling download uses security id 25 and keeps weekly tape when monthly is late", async () => {
  wipeRollingOptions();
  const t = Math.floor(Date.parse("2026-09-01T04:05:00.000Z") / 1000);
  const seen = [];
  const result = await downloadRollingOptionRange({
    symbol: "BANKNIFTY",
    from: "2026-09-01",
    to: "2026-09-01",
    delayMs: 0,
    wings: 1,
    fetchRolling: async (args) => {
      seen.push(args);
      if (args.expiryFlag === "MONTH") return null;
      return {
        data: {
          ce: {
            timestamp: [t],
            close: [24],
            high: [25],
            low: [23],
            strike: [57600],
            spot: [57650],
          },
        },
      };
    },
  });
  assert.equal(result.securityId, 25);
  assert.equal(seen.every((row) => row.securityId === 25), true);
  assert.equal(result.days, 1);
  assert.equal(rollingDayStatus("BANKNIFTY", "2026-09-01"), "partial");
  assert.equal(rollingCoverage("BANKNIFTY", "2026-09-01", "2026-09-01"), "synth");
  wipeRollingOptions();
});
