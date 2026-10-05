import { upstoxErrorMessage } from "./liveBrokers.js";
import {
  findUserIdByUpstoxAccount,
  findUserIdByUpstoxApiKey,
  peekBrokerAccount,
  peekClientSecrets,
  publicBrokerInstall,
  saveMemberUpstoxAccessToken,
} from "./memberDesk.js";

const TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token";
const REQUEST_URL = "https://api.upstox.com/v3/login/auth/token/request";
const DIALOG_URL = "https://api.upstox.com/v2/login/authorization/dialog";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function upstoxPublicOrigin(env = process.env) {
  return String(env.T2S_PUBLIC_URL || env.T2S_SITE_URL || "https://trade2smart.com")
    .trim()
    .replace(/\/+$/, "");
}

export function upstoxRedirectUri(env = process.env) {
  return String(env.T2S_UPSTOX_REDIRECT_URI || `${upstoxPublicOrigin(env)}/api/upstox/callback`).trim();
}

export function upstoxNotifierUri(env = process.env) {
  return String(env.T2S_UPSTOX_NOTIFIER_URI || `${upstoxPublicOrigin(env)}/api/upstox/token`).trim();
}

export function upstoxOauthCreds(slot = {}, desk = {}) {
  const apiKey = String(slot.brokerApiKey || desk.brokerApiKey || "").trim();
  const apiSecret = String(slot.brokerSessionToken || desk.brokerSessionToken || "").trim();
  return { apiKey, apiSecret, ready: apiKey.length >= 8 && apiSecret.length >= 8 };
}

export function upstoxAuthorizeUrl({ apiKey, redirectUri, state } = {}, env = process.env) {
  const clientId = String(apiKey || "").trim();
  if (!clientId) throw fail("Save the Upstox API key first.");
  const redirect = String(redirectUri || upstoxRedirectUri(env)).trim();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
  });
  if (state) params.set("state", String(state));
  return `${DIALOG_URL}?${params}`;
}

export async function exchangeUpstoxAuthCode(
  { code, apiKey, apiSecret, redirectUri } = {},
  fetchImpl = fetch,
  env = process.env,
) {
  const creds = {
    code: String(code || "").trim(),
    client_id: String(apiKey || "").trim(),
    client_secret: String(apiSecret || "").trim(),
    redirect_uri: String(redirectUri || upstoxRedirectUri(env)).trim(),
    grant_type: "authorization_code",
  };
  if (!creds.code) throw fail("Upstox did not return an authorization code.");
  if (!creds.client_id || !creds.client_secret) throw fail("Save the Upstox API key and API secret first.");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(creds).toString(),
  });
  const body = await res.json().catch(() => ({}));
  const token = String(body.access_token || body.data?.access_token || "").trim();
  if (!res.ok || !token) throw fail(upstoxErrorMessage(body, res) || "Upstox did not return a trading access token.", res.status === 401 ? 401 : 400);
  return {
    accessToken: token,
    refreshToken: String(body.refresh_token || body.data?.refresh_token || "").trim(),
    userId: String(body.user_id || body.data?.user_id || "").trim(),
    expiresAt: String(body.expires_at || body.data?.expires_at || "").trim(),
  };
}

export async function exchangeUpstoxRefreshToken(
  { apiKey, apiSecret, refreshToken, redirectUri } = {},
  fetchImpl = fetch,
  env = process.env,
) {
  const creds = {
    client_id: String(apiKey || "").trim(),
    client_secret: String(apiSecret || "").trim(),
    redirect_uri: String(redirectUri || upstoxRedirectUri(env)).trim(),
    grant_type: "refresh_token",
    refresh_token: String(refreshToken || "").trim(),
  };
  if (!creds.client_id || !creds.client_secret) throw fail("Save the Upstox API key and API secret first.");
  if (!creds.refresh_token) throw fail("Upstox refresh token is missing.");
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(creds).toString(),
  });
  const body = await res.json().catch(() => ({}));
  const token = String(body.access_token || body.data?.access_token || "").trim();
  if (!res.ok || !token) {
    throw fail(upstoxErrorMessage(body, res) || "Upstox did not renew the trading access token.", res.status === 401 ? 401 : 400);
  }
  return {
    accessToken: token,
    refreshToken: String(body.refresh_token || body.data?.refresh_token || creds.refresh_token).trim(),
    userId: String(body.user_id || body.data?.user_id || "").trim(),
    expiresAt: String(body.expires_at || body.data?.expires_at || "").trim(),
  };
}

export async function renewUpstoxAccessTokenForUser(userId, fetchImpl = fetch) {
  const desk = peekClientSecrets(userId);
  const slot = peekBrokerAccount(userId, "upstox");
  const creds = upstoxOauthCreds(slot, desk);
  const refreshToken = String(slot.brokerRefreshToken || "").trim();
  if (!creds.ready) return { ok: false, reason: "missing_oauth" };
  if (!refreshToken) return { ok: false, reason: "missing_refresh" };
  const minted = await exchangeUpstoxRefreshToken({ ...creds, refreshToken }, fetchImpl);
  return saveMemberUpstoxAccessToken(userId, {
    accessToken: minted.accessToken,
    refreshToken: minted.refreshToken,
    accountId: minted.userId,
    expiresAt: minted.expiresAt,
  });
}

