import assert from "node:assert/strict";
import test from "node:test";
import { replaceDhanBook, snapshot } from "./market.js";

test("vanished live Dhan positions stay on the book as closed P&L and MTM", () => {
  const id = `dhan-pos-closed-${Date.now()}`;
  replaceDhanBook([
    {
      id,
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 100,
      ltp: 108,
      pnl: 520,
      product: "MIS",
      brokerId: "dhan",
      live: true,
      sim: false,
    },
  ]);
  replaceDhanBook([]);
  const snap = snapshot();
  const closed = (snap.closedTrades || []).find((row) => row.sourcePositionId === id);
  assert.ok(closed);
  assert.equal(closed.symbol, "NIFTY 24600 CE");
  assert.equal(closed.qty, 65);
  assert.equal(closed.entry, 100);
  assert.equal(closed.exit, 108);
  assert.equal(closed.pnl, 520);
  assert.equal(closed.live, true);
  assert.equal((snap.positions || []).some((row) => row.id === id), false);
  replaceDhanBook([
    {
      id,
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 100,
      ltp: 108,
      pnl: 520,
      product: "MIS",
      brokerId: "dhan",
      live: true,
      sim: false,
    },
  ]);
  const reopened = snapshot();
  assert.equal((reopened.closedTrades || []).some((row) => row.sourcePositionId === id), false);
  replaceDhanBook([]);
});
