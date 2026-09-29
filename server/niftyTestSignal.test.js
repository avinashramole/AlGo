import assert from "node:assert/strict";
import test from "node:test";
import { niftyTestSide } from "./market.js";

test("nifty test has no BUY or SELL until the Nifty future tape breaks", () => {
  assert.equal(
    niftyTestSide({
      kind: "nifty-test",
      side: "BOTH",
      timeframe: "5m",
      startTimeIst: "09:15",
      endTimeIst: "15:15",
    }),
    "",
  );
});
