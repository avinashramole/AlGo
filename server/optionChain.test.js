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
} from "./optionChain.js";

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
