import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
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

test("blank Dhan order inherits strategy from a matching position", () => {
  const name = resolveOrderStrategy(
    { id: "9", symbol: "NIFTY 24500 CE", strategy: "" },
    { positions: [{ symbol: "NIFTY 24500 CE", strategy: "NIFTY VWAP ATM" }] },
  );
  assert.equal(name, "NIFTY VWAP ATM");
});

test("Manual and Auto are not kept as strategy names", () => {
  const name = resolveOrderStrategy(
    { id: "1", symbol: "NIFTY 24500 CE", strategy: "Manual" },
    { algos: [hedgeAlgo] },
  );
  assert.equal(name, "NIFTY 15m VWAP hedge");
  assert.equal(
    resolveOrderStrategy({ id: "2", symbol: "NIFTY 24600 PE", strategy: "Auto" }, { algos: [hedgeAlgo] }),
    "NIFTY 15m VWAP hedge",
  );
});

test("NIFTY option orders take the hedge algo name when that engine is running", () => {
  const name = resolveOrderStrategy(
    { id: "dhan-88", symbol: "NIFTY-SEP2026-24500-CE", strategy: "", correlationId: "" },
    { algos: [hedgeAlgo] },
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
