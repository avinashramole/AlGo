import assert from "node:assert/strict";
import test from "node:test";
import { securityIdForCopyOrder } from "./dhan.js";

test("admin and user copy the strategy expiry, not the other chain on the desk", () => {
  const weekly = securityIdForCopyOrder({
    payloadSecurityId: "monthly-22650-ce",
    payloadExpiry: "2026-10-06",
    chainExpiry: "2026-10-27",
    chainSecurityId: "monthly-22650-ce",
    scripSecurityId: "weekly-22650-ce",
  });
  assert.equal(weekly, "weekly-22650-ce");
  const blocked = securityIdForCopyOrder({
    payloadSecurityId: "monthly-22650-ce",
    payloadExpiry: "2026-10-06",
    chainExpiry: "2026-10-27",
    chainSecurityId: "monthly-22650-ce",
    scripSecurityId: "",
  });
  assert.equal(blocked, "");
  const same = securityIdForCopyOrder({
    payloadExpiry: "2026-10-06",
    chainExpiry: "2026-10-06",
    chainSecurityId: "weekly-22650-ce",
    scripSecurityId: "",
  });
  assert.equal(same, "weekly-22650-ce");
});
