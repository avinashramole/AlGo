import assert from "node:assert/strict";
import test from "node:test";
import { apiDownMessage, deskLoadHelp, isApiDownError } from "../src/lib/liveSite.ts";

test("a React page crash on trade2smart does not tell the user to restart t2s", () => {
  assert.equal(isApiDownError("Cannot read properties of undefined"), false);
  assert.match(deskLoadHelp("Cannot read properties of undefined", "trade2smart.com"), /Ctrl\+Shift\+R/);
  assert.equal(deskLoadHelp("Cannot read properties of undefined", "trade2smart.com").includes("systemctl"), false);
});

test("a real desk 502 on trade2smart asks for a refresh, not localhost", () => {
  assert.equal(isApiDownError("Request failed (504)"), true);
  assert.match(apiDownMessage("trade2smart.com"), /Ctrl\+Shift\+R/);
  assert.equal(apiDownMessage("trade2smart.com").includes("localhost:5173"), false);
  assert.equal(apiDownMessage("trade2smart.com").includes("systemctl"), false);
});
