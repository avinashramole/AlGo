import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  canonicalStrategyName,
  clearOrderStrategyMemory,
  orderCorrelationId,
  resolveOrderStrategy,
  strategyFromCorrelation,
} from "./orderStrategy.js";

beforeEach(() => {
  clearOrderStrategyMemory();
});

const hedgeAlgo = {
  id: "a6",
  name: "NIFTY 15m VWAP hedge",
  kind: "nifty-vwap-hedge",
  enabled: true,
  hedgeState: { phase: "MONITOR_PRIMARY", primarySide: "CE", inFlight: false, primaryEntryPrice: 120 },
};

test("correlation id carries the strategy name and maps back", () => {
  const id = orderCorrelationId({ strategy: "NIFTY 15m VWAP hedge" });
  assert.equal(id, "NIFTY-15m-VWAP-hedge");
  assert.ok(id.length <= 25);
  assert.equal(
    strategyFromCorrelation(id, [{ id: "a6", name: "NIFTY 15m VWAP hedge" }]),
    "NIFTY 15m VWAP hedge",
  );
  assert.equal(strategyFromCorrelation("t2s1770000000"), "");
});

test("Dhan refresh keeps the local strategy name on the same order id", () => {
  const name = resolveOrderStrategy(
    { id: "123", symbol: "NIFTY-24500-CE", strategy: "", correlationId: "t2s1" },
    { previous: [{ id: "123", strategy: "NIFTY 15m VWAP hedge" }] },
  );
  assert.equal(name, "NIFTY 15m VWAP hedge");
});

test("open position can inherit the unique strategy that holds that contract", () => {
  const name = resolveOrderStrategy(
    { id: "pos-9", symbol: "NIFTY 24500 CE", strategy: "" },
    {
      forPosition: true,
      orders: [{ symbol: "NIFTY 24500 CE", strategy: "NIFTY VWAP ATM" }],
    },
  );
  assert.equal(name, "NIFTY VWAP ATM");
});

test("Manual and Auto are not treated as a strategy name", () => {
  assert.equal(resolveOrderStrategy({ id: "1", symbol: "NIFTY 24500 CE", strategy: "Manual" }), "");
  assert.equal(resolveOrderStrategy({ id: "2", symbol: "NIFTY 24600 PE", strategy: "Auto" }), "");
});

test("each order keeps the strategy that placed it", () => {
  assert.equal(
    resolveOrderStrategy({ id: "h1", symbol: "NIFTY 24500 CE", strategy: "NIFTY 15m VWAP hedge" }),
    "NIFTY 15m VWAP hedge",
  );
  assert.equal(
    resolveOrderStrategy({ id: "r1", symbol: "NIFTY 24500 PE", strategy: "NIFTY 15m VWAP reversal" }),
    "NIFTY 15m VWAP reversal",
  );
  assert.equal(
    resolveOrderStrategy({ id: "a1", symbol: "NIFTY 24600 CE", strategy: "NIFTY VWAP ATM" }),
    "NIFTY VWAP ATM",
  );
});

test("does not copy one strategy name onto every NIFTY order", () => {
  const name = resolveOrderStrategy(
    { id: "new", symbol: "NIFTY 24500 CE", strategy: "", correlationId: "" },
    {
      previous: [{ id: "old", symbol: "NIFTY 24500 CE", side: "BUY", strategy: "NIFTY 15m VWAP hedge" }],
      algos: [hedgeAlgo],
    },
  );
  assert.equal(name, "");
});

test("pending in-flight order can take the one algo that is waiting on a fill", () => {
  const name = resolveOrderStrategy(
    { id: "dhan-88", symbol: "NIFTY-SEP2026-24500-CE", strategy: "", status: "PENDING" },
    { algos: [{ ...hedgeAlgo, hedgeState: { ...hedgeAlgo.hedgeState, inFlight: true } }] },
  );
  assert.equal(name, "NIFTY 15m VWAP hedge");
});

test("remembered order id keeps NIFTY 15m VWAP hedge after Dhan strips the field", () => {
  resolveOrderStrategy(
    { id: "555", symbol: "NIFTY 24500 CE", strategy: "NIFTY 15m VWAP hedge" },
    { algos: [hedgeAlgo] },
  );
  const name = resolveOrderStrategy(
    { id: "555", symbol: "NIFTY 24500 CE", strategy: "", correlationId: "" },
    { algos: [{ ...hedgeAlgo, enabled: false, hedgeState: { phase: "IDLE" } }] },
  );
  assert.equal(name, "NIFTY 15m VWAP hedge");
});

test("display name is the actual algo name, not a shared label", () => {
  const algos = [
    { id: "a4", name: "NIFTY VWAP ATM" },
    { id: "a5", name: "NIFTY 15m VWAP reversal" },
    { id: "a6", name: "NIFTY 15m VWAP hedge" },
  ];
  assert.equal(canonicalStrategyName("NIFTY-VWAP-ATM", algos), "NIFTY VWAP ATM");
  assert.equal(canonicalStrategyName("a5", algos), "NIFTY 15m VWAP reversal");
  assert.equal(canonicalStrategyName("NIFTY 15m VWAP hedge", algos), "NIFTY 15m VWAP hedge");
  assert.equal(canonicalStrategyName("NIFTY VWAP ATM", algos), "NIFTY VWAP ATM");
});
