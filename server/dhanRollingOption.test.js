import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkDateRange,
  downloadRollingOptionRange,
  parseRollingPayload,
  rollingChainAt,
  rollingCoverage,
  rollingPremiumAt,
  wingLabels,
  wipeRollingOptions,
  writeRollingDay,
} from "./dhanRollingOption.js";

test("rolling helpers chunk dates and label wings", () => {
  const chunks = chunkDateRange("2024-01-01", "2024-02-10", 30);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].from, "2024-01-01");
  assert.equal(chunks[0].toExclusive, "2024-01-31");
  assert.equal(chunks[1].to, "2024-02-10");
  assert.equal(wingLabels(2).includes("ATM+2"), true);
  assert.equal(wingLabels(2).includes("ATM-2"), true);
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
  wipeRollingOptions();
});
