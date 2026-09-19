import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-upstox-auth-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_PUBLIC_URL = "https://trade2smart.com";

const { installMemberBroker, peekBrokerAccount, peekClientSecrets } = await import("./memberDesk.js");
const {
  exchangeUpstoxAuthCode,
  receiveUpstoxAccessToken,
  requestUpstoxTradingToken,
  startMemberUpstoxToken,
  upstoxAuthorizeUrl,
  upstoxNotifierUri,
  upstoxOauthCreds,
} = await import("./upstoxAuth.js");

const member = { id: "u-upx-auth", name: "Upstox Auth", email: "upxauth@t2s.app", role: "user" };

test("API key and secret are enough to install Upstox before a trading token exists", () => {
  const saved = installMemberBroker({
    user: member,
    brokerId: "upstox",
    clientId: "393216",
    apiKey: "upstox-api-key-11111111",
    sessionToken: "upstox-api-secret-22222222",
  });
  assert.equal(saved.install.accountId, "393216");
  assert.equal(saved.install.installed, false);
  const slot = peekBrokerAccount(member.id, "upstox");
  assert.equal(slot.brokerApiKey, "upstox-api-key-11111111");
  assert.equal(slot.brokerSessionToken, "upstox-api-secret-22222222");
  assert.equal(upstoxOauthCreds(slot, peekClientSecrets(member.id)).ready, true);
});

test("token request posts API secret to the official Upstox initiator API", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "success", data: { notifier_url: "https://trade2smart.com/api/upstox/token", authorization_expiry: "1732226400000" } }),
    };
  };
  const asked = await requestUpstoxTradingToken(
    { apiKey: "upstox-api-key-11111111", apiSecret: "upstox-api-secret-22222222" },
    fetchImpl,
  );
  assert.equal(asked.ok, true);
  assert.match(calls[0].url, /v3\/login\/auth\/token\/request\/upstox-api-key-11111111/);
  assert.match(String(calls[0].body), /upstox-api-secret-22222222/);
});

test("OAuth dialog uses the stored API key and site callback", () => {
  assert.equal(upstoxNotifierUri(), "https://trade2smart.com/api/upstox/token");
  const url = upstoxAuthorizeUrl({ apiKey: "upstox-api-key-11111111", state: member.id });
  assert.match(url, /login\/authorization\/dialog/);
  assert.match(url, /client_id=upstox-api-key-11111111/);
  assert.match(url, /redirect_uri=https%3A%2F%2Ftrade2smart.com%2Fapi%2Fupstox%2Fcallback/);
});

test("auth-code exchange stores the trading access token, not the analytics token", async () => {
  const fetchImpl = async (_url, options) => {
    assert.match(String(options.body), /grant_type=authorization_code/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: "upstox-trading-token-64MI", user_id: "393216" }),
    };
  };
  const minted = await exchangeUpstoxAuthCode(
    { code: "mk404x", apiKey: "upstox-api-key-11111111", apiSecret: "upstox-api-secret-22222222" },
    fetchImpl,
  );
  assert.equal(minted.accessToken, "upstox-trading-token-64MI");
  const saved = receiveUpstoxAccessToken({
    client_id: "upstox-api-key-11111111",
    access_token: minted.accessToken,
    user_id: "393216",
  });
  assert.equal(saved.ok, true);
  assert.equal(peekBrokerAccount(member.id, "upstox").brokerToken, "upstox-trading-token-64MI");
  assert.equal(peekClientSecrets(member.id).brokerToken, "upstox-trading-token-64MI");
});

test("Get today's token asks Upstox and returns the approve URL", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "success", data: { notifier_url: "https://trade2smart.com/api/upstox/token" } }),
  });
  const started = await startMemberUpstoxToken(member, fetchImpl);
  assert.equal(started.ok, true);
  assert.match(started.loginUrl, /authorization\/dialog/);
  assert.match(started.message, /Approve today's trading token/);
});
