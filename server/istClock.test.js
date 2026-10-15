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

test("trade logs reset at 01:01 AM IST, not midnight and not 8:00", () => {
  const oneAm = Date.parse("2026-08-20T19:30:00.000Z");
  const oneOhOne = Date.parse("2026-08-20T19:31:00.000Z");
  const oneOhTwo = Date.parse("2026-08-20T19:32:00.000Z");
  const nextOneOhOne = Date.parse("2026-08-21T19:31:00.000Z");
  const prevOneOhOne = Date.parse("2026-08-19T19:31:00.000Z");
  assert.equal(BOOK_CLEAR_LABEL, "01:01 AM IST");
  assert.equal(lastBookClearAt(oneAm), prevOneOhOne);
  assert.equal(lastBookClearAt(oneOhOne), oneOhOne);
  assert.equal(lastBookClearAt(oneOhTwo), oneOhOne);
  assert.equal(nextBookClearAt(oneAm), oneOhOne);
  assert.equal(nextBookClearAt(oneOhTwo), nextOneOhOne);
});

test("8:00 AM IST token reset is unchanged", () => {
  const eightAm = Date.parse("2026-08-21T02:30:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const nextEight = Date.parse("2026-08-22T02:30:00.000Z");
  assert.equal(nextDailyRenewalAt(sevenAm), eightAm);
  assert.equal(nextDailyRenewalAt(eightAm), nextEight);
  assert.equal(lastDailyResetAt(sevenAm), Date.parse("2026-08-20T02:30:00.000Z"));
});

test("a fill from before 01:01 AM IST is stale after the reset", () => {
  const reset = Date.parse("2026-08-20T19:31:00.000Z");
  const stale = { createdAt: "2026-08-20T10:00:00.000Z" };
  const fresh = { createdAt: "2026-08-20T19:40:00.000Z" };
  assert.equal(isFreshTradeLogRow(stale, reset - 1000), true);
  assert.equal(isFreshTradeLogRow(stale, reset), false);
  assert.equal(isFreshTradeLogRow(fresh, reset), true);
});
