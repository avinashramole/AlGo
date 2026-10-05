import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-fyers-auth-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_PUBLIC_URL = "https://trade2smart.com";

const { installMemberBroker, peekBrokerAccount, peekClientSecrets, selectMemberBroker } = await import("./memberDesk.js");
const {
  exchangeFyersAuthCode,
  fyersAppIdHash,
  fyersAuthCodeFromQuery,
  fyersAuthorizeUrl,
  fyersOauthCreds,
  fyersOauthState,
  fyersRedirectUri,
  parseFyersOauthState,
  receiveFyersAccessToken,
  startClientFyersToken,
  startMemberFyersToken,
} = await import("./fyersAuth.js");

const member = { id: "u-fyers-auth", name: "ARFayer ALL", email: "arfayer@t2s.app", role: "user" };

test("App ID and App Secret are enough to install Fyers before today's token exists", () => {
  const saved = installMemberBroker({
    user: member,
    brokerId: "fyers",
    clientId: "DA02189",
    apiKey: "Z2TESTFYERS1-200",
    sessionToken: "fyers-app-secret-22222222",
  });
  assert.equal(saved.install.accountId, "DA02189");
  assert.equal(saved.install.installed, false);
  assert.equal(saved.install.oauthReady, true);
  const slot = peekBrokerAccount(member.id, "fyers");
  assert.equal(slot.brokerApiKey, "Z2TESTFYERS1-200");
  assert.equal(slot.brokerSessionToken, "fyers-app-secret-22222222");
  assert.equal(fyersOauthCreds(slot, peekClientSecrets(member.id)).ready, true);
});

test("appIdHash is SHA256 of App ID:App Secret", () => {
  const expected = crypto.createHash("sha256").update("Z2TESTFYERS1-200:fyers-app-secret-22222222").digest("hex");
  assert.equal(fyersAppIdHash("Z2TESTFYERS1-200", "fyers-app-secret-22222222"), expected);
});

test("generate-authcode URL uses the stored App ID and site callback", () => {
  assert.equal(fyersRedirectUri(), "https://trade2smart.com/api/fyers/callback");
  const url = fyersAuthorizeUrl({ apiKey: "Z2TESTFYERS1-200", state: fyersOauthState(member.id) });
  assert.match(url, /\/api\/v3\/generate-authcode/);
  assert.match(url, /client_id=Z2TESTFYERS1-200/);
  assert.match(url, /redirect_uri=https%3A%2F%2Ftrade2smart.com%2Fapi%2Ffyers%2Fcallback/);
  assert.match(url, /response_type=code/);
  assert.match(url, /state=u-fyers-auth/);
});

test("callback reads official auth_code and also accepts code", () => {
  assert.equal(fyersAuthCodeFromQuery({ auth_code: "fyers-auth-88" }), "fyers-auth-88");
  assert.equal(fyersAuthCodeFromQuery({ code: "fallback-code" }), "fallback-code");
  assert.equal(parseFyersOauthState("u-fyers-auth|users").next, "users");
  assert.equal(parseFyersOauthState("u-fyers-auth").next, "plans");
});

test("auth-code exchange posts appIdHash and stores today's access token", async () => {
  const expectedHash = fyersAppIdHash("Z2TESTFYERS1-200", "fyers-app-secret-22222222");
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(String(options.body));
    assert.equal(body.grant_type, "authorization_code");
    assert.equal(body.appIdHash, expectedHash);
    assert.equal(body.code, "fyers-auth-88");
    return {
      ok: true,
      status: 200,
      json: async () => ({ s: "ok", code: 200, access_token: "fyers-today-token-DA02189", fy_id: "DA02189" }),
    };
  };
  const minted = await exchangeFyersAuthCode(
    { code: "fyers-auth-88", apiKey: "Z2TESTFYERS1-200", apiSecret: "fyers-app-secret-22222222" },
    fetchImpl,
  );
  assert.equal(minted.accessToken, "fyers-today-token-DA02189");
  const saved = receiveFyersAccessToken({
    apiKey: "Z2TESTFYERS1-200",
    access_token: minted.accessToken,
    fy_id: "DA02189",
  });
  assert.equal(saved.ok, true);
  assert.equal(peekBrokerAccount(member.id, "fyers").brokerToken, "fyers-today-token-DA02189");
  assert.equal(peekClientSecrets(member.id).brokerToken, "fyers-today-token-DA02189");
});

test("Get today's token returns the Fyers login URL so the user does not hunt myapi", async () => {
  const started = await startMemberFyersToken(member);
  assert.equal(started.ok, true);
  assert.equal(started.hasTradingToken, true);
  assert.match(started.tokenHint, /•/);
  assert.match(started.loginUrl, /generate-authcode/);
  assert.match(started.message, /already has a token|Log in again/);
});

test("admin Get today's token sends the user back to Users after Fyers login", async () => {
  const started = await startClientFyersToken(member.id);
  assert.match(started.loginUrl, /state=u-fyers-auth%7Cusers/);
});

test("Get today's token says Fyers has no pasteable dashboard token when none is stored", async () => {
  const fresh = { id: "u-fyers-wait", name: "Fyers Wait", email: "fyerswait@t2s.app", role: "user" };
  installMemberBroker({
    user: fresh,
    brokerId: "fyers",
    clientId: "DA02189",
    apiKey: "Z2TESTFYERS2-200",
    sessionToken: "fyers-app-secret-44444444",
  });
  const started = await startMemberFyersToken(fresh);
  assert.equal(started.hasTradingToken, false);
  assert.equal(started.tokenHint, "");
  assert.match(started.message, /do not copy it from myapi/i);
});

test("saving a Fyers token does not switch the selected Dhan desk", () => {
  const dual = { id: "u-fyers-dhan", name: "Dual", email: "fyersdhan@t2s.app", role: "user" };
  installMemberBroker({
    user: dual,
    brokerId: "fyers",
    clientId: "DA02189",
    apiKey: "Z2MCJB4OXH-333-200",
    sessionToken: "fyers-app-secret-66666666",
  });
  installMemberBroker({
    user: dual,
    brokerId: "dhan",
    clientId: "11008888",
    accessToken: "dhan-keep-this-token",
  });
  selectMemberBroker({ user: dual, brokerId: "dhan" });
  receiveFyersAccessToken({
    apiKey: "Z2MCJB4OXH-333-200",
    access_token: "fyers-arrived-while-dhan-selected",
    fy_id: "DA02189",
  });
  assert.equal(peekClientSecrets(dual.id).brokerId, "dhan");
  assert.equal(peekClientSecrets(dual.id).brokerToken, "dhan-keep-this-token");
  assert.equal(peekBrokerAccount(dual.id, "fyers").brokerToken, "fyers-arrived-while-dhan-selected");
});
