import assert from "node:assert/strict";
import test from "node:test";
import { dayChangeFromQuote } from "./quoteDayChange.js";

test("today change uses yesterday close, then net change, then today's open", () => {
  assert.deepEqual(dayChangeFromQuote(23326.8, { prevClose: 23200 }), {
    change: 126.8,
    changePct: 0.55,
    prevClose: 23200,
  });
  assert.deepEqual(dayChangeFromQuote(8965, { netChange: -45 }), {
    change: -45,
    changePct: -0.5,
    prevClose: 9010,
  });
  assert.deepEqual(dayChangeFromQuote(3033.3, { open: 2990 }, 0, { maxPct: 0.6 }), {
    change: 43.3,
    changePct: 1.45,
    prevClose: 2990,
  });
});