export async function requestUpstoxTradingToken({ apiKey, apiSecret } = {}, fetchImpl = fetch) {
  const clientId = String(apiKey || "").trim();
  const secret = String(apiSecret || "").trim();
  if (!clientId || !secret) throw fail("Save the Upstox API key and API secret first.");
  const res = await fetchImpl(`${REQUEST_URL}/${encodeURIComponent(clientId)}`, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_secret: secret }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || String(body.status || "").toLowerCase() === "error") {
    throw fail(upstoxErrorMessage(body, res) || "Upstox could not start the trading-token request.", res.status === 401 ? 401 : 400);
  }
  return {
    ok: true,
    notifierUrl: String(body.data?.notifier_url || "").trim(),
    expiresAt: String(body.data?.authorization_expiry || "").trim(),
  };
}

export async function requestUpstoxTradingTokenForUser(userId, fetchImpl = fetch) {
  const desk = peekClientSecrets(userId);
  const slot = peekBrokerAccount(userId, "upstox");
  const creds = upstoxOauthCreds(slot, desk);
  if (!creds.ready) return { ok: false, reason: "missing_oauth" };
  const asked = await requestUpstoxTradingToken(creds, fetchImpl);
  return { ...asked, userId };
}

function parseJsonObject(value) {
  if (typeof value !== "string") return null;
  try {
    const row = JSON.parse(value);
    return row && typeof row === "object" && !Array.isArray(row) ? row : null;
  } catch {
    return null;
  }
}

export function upstoxNotifierPayload(payload = {}) {
  const raw = typeof payload === "string" ? parseJsonObject(payload) || {} : payload && typeof payload === "object" ? payload : {};
  const nested = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : {};
  const row = { ...raw, ...nested };
  return {
    apiKey: String(row.client_id || row.apiKey || row.api_key || "").trim(),
    accessToken: String(row.access_token || row.accessToken || "")
      .trim()
      .replace(/^Bearer\s+/i, "")
      .trim(),
    accountId: String(row.user_id || row.userId || row.ucc || "").trim(),
    expiresAt: String(row.expires_at || row.expiresAt || "").trim(),
    refreshToken: String(row.refresh_token || row.refreshToken || "").trim(),
  };
}

export function receiveUpstoxAccessToken(payload = {}) {
  const row = upstoxNotifierPayload(payload);
  if (!row.accessToken) throw fail("Upstox webhook did not include an access_token.");
  const userId = findUserIdByUpstoxApiKey(row.apiKey) || findUserIdByUpstoxAccount(row.accountId);
  if (!userId) throw fail("No member saved that Upstox API key. Save API key + secret on My plan first.");
  return saveMemberUpstoxAccessToken(userId, {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accountId: row.accountId,
    expiresAt: row.expiresAt,
  });
}

export function memberUpstoxAuthStatus(userId) {
  const desk = peekClientSecrets(userId);
  const slot = peekBrokerAccount(userId, "upstox");
  const creds = upstoxOauthCreds(slot, desk);
  return {
    ready: creds.ready,
    autoRenew: creds.ready,
    autoTokenLabel: creds.ready ? "8:00 AM IST" : "",
    hasRefreshToken: Boolean(String(slot.brokerRefreshToken || "").trim()),
    hasTradingToken: Boolean(String(slot.brokerToken || desk.brokerToken || "").trim()),
    notifierUri: upstoxNotifierUri(),
    redirectUri: upstoxRedirectUri(),
  };
}

function memberUpstoxInstallView(userId) {
  const slot = peekBrokerAccount(userId, "upstox");
  return publicBrokerInstall({
    brokerId: "upstox",
    accountId: slot.accountId,
    brokerToken: slot.brokerToken,
    brokerApiKey: slot.brokerApiKey,
    brokerSessionToken: slot.brokerSessionToken,
    brokerRefreshToken: slot.brokerRefreshToken,
    brokerTokenUpdatedAt: slot.tokenUpdatedAt,
    brokerAccounts: { upstox: slot },
  });
}

export async function startMemberUpstoxToken(user, fetchImpl = fetch, env = process.env) {
  if (!user?.id) throw fail("Sign in first.", 401);
  try {
    const renewed = await renewUpstoxAccessTokenForUser(user.id, fetchImpl);
    if (renewed.ok) {
      const slot = peekBrokerAccount(user.id, "upstox");
      const install = memberUpstoxInstallView(user.id);
      return {
        ok: true,
        asked: false,
        renewed: true,
        hasTradingToken: true,
        tokenHint: install.tokenHint || "",
        loginUrl: upstoxAuthorizeUrl({ apiKey: upstoxOauthCreds(slot).apiKey, state: user.id }, env),
        notifierUri: upstoxNotifierUri(env),
        redirectUri: upstoxRedirectUri(env),
        expiresAt: "",
        message: "Renewed today's Upstox trading token automatically (same 8:00 AM IST reset as admin Dhan).",
      };
    }
  } catch (error) {
    console.log(`Upstox silent renew failed for ${user.id}: ${error.message || error}`);
  }
  const asked = await requestUpstoxTradingTokenForUser(user.id, fetchImpl);
  if (!asked.ok) throw fail("Save the Upstox API key and API secret on My plan first.");
  const slot = peekBrokerAccount(user.id, "upstox");
  const status = memberUpstoxAuthStatus(user.id);
  const install = memberUpstoxInstallView(user.id);
  return {
    ok: true,
    asked: true,
    renewed: false,
    hasTradingToken: status.hasTradingToken,
    tokenHint: install.tokenHint || "",
    loginUrl: upstoxAuthorizeUrl({ apiKey: upstoxOauthCreds(slot).apiKey, state: user.id }, env),
    notifierUri: upstoxNotifierUri(env),
    redirectUri: upstoxRedirectUri(env),
    expiresAt: asked.expiresAt,
    message: status.hasTradingToken
      ? "Upstox already has a trading token on this account. Approve the new request to replace it."
      : "Asked Upstox for today's trading token. Approve the Upstox app / WhatsApp notification. This page will say when the token arrives.",
  };
}
