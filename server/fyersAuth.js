import crypto from "node:crypto";
import { assertFyersOk } from "./liveBrokers.js";
import {
  findUserIdByFyersAccount,
  findUserIdByFyersApiKey,
  peekBrokerAccount,
  peekClientSecrets,
  publicBrokerInstall,
  saveMemberFyersAccessToken,
} from "./memberDesk.js";

const AUTH_URL = "https://api-t1.fyers.in/api/v3/generate-authcode";
const TOKEN_URL = "https://api-t1.fyers.in/api/v3/validate-authcode";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function fyersPublicOrigin(env = process.env) {
  return String(env.T2S_PUBLIC_URL || env.T2S_SITE_URL || "https://trade2smart.com")
    .trim()
    .replace(/\/+$/, "");
}

export function fyersRedirectUri(env = process.env) {
  return String(env.T2S_FYERS_REDIRECT_URI || `${fyersPublicOrigin(env)}/api/fyers/callback`).trim();
}

export function fyersAppIdHash(appId, appSecret) {
  return crypto
    .createHash("sha256")
    .update(`${String(appId || "").trim()}:${String(appSecret || "").trim()}`)
    .digest("hex");
}

export function fyersOauthCreds(slot = {}, desk = {}) {
  const apiKey = String(slot.brokerApiKey || desk.brokerApiKey || "").trim();
  const apiSecret = String(slot.brokerSessionToken || desk.brokerSessionToken || "").trim();
  return { apiKey, apiSecret, ready: apiKey.length >= 8 && apiSecret.length >= 8 };
}

export function fyersOauthState(userId, next = "plans") {
  const id = String(userId || "").trim();
  return next === "users" ? `${id}|users` : id;
}

export function parseFyersOauthState(state) {
  const raw = String(state || "").trim();
  const [userId, next] = raw.split("|");
  return { userId: String(userId || "").trim(), next: next === "users" ? "users" : "plans" };
}

export function fyersAuthCodeFromQuery(query = {}) {
  return String(query.auth_code || query.authCode || query.code || "").trim();
}

export function fyersAuthorizeUrl({ apiKey, redirectUri, state } = {}, env = process.env) {
  const clientId = String(apiKey || "").trim();
  if (!clientId) throw fail("Save the Fyers App ID first.");
  const redirect = String(redirectUri || fyersRedirectUri(env)).trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    state: String(state || "t2s"),
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeFyersAuthCode(
  { code, apiKey, apiSecret } = {},
  fetchImpl = fetch,
) {
  const authCode = String(code || "").trim();
  const appId = String(apiKey || "").trim();
  const secret = String(apiSecret || "").trim();
  if (!authCode) throw fail("Fyers did not return an auth code. Log in again with Get today's token.");
  if (!appId || !secret) throw fail("Save the Fyers App ID and App Secret first.");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      appIdHash: fyersAppIdHash(appId, secret),
      code: authCode,
    }),
  });
  const body = await res.json().catch(() => ({}));
  const row = body && typeof body === "object" && body.data && typeof body.data === "object" ? { ...body, ...body.data } : body;
  try {
    assertFyersOk(row, "Fyers did not return today's access token.");
  } catch (error) {
    error.status = res.status === 401 || Number(row?.code) === -16 || Number(row?.code) === -8 ? 401 : error.status || 400;
    throw error;
  }
  const token = String(row.access_token || row.accessToken || "").trim();
  if (!res.ok || !token) throw fail(String(row.message || row.errmsg || "Fyers did not return today's access token."), res.status === 401 ? 401 : 400);
  return {
    accessToken: token,
    refreshToken: String(row.refresh_token || row.refreshToken || "").trim(),
    accountId: String(row.fy_id || row.fyId || row.client_id || row.ucc || "").trim(),
  };
}

export function receiveFyersAccessToken(payload = {}) {
  const apiKey = String(payload.apiKey || payload.appId || payload.client_id || "").trim();
  const accountId = String(payload.accountId || payload.fy_id || payload.ucc || payload.user_id || "").trim();
  const accessToken = String(payload.accessToken || payload.access_token || "").trim();
  if (!accessToken) throw fail("Fyers login did not include an access token.");
  const userId = findUserIdByFyersApiKey(apiKey) || findUserIdByFyersAccount(accountId);
  if (!userId) throw fail("No member saved that Fyers App ID. Save UCC + App ID + App Secret first.");
  return saveMemberFyersAccessToken(userId, { accessToken, accountId });
}

export function memberFyersAuthStatus(userId) {
  const desk = peekClientSecrets(userId);
  const slot = peekBrokerAccount(userId, "fyers");
  const creds = fyersOauthCreds(slot, desk);
  return {
    ready: creds.ready,
    hasTradingToken: Boolean(String(slot.brokerToken || desk.brokerToken || "").trim()),
    redirectUri: fyersRedirectUri(),
  };
}

export async function startMemberFyersToken(user, _fetchImpl = fetch, env = process.env, { next = "plans" } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = peekClientSecrets(user.id);
  const slot = peekBrokerAccount(user.id, "fyers");
  const creds = fyersOauthCreds(slot, desk);
  if (!creds.ready) throw fail("Save the Fyers App ID and App Secret first. Fyers does not show a pasteable access token — Get today's token logs the user in and stores it.");
  const status = memberFyersAuthStatus(user.id);
  const install = publicBrokerInstall({
    brokerId: "fyers",
    accountId: slot.accountId,
    brokerToken: slot.brokerToken,
    brokerApiKey: slot.brokerApiKey,
    brokerSessionToken: slot.brokerSessionToken,
    tokenUpdatedAt: slot.tokenUpdatedAt,
  });
  return {
    ok: true,
    asked: true,
    hasTradingToken: status.hasTradingToken,
    tokenHint: install.tokenHint || "",
    loginUrl: fyersAuthorizeUrl({ apiKey: creds.apiKey, state: fyersOauthState(user.id, next) }, env),
    redirectUri: fyersRedirectUri(env),
    message: status.hasTradingToken
      ? "Fyers already has a token on this account. Log in again to replace it with today's token."
      : "Open the Fyers login. After the Fyers user signs in, today's access token is saved here. You do not copy it from myapi.fyers.in.",
  };
}

export async function startClientFyersToken(userId, env = process.env) {
  return startMemberFyersToken({ id: userId }, fetch, env, { next: "users" });
}
