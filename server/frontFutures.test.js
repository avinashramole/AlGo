import assert from "node:assert/strict";
import test from "node:test";
import {
  optionScripReady,
  peekOptionSecurityId,
  rememberChainOptionIds,
  scripCacheFresh,
} from "./frontFutures.js";

test("empty option scrip is only fresh for 30s so a failed CSV can retry", () => {
  const now = 1_000_000;
  const empty = { at: now, options: new Map() };
  assert.equal(optionScripReady(empty), false);
  assert.equal(scripCacheFresh(empty, now + 1_000), true);
  assert.equal(scripCacheFresh(empty, now + 31_000), false);

  const ready = { at: now, options: new Map([["NIFTY|2026-10-20|22750|PE", "pe-22750"]]) };
  assert.equal(optionScripReady(ready), true);
  assert.equal(scripCacheFresh(ready, now + 31_000), true);
  assert.equal(scripCacheFresh(ready, now + 13 * 60 * 60 * 1000), false);
});

test("a live chain PE id stays in scrip lookup after the desk moves away", () => {
  rememberChainOptionIds(
    [{ strike: 22750, callId: "weekly-ce-22750", putId: "weekly-pe-22750" }],
    { symbol: "NIFTY", expiry: "2026-10-20" },
  );
  assert.equal(
    peekOptionSecurityId({ symbol: "NIFTY", expiry: "2026-10-20", strike: 22750, option: "PE" }),
    "weekly-pe-22750",
  );
  assert.equal(
    peekOptionSecurityId({ symbol: "NIFTY", expiry: "2026-10-20", strike: 22750, option: "CE" }),
    "weekly-ce-22750",
  );
});
