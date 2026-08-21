import assert from "node:assert/strict";
import test from "node:test";
import {
  dhanErrorFlags,
  isDhanAuthExpiredError,
  isDhanRateLimitError,
  jwtExpiryIso,
  msUntilDailyRenewal,
  nextDailyRenewalAt,
  parseDhanExpiry,
  requirePinTotp,
  resolveTokenExpiry,
  retryAfterMs,
} from "./dhanToken.js";

function fakeJwt(exp) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

test("jwtExpiryIso reads exp from a Dhan-style JWT", () => {
  const exp = Math.floor(Date.parse("2026-08-22T10:00:00.000Z") / 1000);
  assert.equal(jwtExpiryIso(fakeJwt(exp)), "2026-08-22T10:00:00.000Z");
});

test("parseDhanExpiry treats naive timestamps as IST", () => {
  assert.equal(parseDhanExpiry("2026-08-22T15:30:00.000"), "2026-08-22T10:00:00.000Z");
  assert.equal(parseDhanExpiry("22/08/2026 15:30"), "2026-08-22T10:00:00.000Z");
});

test("resolveTokenExpiry prefers JWT over a stale session expiry", () => {
  const exp = Math.floor(Date.parse("2026-08-22T10:00:00.000Z") / 1000);
  assert.equal(
    resolveTokenExpiry({
      accessToken: fakeJwt(exp),
      expiryTime: "2020-01-01T00:00:00.000Z",
    }),
    "2026-08-22T10:00:00.000Z",
  );
});

test("dhanErrorFlags treats 805 / DH-904 / HTTP 429 as rate limit, not expiry", () => {
  const flags = dhanErrorFlags(
    { data: { 805: "Too many requests. Further requests may result in the user being blocked." }, status: "failed" },
    429,
  );
  assert.equal(flags.rateLimit, true);
  assert.equal(flags.authExpired, false);
  assert.equal(dhanErrorFlags({ errorCode: "DH-904", errorMessage: "Rate Limit" }, 400).rateLimit, true);
  assert.equal(dhanErrorFlags({ errorCode: "DH-901", errorMessage: "invalid or expired" }, 401).authExpired, true);
  assert.equal(dhanErrorFlags({ errorCode: "DH-901", errorMessage: "invalid or expired" }, 401).rateLimit, false);
});

test("isDhanRateLimitError does not trigger token renewal logic", () => {
  const error = Object.assign(new Error("Dhan 805: Too many requests"), {
    status: 429,
    rateLimit: true,
    body: { data: { 805: "Too many requests" }, status: "failed" },
  });
  assert.equal(isDhanRateLimitError(error), true);
  assert.equal(isDhanAuthExpiredError(error), false);
});

test("retryAfterMs reads seconds or milliseconds", () => {
  assert.equal(retryAfterMs({ headers: { "retry-after": "2" } }, 1000), 2000);
  assert.equal(retryAfterMs({ headers: { "retry-after": "1500" } }, 1000), 1500);
  assert.equal(retryAfterMs({ headers: {} }, 3000), 3000);
});

test("requirePinTotp demands PIN + TOTP on the server", () => {
  assert.throws(() => requirePinTotp({ clientId: "1100000001", pin: "", totpSecret: "" }), /PIN \+ TOTP is required/);
});

test("nextDailyRenewalAt resets at 8:00 AM IST", () => {
  const eightAm = Date.parse("2026-08-21T02:30:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const eightOhFive = Date.parse("2026-08-21T02:35:00.000Z");
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const nextEight = Date.parse("2026-08-22T02:30:00.000Z");
  assert.equal(nextDailyRenewalAt(sevenAm), eightAm);
  assert.equal(nextDailyRenewalAt(eightOhFive), eightAm);
  assert.equal(nextDailyRenewalAt(nineAm), nextEight);
  assert.equal(msUntilDailyRenewal(sevenAm), 60 * 60 * 1000);
  assert.equal(msUntilDailyRenewal(eightOhFive), 5_000);
});
