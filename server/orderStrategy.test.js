import assert from "node:assert/strict";
import test from "node:test";
import { orderCorrelationId, resolveOrderStrategy, strategyFromCorrelation } from "./orderStrategy.js";

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
