import assert from "node:assert/strict";
import test from "node:test";
import { memberIndexQuote, optionContractFromSymbol } from "./market.js";

test("memberIndexQuote drops VWAP but keeps India VIX", () => {
  const vix = memberIndexQuote({ symbol: "INDIA VIX", name: "VIX", price: 13.2, change: 0.1, changePct: 0.76 });
  assert.equal(vix.symbol, "INDIA VIX");
  assert.equal(vix.price, 13.2);
  assert.equal(vix.vwap, undefined);
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

test("Kotak compact option symbols keep the strike for live LTP", () => {
  assert.deepEqual(optionContractFromSymbol("NIFTY26O0622850CE"), { index: "NIFTY", strike: 22850, opt: "CE" });
  assert.deepEqual(optionContractFromSymbol("NIFTY26OCT22500PE"), { index: "NIFTY", strike: 22500, opt: "PE" });
  assert.deepEqual(optionContractFromSymbol("NIFTY2691524500CE"), { index: "NIFTY", strike: 24500, opt: "CE" });
  assert.deepEqual(optionContractFromSymbol("NIFTY 22850 CE"), { index: "NIFTY", strike: 22850, opt: "CE" });
});
