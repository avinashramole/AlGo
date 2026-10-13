import assert from "node:assert/strict";
import test from "node:test";
import { isLeftoverWorkingSell, pendingExitOnBook, rowTimeMs, sameExitContract } from "./pendingExit.js";

test("leftover PENDING SELLs from before this lot are not a live exit", () => {
  const open = { symbol: "CRUDEOIL 6100 CE", option: "CE", strike: 6100, openedAt: "2026-08-21T04:00:00.000Z" };
  const leftovers = Array.from({ length: 10 }, (_, i) => ({
    id: `old-sl-${i}`,
    side: "SELL",
    status: "PENDING",
    symbol: "CRUDEOIL 6100 CE",
    option: "CE",
    strike: 6100,
    strategy: "CRUDE OIL",
    price: 0,
    createdAt: "2026-08-21T03:50:00.000Z",
  }));
  assert.equal(pendingExitOnBook(leftovers, open, "CRUDE OIL", { lastEntryAt: Date.parse(open.openedAt) }), false);
  assert.equal(isLeftoverWorkingSell(leftovers[0], open, { lastEntryAt: Date.parse(open.openedAt) }), true);
});

test("a SELL placed after this lot opened is a live exit", () => {
  const open = { symbol: "NIFTY 22650 CE", option: "CE", strike: 22650, openedAt: "2026-08-21T04:00:00.000Z" };
  const current = {
    id: "exit-now",
    side: "SELL",
    status: "PENDING",
    symbol: "NIFTY 22650 CE",
    option: "CE",
    strike: 22650,
    strategy: "NIFTY",
    createdAt: "2026-08-21T04:01:00.000Z",
  };
  assert.equal(pendingExitOnBook([current], open, "NIFTY"), true);
  assert.equal(isLeftoverWorkingSell(current, open), false);
});

test("rowTimeMs and sameExitContract read the lot identity", () => {
  assert.ok(rowTimeMs({ createdAt: "2026-08-21T04:00:00.000Z" }) > 0);
  assert.equal(sameExitContract({ securityId: "1" }, { securityId: "1" }), true);
  assert.equal(sameExitContract({ option: "PE", strike: 100 }, { option: "PE", strike: 100 }), true);
  assert.equal(sameExitContract({ option: "PE", strike: 100 }, { option: "CE", strike: 100 }), false);
});
