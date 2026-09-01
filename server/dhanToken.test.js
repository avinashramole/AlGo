import assert from "node:assert/strict";
import test from "node:test";
import {
  dhanErrorFlags,
  isDhanAuthExpiredError,
  isDhanInvalidTotpError,
  isDhanRateLimitError,
  jwtExpiryIso,
  lastDailyResetAt,
  mergeDhanCredentials,
  msUntilDailyRenewal,
  msUntilTokenKeepAlive,
  needsFreshAccessToken,
  nextDailyRenewalAt,
  parseDhanExpiry,
  requirePinTotp,
  resolveTokenExpiry,
  retryAfterMs,
} from "./dhanToken.js";

function fakeJwt(exp, iat) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(iat ? { exp, iat } : { exp })).toString("base64url");
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
  assert.equal(dhanErrorFlags({ errorMessage: "Invalid TOTP" }, 400).invalidTotp, true);
  assert.equal(dhanErrorFlags({ errorMessage: "Invalid TOTP" }, 400).authExpired, false);
  assert.equal(dhanErrorFlags({ errorMessage: "Too many attempts. Please try again after sometime." }, 400).rateLimit, true);
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

test("mergeDhanCredentials lets .env PIN and TOTP override a stale session file", () => {
  const merged = mergeDhanCredentials(
    { clientId: "old-id", pin: "1111", totpSecret: "OLDSECRETOLDSECRET", accessToken: "session-token" },
    { DHAN_CLIENT_ID: "env-id", DHAN_PIN: "9999", DHAN_TOTP_SECRET: "jbsw y3dp ehpk 3pxp", DHAN_ACCESS_TOKEN: "env-token" },
  );
  assert.equal(merged.clientId, "env-id");
  assert.equal(merged.pin, "9999");
  assert.equal(merged.totpSecret, "JBSWY3DPEHPK3PXP");
  assert.equal(merged.accessToken, "session-token");
});

test("isDhanInvalidTotpError is not treated as an expired access token", () => {
  const error = Object.assign(new Error("Invalid TOTP"), { invalidTotp: true, status: 400 });
  assert.equal(isDhanInvalidTotpError(error), true);
  assert.equal(isDhanAuthExpiredError(error), false);
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

test("lastDailyResetAt is today's 8:00 IST after the reset, yesterday's before", () => {
  const eightAm = Date.parse("2026-08-21T02:30:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const prevEight = Date.parse("2026-08-20T02:30:00.000Z");
  assert.equal(lastDailyResetAt(sevenAm), prevEight);
  assert.equal(lastDailyResetAt(eightAm), eightAm);
  assert.equal(lastDailyResetAt(nineAm), eightAm);
});

test("needsFreshAccessToken is true at 9:00 IST when the token was issued yesterday", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const yesterdayEight = Date.parse("2026-08-20T02:30:00.000Z");
  const exp = Math.floor((nineAm + 20 * 3600 * 1000) / 1000);
  const iat = Math.floor(yesterdayEight / 1000);
  assert.equal(needsFreshAccessToken({ accessToken: fakeJwt(exp, iat) }, nineAm), true);
});

test("needsFreshAccessToken is true even if generatedAt was stamped later than JWT iat", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const yesterdayEight = Date.parse("2026-08-20T02:30:00.000Z");
  const exp = Math.floor((nineAm + 20 * 3600 * 1000) / 1000);
  const iat = Math.floor(yesterdayEight / 1000);
  assert.equal(
    needsFreshAccessToken(
      { accessToken: fakeJwt(exp, iat), generatedAt: new Date(nineAm).toISOString() },
      nineAm,
    ),
    true,
  );
});

test("needsFreshAccessToken is false after today's 8:05 IST mint", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const eightOhFive = Date.parse("2026-08-21T02:35:00.000Z");
  const exp = Math.floor((eightOhFive + 24 * 3600 * 1000) / 1000);
  const iat = Math.floor(eightOhFive / 1000);
  assert.equal(
    needsFreshAccessToken(
      { accessToken: fakeJwt(exp, iat), generatedAt: new Date(eightOhFive).toISOString() },
      nineAm,
    ),
    false,
  );
});

test("needsFreshAccessToken is false before 8:00 IST if yesterday's token still has life", () => {
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const yesterdayNine = Date.parse("2026-08-20T03:30:00.000Z");
  const exp = Math.floor((yesterdayNine + 24 * 3600 * 1000) / 1000);
  const iat = Math.floor(yesterdayNine / 1000);
  assert.equal(needsFreshAccessToken({ accessToken: fakeJwt(exp, iat) }, sevenAm), false);
});

test("needsFreshAccessToken is true with no token or under 20 minutes remaining", () => {
  const now = Date.parse("2026-08-21T03:30:00.000Z");
  assert.equal(needsFreshAccessToken({}, now), true);
  const exp = Math.floor((now + 10 * 60 * 1000) / 1000);
  assert.equal(needsFreshAccessToken({ accessToken: fakeJwt(exp) }, now), true);
});

test("msUntilTokenKeepAlive mints in 5s after 8:00 IST if token is from yesterday, else waits until tomorrow 8:00", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const eightOhFive = Date.parse("2026-08-21T02:35:00.000Z");
  const sevenAm = Date.parse("2026-08-21T01:30:00.000Z");
  const tomorrowEight = Date.parse("2026-08-22T02:30:00.000Z");
  const todayEight = Date.parse("2026-08-21T02:30:00.000Z");
  const yesterdayEight = Date.parse("2026-08-20T02:30:00.000Z");
  const staleExp = Math.floor((nineAm + 20 * 3600 * 1000) / 1000);
  const staleIat = Math.floor(yesterdayEight / 1000);
  const freshExp = Math.floor((eightOhFive + 24 * 3600 * 1000) / 1000);
  const freshIat = Math.floor(eightOhFive / 1000);
  assert.equal(msUntilTokenKeepAlive({ accessToken: fakeJwt(staleExp, staleIat) }, nineAm), 5_000);
  assert.equal(
    msUntilTokenKeepAlive(
      { accessToken: fakeJwt(freshExp, freshIat), generatedAt: new Date(eightOhFive).toISOString() },
      eightOhFive,
    ),
    tomorrowEight - eightOhFive,
  );
  const yExp = Math.floor((Date.parse("2026-08-20T03:30:00.000Z") + 24 * 3600 * 1000) / 1000);
  const yIat = Math.floor(Date.parse("2026-08-20T03:30:00.000Z") / 1000);
  assert.equal(msUntilTokenKeepAlive({ accessToken: fakeJwt(yExp, yIat) }, sevenAm), todayEight - sevenAm);
});
