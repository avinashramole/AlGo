import assert from "node:assert/strict";
import test from "node:test";

const { quoteSymbol, snapshot } = await import("./market.js");

test("hyphenated option symbols never return the NIFTY index", () => {
  const nifty = (snapshot().indices || []).find((row) => /NIFTY/.test(String(row.symbol || row.name || "")));
  if (nifty) nifty.price = 22386.4;
  assert.equal(quoteSymbol("NIFTY-Oct2026-22450-CE"), 0);
  assert.equal(quoteSymbol("NIFTY 22450 CE"), 0);
  assert.ok(quoteSymbol("NIFTY 50") === 0 || quoteSymbol("NIFTY 50") >= 1000);
});
