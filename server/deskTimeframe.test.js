import assert from "node:assert/strict";
import test from "node:test";
import { parseBarMinutes, resolveDeskTimeframe, DESK_TIMEFRAME_PRESETS, MAX_CUSTOM_BAR_MINUTES } from "./deskTimeframe.js";

test("desk timeframes are 5m 15m 30m 1H and custom 1-60", () => {
  assert.deepEqual([...DESK_TIMEFRAME_PRESETS], ["5m", "15m", "30m", "1H"]);
  assert.equal(MAX_CUSTOM_BAR_MINUTES, 60);
  assert.equal(parseBarMinutes("5m"), 5);
  assert.equal(parseBarMinutes("15m"), 15);
  assert.equal(parseBarMinutes("30m"), 30);
  assert.equal(parseBarMinutes("1H"), 60);
  assert.equal(parseBarMinutes("1hr"), 60);
  assert.equal(parseBarMinutes("60m"), 60);
  assert.equal(parseBarMinutes("17m"), 17);
  assert.equal(parseBarMinutes("19"), 19);
  assert.equal(parseBarMinutes("10m"), 10);
  assert.equal(parseBarMinutes("61m", 0), 0);
  assert.equal(resolveDeskTimeframe("1h"), "1H");
  assert.equal(resolveDeskTimeframe("60m"), "1H");
  assert.equal(resolveDeskTimeframe("17m"), "17m");
  assert.equal(resolveDeskTimeframe("19"), "19m");
  assert.equal(resolveDeskTimeframe("xyz", "5m"), "5m");
});
