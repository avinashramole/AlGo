import assert from "node:assert/strict";
import test from "node:test";
import { createAlgo, deleteAlgo, snapshot } from "./market.js";

test("createAlgo stays paused so Add strategy does not start LIVE", () => {
  const algo = createAlgo({ name: "Add strategy 504 test", kind: "indicator", indicator: "VWAP" });
  assert.equal(algo.enabled, false);
  assert.equal(algo.status, "PAUSED");
  const snap = snapshot();
  assert.equal(Object.hasOwn(snap, "liveCandles"), false);
  const found = (snap.algos || []).find((row) => row.id === algo.id);
  assert.ok(found);
  assert.equal(found.enabled, false);
  assert.equal(found.status, "PAUSED");
  deleteAlgo(algo.id);
});
