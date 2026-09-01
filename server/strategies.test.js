import assert from "node:assert/strict";
import test from "node:test";
import { formatConditionGroup, normalizeAlgo } from "./strategies.js";

test("normalizeAlgo keeps AND/OR condition rows and mirrors the first BUY row", () => {
  const algo = normalizeAlgo({
    name: "Multi VWAP",
    kind: "indicator",
    indicator: "VWAP",
    buyConditions: {
      join: "or",
      rows: [
        { left: "price", op: "close_above", right: "vwap" },
        { left: "rsi", op: "lt", right: "value", value: 30 },
      ],
    },
    sellConditions: {
      join: "and",
      rows: [
        { left: "price", op: "close_below", right: "vwap" },
        { left: "rsi", op: "gt", right: "value", value: 70 },
      ],
    },
  });
  assert.equal(algo.enabled, false);
  assert.equal(algo.buyConditions.join, "or");
  assert.equal(algo.buyConditions.rows.length, 2);
  assert.equal(algo.buyLeft, "price");
  assert.equal(algo.buyOp, "close_above");
  assert.equal(algo.sellConditions.join, "and");
  assert.equal(algo.sellConditions.rows.length, 2);
  assert.equal(algo.sellConditions.rows[1].value, 70);
  assert.match(algo.summary, /OR/);
});

test("formatConditionGroup joins rows with AND or OR", () => {
  assert.equal(
    formatConditionGroup({
      join: "or",
      rows: [
        { left: "price", op: "close_above", right: "vwap", value: 0 },
        { left: "rsi", op: "lt", right: "value", value: 30 },
      ],
    }),
    "Price close above VWAP OR RSI < 30",
  );
});
