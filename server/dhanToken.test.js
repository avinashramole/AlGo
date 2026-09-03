import assert from "node:assert/strict";
import test from "node:test";
import {
  asDhanPin,
  dhanErrorFlags,
  isDhanAuthExpiredError,
  isDhanInvalidTotpError,
  isDhanRateLimitError,
  jwtExpiryIso,
  lastDailyResetAt,
  keepAlivePlan,
  effectiveTokenBackoff,
  mergeDhanCredentials,
  msUntilDailyRenewal,
  msUntilTokenKeepAlive,
  needsFreshAccessToken,
  nextDailyRenewalAt,
  parseDhanExpiry,
  parseDhanTokenPayload,
  requirePinTotp,
  resetDhanAccessToken,
  resolveDhanLogin,
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
  assert.equal(dhanErrorFlags({ errorMessage: "Too many attempts. Please try again after sometime." }, 400).invalidTotp, false);
  assert.equal(dhanErrorFlags({ errorMessage: "Too many attempts. Invalid TOTP" }, 429).rateLimit, true);
  assert.equal(dhanErrorFlags({ errorMessage: "Too many attempts. Invalid TOTP" }, 429).invalidTotp, false);
  assert.equal(
    dhanErrorFlags(
      { errorType: "HOLDING_ERROR", errorCode: "DH-1111", errorMessage: "No holdings available" },
      500,
    ).emptyCollection,
    true,
  );
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

test("asDhanPin only accepts a 4–6 digit PIN", () => {
  assert.equal(asDhanPin("1234"), "1234");
  assert.equal(asDhanPin("123456"), "123456");
  assert.equal(asDhanPin("MyWebsitePass"), "");
  assert.equal(asDhanPin("12"), "");
});

test("resolveDhanLogin maps loginId + PIN-password to Client ID + PIN", () => {
  const creds = resolveDhanLogin(
    { loginId: "1000561739", password: "1234", totpSecret: "jbsw y3dp ehpk 3pxp" },
    {},
    { clientId: "", pin: "", totpSecret: "", accessToken: "" },
  );
  assert.equal(creds.clientId, "1000561739");
  assert.equal(creds.pin, "1234");
  assert.equal(creds.totpSecret, "JBSWY3DPEHPK3PXP");
  assert.equal(creds.websitePassword, false);
});

test("resolveDhanLogin ignores a website password and keeps a saved PIN", () => {
  const creds = resolveDhanLogin(
    { loginId: "1000561739", password: "MyWebPass" },
    {},
    { clientId: "old", pin: "2468", totpSecret: "", accessToken: "" },
  );
  assert.equal(creds.clientId, "1000561739");
  assert.equal(creds.pin, "2468");
  assert.equal(creds.websitePassword, true);
});

test("mergeDhanCredentials accepts DHAN_LOGIN_ID and a 4–6 digit DHAN_PASSWORD", () => {
  const merged = mergeDhanCredentials(
    { clientId: "old-id", pin: "1111", totpSecret: "", accessToken: "" },
    { DHAN_LOGIN_ID: "1000561739", DHAN_PASSWORD: "9999" },
  );
  assert.equal(merged.clientId, "1000561739");
  assert.equal(merged.pin, "9999");
});

test("mergeDhanCredentials ignores a website-style DHAN_PASSWORD", () => {
  const merged = mergeDhanCredentials({ pin: "2468" }, { DHAN_PASSWORD: "MyWebPass!" });
  assert.equal(merged.pin, "2468");
});

test("parseDhanTokenPayload reads token as well as accessToken", () => {
  assert.equal(parseDhanTokenPayload({ token: "abc", dhanClientId: "1000561739" }).accessToken, "abc");
  assert.equal(parseDhanTokenPayload({ data: { access_token: "xyz" } }).accessToken, "xyz");
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
  assert.equal(nextDailyRenewalAt(eightOhFive), nextEight);
  assert.equal(nextDailyRenewalAt(nineAm), nextEight);
  assert.equal(msUntilDailyRenewal(sevenAm), 60 * 60 * 1000);
  assert.equal(msUntilDailyRenewal(eightOhFive), nextEight - eightOhFive);
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

test("needsFreshAccessToken is true if generatedAt was stamped after 8:00 but JWT life started yesterday", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const exp = Math.floor((nineAm + 16 * 3600 * 1000) / 1000);
  assert.equal(
    needsFreshAccessToken(
      { accessToken: fakeJwt(exp), generatedAt: new Date(nineAm).toISOString() },
      nineAm,
    ),
    true,
  );
});

test("effectiveTokenBackoff drops yesterday's TOTP/429 cooldown after today's 8:00 IST", () => {
  const nineAm = Date.parse("2026-08-21T03:30:00.000Z");
  const yesterdayEvening = Date.parse("2026-08-20T14:00:00.000Z");
  assert.deepEqual(
    effectiveTokenBackoff(
      {
        savedAt: new Date(yesterdayEvening).toISOString(),
        credentialsBlockedUntil: yesterdayEvening + 6 * 60 * 60 * 1000,
        generateBackoffUntil: yesterdayEvening + 30 * 60 * 1000,
      },
      nineAm,
    ),
    { generateBackoffUntil: 0, credentialsBlockedUntil: 0 },
  );
  const eightOhOne = Date.parse("2026-08-21T02:31:00.000Z");
  const until = eightOhOne + 30 * 60 * 1000;
  assert.deepEqual(
    effectiveTokenBackoff(
      {
        savedAt: new Date(eightOhOne).toISOString(),
        generateBackoffUntil: until,
      },
      eightOhOne + 60_000,
    ),
    { generateBackoffUntil: until, credentialsBlockedUntil: 0 },
  );
});

test("effectiveTokenBackoff caps leftover 6-hour Invalid TOTP blocks to 30 minutes", () => {
  const eightOhOne = Date.parse("2026-08-21T02:31:00.000Z");
  const twoPm = eightOhOne + 6 * 60 * 60 * 1000;
  const elevenAm = Date.parse("2026-08-21T05:30:00.000Z");
  assert.deepEqual(
    effectiveTokenBackoff(
      {
        savedAt: new Date(eightOhOne).toISOString(),
        credentialsBlockedUntil: twoPm,
      },
      elevenAm,
    ),
    { generateBackoffUntil: 0, credentialsBlockedUntil: 0 },
  );
  const eightEleven = eightOhOne + 10 * 60 * 1000;
  assert.deepEqual(
    effectiveTokenBackoff(
      {
        savedAt: new Date(eightOhOne).toISOString(),
        credentialsBlockedUntil: twoPm,
      },
      eightEleven,
    ),
    { generateBackoffUntil: 0, credentialsBlockedUntil: eightOhOne + 30 * 60 * 1000 },
  );
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

test("keepAlivePlan mints after 8:00 IST even when boot/retry still sees a long-lived JWT", () => {
  const remaining = 12 * 60 * 60 * 1000;
  assert.deepEqual(
    keepAlivePlan({
      reason: "boot",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: remaining,
    }),
    { action: "mint", because: "daily-reset" },
  );
  assert.deepEqual(
    keepAlivePlan({
      reason: "retry",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: remaining,
    }),
    { action: "mint", because: "daily-reset" },
  );
  assert.deepEqual(
    keepAlivePlan({
      reason: "watchdog",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: remaining,
    }),
    { action: "mint", because: "daily-reset" },
  );
});

test("keepAlivePlan reuses a still-valid JWT on boot only if today's 8:00 mint already ran", () => {
  const remaining = 12 * 60 * 60 * 1000;
  assert.deepEqual(
    keepAlivePlan({
      reason: "boot",
      canAutoGenerate: true,
      needsFresh: false,
      remainingMs: remaining,
    }),
    { action: "reuse", because: "jwt-still-valid" },
  );
  assert.deepEqual(
    keepAlivePlan({
      reason: "schedule",
      canAutoGenerate: true,
      needsFresh: false,
      remainingMs: remaining,
    }),
    { action: "wait", because: "already-fresh" },
  );
});

test("keepAlivePlan waits through Invalid TOTP block and generate 429 backoff", () => {
  const now = Date.parse("2026-08-21T03:30:00.000Z");
  assert.deepEqual(
    keepAlivePlan({
      reason: "watchdog",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: 12 * 60 * 60 * 1000,
      blockedUntil: now + 6 * 60 * 60 * 1000,
      now,
    }),
    { action: "wait", because: "totp-blocked" },
  );
  assert.deepEqual(
    keepAlivePlan({
      reason: "retry",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: 12 * 60 * 60 * 1000,
      generateBackoffUntil: now + 30 * 60 * 1000,
      now,
    }),
    { action: "wait", because: "generate-429" },
  );
});

test("keepAlivePlan mints when PIN+TOTP exist and JWT life is under 20 minutes", () => {
  assert.deepEqual(
    keepAlivePlan({
      reason: "schedule",
      canAutoGenerate: true,
      needsFresh: true,
      remainingMs: 10 * 60 * 1000,
    }),
    { action: "mint", because: "daily-reset" },
  );
  assert.deepEqual(
    keepAlivePlan({
      reason: "schedule",
      canAutoGenerate: false,
      needsFresh: false,
      remainingMs: 10 * 60 * 1000,
    }),
    { action: "fail", because: "expired-no-creds" },
  );
});

test("resetDhanAccessToken calls RenewToken first when a JWT still looks alive", async () => {
  let generated = false;
  const result = await resetDhanAccessToken(
    { loginId: "1000561739", password: "1234", totpSecret: "JBSWY3DPEHPK3PXP" },
    {
      session: {
        clientId: "1000561739",
        accessToken: "old-token",
        expiryTime: new Date(Date.now() + 3600_000).toISOString(),
      },
      env: {},
      renew: async () => ({ accessToken: "renewed", expiryTime: "x", clientId: "1000561739" }),
      generate: async () => {
        generated = true;
        throw new Error("should not generate");
      },
    },
  );
  assert.equal(generated, false);
  assert.equal(result.method, "renew");
  assert.equal(result.accessToken, "renewed");
});

test("resetDhanAccessToken falls back to PIN + TOTP generate after RenewToken expiry", async () => {
  const result = await resetDhanAccessToken(
    { loginId: "1000561739", password: "1234", totpSecret: "JBSWY3DPEHPK3PXP" },
    {
      session: {
        clientId: "1000561739",
        accessToken: "old-token",
        expiryTime: new Date(Date.now() + 3600_000).toISOString(),
      },
      env: {},
      renew: async () => {
        throw Object.assign(new Error("token is expired"), { status: 401, authExpired: true });
      },
      generate: async ({ pin, clientId }) => {
        assert.equal(pin, "1234");
        assert.equal(clientId, "1000561739");
        return { accessToken: "minted", expiryTime: "x", clientId };
      },
    },
  );
  assert.equal(result.method, "generate");
  assert.equal(result.accessToken, "minted");
});

test("resetDhanAccessToken does not mint after RenewToken 429", async () => {
  await assert.rejects(
    () =>
      resetDhanAccessToken(
        { clientId: "1000561739", pin: "1234", totpSecret: "JBSWY3DPEHPK3PXP" },
        {
          session: {
            clientId: "1000561739",
            accessToken: "old-token",
            expiryTime: new Date(Date.now() + 3600_000).toISOString(),
          },
          env: {},
          renew: async () => {
            throw Object.assign(new Error("Dhan 429"), { status: 429, rateLimit: true });
          },
          generate: async () => {
            throw new Error("should not generate");
          },
        },
      ),
    /429/,
  );
});

test("resetDhanAccessToken skips RenewToken when the JWT is already expired locally", async () => {
  let renewed = false;
  const result = await resetDhanAccessToken(
    { clientId: "1000561739", pin: "1234", totpSecret: "JBSWY3DPEHPK3PXP" },
    {
      session: {
        clientId: "1000561739",
        accessToken: "old-token",
        expiryTime: new Date(Date.now() - 1000).toISOString(),
      },
      env: {},
      renew: async () => {
        renewed = true;
        return { accessToken: "nope" };
      },
      generate: async () => ({ accessToken: "minted", expiryTime: "x", clientId: "1000561739" }),
    },
  );
  assert.equal(renewed, false);
  assert.equal(result.method, "generate");
});

test("resetDhanAccessToken rejects a website password when no PIN is saved", async () => {
  await assert.rejects(
    () =>
      resetDhanAccessToken(
        { loginId: "1000561739", password: "MyWebsitePass" },
        { session: { clientId: "", accessToken: "", pin: "", totpSecret: "" }, env: {} },
      ),
    /does not use the website login password/,
  );
});
