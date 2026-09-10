import assert from "node:assert/strict";
import test from "node:test";
import { isOptionContract, isSaneOptionLtp, markContractToMarket, preferMarkLtp } from "./positionMark.js";

test("Dhan expiry-style option symbols are options", () => {
  assert.equal(isOptionContract("NIFTY 10 SEP 23450 PE"), true);
  assert.equal(isOptionContract("NIFTY 23450 CE"), true);
  assert.equal(isOptionContract("NIFTY 50"), false);
});

test("NIFTY spot is not a sane option premium", () => {
  assert.equal(isSaneOptionLtp(23403.4, 96.71), false);
  assert.equal(isSaneOptionLtp(91.48, 96.71), true);
});

test("Live MTM uses broker option P&L instead of index minus fill", () => {
  const row = markContractToMarket(
    {
      symbol: "NIFTY 10 SEP 23450 PE",
      type: "BUY",
      qty: 65,
      avg: 96.71,
      option: "PE",
      brokerPnl: -340.15,
      brokerLtp: 91.48,
    },
    23403.4,
  );
  assert.equal(row.pnl, -340.15);
  assert.equal(row.ltp, 91.48);
  assert.ok(Math.abs(row.pnl) < 100000);
});

test("sane option LTP marks (premium - avg) * qty", () => {
  const row = markContractToMarket(
    { symbol: "NIFTY 23450 PE", type: "BUY", qty: 65, avg: 96.71, option: "PE" },
    91.48,
  );
  assert.equal(row.ltp, 91.48);
  assert.equal(row.pnl, Number(((91.48 - 96.71) * 65).toFixed(2)));
});

test("tick LTP is kept when the chain feed is missing", () => {
  assert.equal(
    preferMarkLtp({ symbol: "NIFTY 23450 PE", option: "PE", avg: 96.71, ltp: 91.48, ticked: true }, 0),
    91.48,
  );
});
