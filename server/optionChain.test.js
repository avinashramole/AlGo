import assert from "node:assert/strict";
import test from "node:test";
import {
  exchangeSegmentFor,
  getUnderlying,
  isLastWeekdayOfMonth,
  isWeeklyOptionExpiry,
  nearestWeeklyExpiry,
  upcomingExpiries,
  UNDERLYINGS,
  weekdayNameIST,
  dhanOrderQuantity,
  keepStrikeWindow,
  chooseDeskExpiry,
  dropExpired,
  withExpiryLabels,
} from "./optionChain.js";

test("chooseDeskExpiry defaults to the nearest expiry and keeps a picked date", () => {
  assert.deepEqual(chooseDeskExpiry(["2027-03-09", "2027-03-02", "2027-03-16"], ""), {
    expiry: "2027-03-02",
    pinned: false,
  });
  assert.deepEqual(chooseDeskExpiry(["2027-03-02", "2027-03-09"], "2027-03-09"), {
    expiry: "2027-03-09",
    pinned: true,
  });
});

test("NIFTY monthly is the last Tuesday of the month", () => {
  assert.equal(weekdayNameIST("2026-09-08"), "Tue");
  assert.equal(weekdayNameIST("2026-09-29"), "Tue");
  assert.equal(isLastWeekdayOfMonth("2026-09-29", "Tue"), true);
  assert.equal(isLastWeekdayOfMonth("2026-09-08", "Tue"), false);
  assert.equal(isLastWeekdayOfMonth("2026-10-27", "Tue"), true);
});

test("isWeeklyOptionExpiry skips NIFTY monthly Tuesdays", () => {
  assert.equal(isWeeklyOptionExpiry("2026-09-08", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-15", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-22", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-29", "NIFTY"), false);
  assert.equal(isWeeklyOptionExpiry("2026-09-24", "NIFTY"), false);
});

test("nearestWeeklyExpiry buys the next weekly and never the monthly", () => {
  assert.equal(
    nearestWeeklyExpiry(["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-30"], "NIFTY"),
    "2027-03-02",
  );
  assert.equal(nearestWeeklyExpiry(["2027-03-30", "2027-04-06", "2027-04-13"], "NIFTY"), "2027-04-06");
  assert.equal(isWeeklyOptionExpiry(nearestWeeklyExpiry(["2027-03-30"], "NIFTY"), "NIFTY"), true);
  assert.notEqual(nearestWeeklyExpiry(["2027-03-30"], "NIFTY"), "2027-03-30");
});

test("CRUDEOIL is a market card underlying on MCX", () => {
  const crude = getUnderlying("CRUDEOIL");
  assert.equal(crude.id, "CRUDEOIL");
  assert.equal(crude.segment, "MCX_COMM");
  assert.equal(crude.lot, 100);
  assert.equal(crude.step, 50);
  assert.equal(UNDERLYINGS.some((row) => row.id === "CRUDEOIL"), true);
  assert.equal(exchangeSegmentFor("CRUDEOIL 6100 CE"), "MCX_COMM");
  assert.equal(exchangeSegmentFor("SENSEX 82000 CE"), "BSE_FNO");
  const expiries = upcomingExpiries("CRUDEOIL", 3);
  assert.equal(expiries.length, 3);
  assert.equal(expiries.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)), true);
  assert.equal(["Sat", "Sun"].includes(weekdayNameIST(expiries[0])), false);
});

test("CRUDE OIL is listed next to index underlyings for the option chain", () => {
  const ids = UNDERLYINGS.map((row) => row.id);
  assert.deepEqual(ids.slice(-1), ["CRUDEOIL"]);
  assert.equal(UNDERLYINGS.find((row) => row.id === "CRUDEOIL").label, "CRUDE OIL");
});

test("Dhan MCX quantity is lots, not barrel lot-size", () => {
  assert.equal(dhanOrderQuantity({ symbol: "NIFTY 24600 CE", qty: 65 }), 65);
  assert.equal(dhanOrderQuantity({ symbol: "BANKNIFTY 52000 PE", qty: 30, lots: 1, lotSize: 30 }), 30);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 CE", qty: 100, lots: 1, lotSize: 100, exchangeSegment: "MCX_COMM" }), 1);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 CE", qty: 200, lots: 1, lotSize: 100 }), 2);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL FUT", qty: 200, exchangeSegment: "MCX_COMM", lotSize: 100 }), 2);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 PE", qty: 1, exchangeSegment: "MCX_COMM" }), 1);
});

test("keepStrikeWindow patches LTP on the same strikes instead of recentering ATM", () => {
  const open = [
    { strike: 24500, atm: true, callLtp: 100 },
    { strike: 24550, atm: false, callLtp: 80 },
    { strike: 24600, atm: false, callLtp: 60 },
  ];
  const incoming = [
    { strike: 24450, atm: false, callLtp: 140 },
    { strike: 24500, atm: false, callLtp: 110 },
    { strike: 24550, atm: true, callLtp: 90 },
    { strike: 24600, atm: false, callLtp: 70 },
    { strike: 24650, atm: false, callLtp: 50 },
  ];
  const next = keepStrikeWindow(open, incoming);
  assert.deepEqual(
    next.map((row) => row.strike),
    [24500, 24550, 24600],
  );
  assert.equal(next[0].callLtp, 110);
  assert.equal(next[1].atm, true);
});

test("today's expiry stays listed after NSE 15:30 so last live chain still shows", () => {
  const expiryDay = "2026-09-22";
  const afterNse = new Date("2026-09-22T10:31:00.000Z");
  const kept = dropExpired([expiryDay, "2026-09-29"], { date: afterNse });
  assert.equal(kept.includes(expiryDay), true);
  const mcxAfterNse = dropExpired([expiryDay, "2026-10-19"], { date: afterNse, symbol: "CRUDEOIL" });
  assert.equal(mcxAfterNse.includes(expiryDay), true);
});

test("withExpiryLabels keeps a Dhan expiry after the session rolls", () => {
  const meta = withExpiryLabels({
    symbol: "NIFTY",
    expiry: "2026-09-22",
    expiries: ["2026-09-29", "2026-10-06"],
    source: "dhan",
  });
  assert.equal(meta.expiry, "2026-09-22");
  assert.equal(meta.expiries[0], "2026-09-22");
});
