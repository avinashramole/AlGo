import assert from "node:assert/strict";
import test from "node:test";
import { memberIndexQuote } from "./market.js";

test("memberIndexQuote drops VWAP and VIX", () => {
  assert.equal(memberIndexQuote({ symbol: "INDIA VIX", price: 13 }), null);
  const row = memberIndexQuote({
    symbol: "NIFTY 50",
    name: "NIFTY",
    price: 23779.15,
    change: 0,
    changePct: 0,
    spark: [1, 2, 3],
    future: 23866.1,
    futureExpiry: "2026-09-29",
    lot: 65,
    vwap: 23901.64,
    futureVwap: 23901.64,
    securityId: 13,
  });
  assert.equal(row.symbol, "NIFTY 50");
  assert.equal(row.future, 23866.1);
  assert.equal(row.lot, 65);
  assert.equal(row.vwap, undefined);
  assert.equal(row.futureVwap, undefined);
  assert.equal(row.securityId, undefined);
});

test("memberIndexQuote keeps Crude Oil cards", () => {
  const row = memberIndexQuote({
    symbol: "CRUDEOIL",
    name: "CRUDE OIL",
    price: 6124.5,
    change: 18.4,
    changePct: 0.3,
    spark: [6088, 6124],
    future: 6128,
    lot: 100,
    vwap: 6116.4,
  });
  assert.equal(row.symbol, "CRUDEOIL");
  assert.equal(row.future, 6128);
  assert.equal(row.lot, 100);
  assert.equal(row.vwap, undefined);
});
