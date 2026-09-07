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
    nearestWeeklyExpiry(["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"], "NIFTY"),
    "2026-09-08",
  );
  assert.equal(nearestWeeklyExpiry(["2026-09-29", "2026-10-06", "2026-10-13"], "NIFTY"), "2026-10-06");
  assert.equal(isWeeklyOptionExpiry(nearestWeeklyExpiry(["2026-09-29"], "NIFTY"), "NIFTY"), true);
  assert.notEqual(nearestWeeklyExpiry(["2026-09-29"], "NIFTY"), "2026-09-29");
});
