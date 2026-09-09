import assert from "node:assert/strict";
import test from "node:test";
import {
  isLastWeekdayOfMonth,
  isWeeklyOptionExpiry,
  nearestWeeklyExpiry,
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
