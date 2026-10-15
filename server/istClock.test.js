import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_CLEAR_LABEL,
  lastBookClearAt,
  lastDailyResetAt,
  nextBookClearAt,
  nextDailyRenewalAt,
  isFreshTradeLogRow,
} from "./istClock.js";

test("trade logs reset at 8:00 AM IST with the Dhan token window", () => {
  const eightAm = Date.parse("2026-08-21T02:30:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const eightOhTwo = Date.parse("2026-08-21T02:32:00.000Z");
  const nextEight = Date.parse("2026-08-22T02:30:00.000Z");
  const prevEight = Date.parse("2026-08-20T02:30:00.000Z");
  assert.equal(BOOK_CLEAR_LABEL, "8:00 AM IST");
  assert.equal(lastBookClearAt(sevenAm), prevEight);
  assert.equal(lastBookClearAt(eightAm), eightAm);
  assert.equal(lastBookClearAt(eightOhTwo), eightAm);
  assert.equal(nextBookClearAt(sevenAm), eightAm);
  assert.equal(nextBookClearAt(eightOhTwo), nextEight);
  assert.equal(lastBookClearAt(eightAm), lastDailyResetAt(eightAm));
});

test("8:00 AM IST token reset is unchanged", () => {
  const eightAm = Date.parse("2026-08-21T02:30:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const nextEight = Date.parse("2026-08-22T02:30:00.000Z");
  assert.equal(nextDailyRenewalAt(sevenAm), eightAm);
  assert.equal(nextDailyRenewalAt(eightAm), nextEight);
  assert.equal(lastDailyResetAt(sevenAm), Date.parse("2026-08-20T02:30:00.000Z"));
});

test("a fill from before 8:00 AM IST is stale after the reset", () => {
  const reset = Date.parse("2026-08-21T02:30:00.000Z");
  const stale = { createdAt: "2026-08-20T10:00:00.000Z" };
  const fresh = { createdAt: "2026-08-21T03:00:00.000Z" };
  assert.equal(isFreshTradeLogRow(stale, reset - 1000), true);
  assert.equal(isFreshTradeLogRow(stale, reset), false);
  assert.equal(isFreshTradeLogRow(fresh, reset), true);
});
