import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsertDhanEnv } from "./env.js";
import { ipv4Request } from "./ipv4.js";
import { normalizeTotpSecret, totpCodes } from "./totp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, ".dhan-session.json");
const AUTH = "https://auth.dhan.co";
const API = "https://api.dhan.co/v2";

function emptySession() {
  return {
    clientId: "",
    accessToken: "",
    pin: "",
    totpSecret: "",
    expiryTime: "",
    source: "",
    autoStart: true,
  };
}

export function mergeDhanCredentials(session = {}, env = process.env) {
  const next = { ...emptySession(), ...session };
  const clientId = String(env.DHAN_CLIENT_ID || "").trim();
  const pin = String(env.DHAN_PIN || "").trim();
  const totp = normalizeTotpSecret(env.DHAN_TOTP_SECRET);
  if (clientId) next.clientId = clientId;
  if (pin) next.pin = pin;
  if (totp) next.totpSecret = totp;
  else next.totpSecret = normalizeTotpSecret(next.totpSecret);
  if (!next.accessToken) next.accessToken = String(env.DHAN_ACCESS_TOKEN || "").trim();
  return next;
}

export function loadDhanSession() {
  const session = emptySession();
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    Object.assign(session, raw && typeof raw === "object" ? raw : {});
  } catch {
    /* first run */
  }
  return mergeDhanCredentials(session);
}

export function saveDhanSession(patch = {}) {
  const next = { ...loadDhanSession(), ...patch };
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(SESSION_FILE, 0o600);
  } catch {
    /* windows */
  }
  if (patch.clientId || patch.pin || patch.totpSecret) {
    upsertDhanEnv({
      clientId: next.clientId,
      pin: next.pin,
      totpSecret: next.totpSecret,
    });
  }
  return next;
}

const BACKOFF_FILE = path.join(__dirname, ".dhan-backoff.json");

export function loadTokenBackoff() {
  try {
    const raw = JSON.parse(fs.readFileSync(BACKOFF_FILE, "utf8"));
    return {
      generateBackoffUntil: Math.max(0, Number(raw.generateBackoffUntil) || 0),
      credentialsBlockedUntil: Math.max(0, Number(raw.credentialsBlockedUntil) || 0),
    };
  } catch {
    return { generateBackoffUntil: 0, credentialsBlockedUntil: 0 };
  }
}

export function saveTokenBackoff(patch = {}) {
  const prev = loadTokenBackoff();
  const next = {
    generateBackoffUntil:
      patch.generateBackoffUntil === undefined
        ? prev.generateBackoffUntil
        : Math.max(0, Number(patch.generateBackoffUntil) || 0),
    credentialsBlockedUntil:
      patch.credentialsBlockedUntil === undefined
        ? prev.credentialsBlockedUntil
        : Math.max(0, Number(patch.credentialsBlockedUntil) || 0),
  };
  fs.writeFileSync(BACKOFF_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

export function clearTokenBackoff() {
  return saveTokenBackoff({ generateBackoffUntil: 0, credentialsBlockedUntil: 0 });
}

export const TOKEN_RENEW_HOUR_IST = 8;
const RENEW_GRACE_MS = 15 * 60 * 1000;

function kolkataParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function nextDailyRenewalAt(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST) {
  const parts = kolkataParts(new Date(from));
  const today = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00:00+05:30`,
  );
  if (!Number.isFinite(today)) return from + 24 * 60 * 60 * 1000;
  if (from < today) return today;
  if (from - today < RENEW_GRACE_MS) return today;
  return today + 24 * 60 * 60 * 1000;
}

export function lastDailyResetAt(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST) {
  const parts = kolkataParts(new Date(from));
  const today = Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00:00+05:30`,
  );
  if (!Number.isFinite(today)) return from;
  return from >= today ? today : today - 24 * 60 * 60 * 1000;
}

export function tokenGeneratedAtMs({ accessToken, expiryTime, generatedAt } = {}) {
  const candidates = [];
  const saved = Date.parse(generatedAt || "");
  if (Number.isFinite(saved) && saved > 0) candidates.push(saved);
  const iat = jwtIssuedAtMs(accessToken);
  if (iat) candidates.push(iat);
  if (candidates.length) return Math.min(...candidates);
  const exp = Date.parse(resolveTokenExpiry({ accessToken, expiryTime }) || "");
  if (Number.isFinite(exp)) return exp - 24 * 60 * 60 * 1000;
  return 0;
}

export function needsFreshAccessToken(session = {}, from = Date.now()) {
  const token = String(session.accessToken || "").trim();
  if (!token) return true;
  const expiry = Date.parse(resolveTokenExpiry(session) || "");
  const remaining = Number.isFinite(expiry) ? expiry - from : NaN;
  if (!Number.isFinite(remaining) || remaining < 20 * 60 * 1000) return true;
  const generated = tokenGeneratedAtMs(session);
  const reset = lastDailyResetAt(from);
  return generated < reset;
}

export function msUntilDailyRenewal(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST) {
  return Math.max(5_000, nextDailyRenewalAt(from, hour) - from);
}

export function msUntilTokenKeepAlive(session = {}, from = Date.now()) {
  if (needsFreshAccessToken(session, from)) return 5_000;
  const nextReset = lastDailyResetAt(from) + 24 * 60 * 60 * 1000;
  let wait = Math.max(5_000, nextReset - from);
  const expiry = Date.parse(resolveTokenExpiry(session) || "");
  if (Number.isFinite(expiry)) {
    wait = Math.min(wait, Math.max(5_000, expiry - from - 5 * 60 * 1000));
  }
  return wait;
}

const TOKEN_STILL_GOOD_MS = 20 * 60 * 1000;

/**
 * Decide whether keep-alive should mint a new Dhan token or reuse the current JWT.
 * After today's 8:00 IST reset, mint always wins when PIN+TOTP exist — even if the
 * leftover JWT still has more than 20 minutes of life. Boot/retry used to skip mint
 * in that case and then debounce the 8:00 job.
 */
export function keepAlivePlan({
  reason = "schedule",
  canAutoGenerate = false,
  needsFresh = false,
  remainingMs = NaN,
  blockedUntil = 0,
  generateBackoffUntil = 0,
  now = Date.now(),
} = {}) {
  if (blockedUntil && now < blockedUntil) {
    return { action: "wait", because: "totp-blocked" };
  }
  if (generateBackoffUntil && now < generateBackoffUntil) {
    return { action: "wait", because: "generate-429" };
  }
  if (canAutoGenerate && needsFresh) {
    return { action: "mint", because: "daily-reset" };
  }
  const tokenStillGood = Number.isFinite(remainingMs) && remainingMs > TOKEN_STILL_GOOD_MS;
  if (tokenStillGood && (reason === "retry" || reason === "boot")) {
    return { action: "reuse", because: "jwt-still-valid" };
  }
  if (tokenStillGood && (reason === "schedule" || reason === "watchdog")) {
    return { action: "wait", because: "already-fresh" };
  }
  if (canAutoGenerate) {
    return { action: "mint", because: "expiry" };
  }
  if (tokenStillGood) {
    return { action: "reuse", because: "no-pin-totp" };
  }
  return { action: "fail", because: "expired-no-creds" };
}

export function dhanTokenStatus() {
  const session = loadDhanSession();
  const autoGenerate = Boolean(session.pin && session.totpSecret && session.clientId);
  const expiryTime = resolveTokenExpiry({
    accessToken: session.accessToken,
    expiryTime: session.expiryTime,
  });
  const staleAfterReset = autoGenerate && needsFreshAccessToken(session);
  const nextMs = staleAfterReset ? Date.now() : nextDailyRenewalAt();
  return {
    autoRenew: autoGenerate || Boolean(session.accessToken && session.source === "web"),
    autoMode: autoGenerate ? "generate" : session.source === "web" ? "renew" : "off",
    tokenExpiry: expiryTime || session.expiryTime || null,
    nextRenewAt: new Date(nextMs).toISOString(),
    autoStart: session.autoStart !== false,
    needsFresh: staleAfterReset,
  };
}

export function canAutoGenerate() {
  const session = loadDhanSession();
  return Boolean(session.clientId && session.pin && session.totpSecret);
}

export function requirePinTotp({ clientId, pin, totpSecret } = {}) {
  const session = loadDhanSession();
  const creds = {
    clientId: String(clientId || session.clientId || "").trim(),
    pin: String(pin || session.pin || "").trim(),
    totpSecret: normalizeTotpSecret(totpSecret || session.totpSecret),
  };
  if (!creds.clientId) {
    throw Object.assign(new Error("Dhan Client ID is required on the server to change the access token."), { status: 400 });
  }
  if (!/^\d{4,6}$/.test(creds.pin) || creds.totpSecret.length < 10) {
    throw Object.assign(
      new Error(
        "PIN + TOTP is required on the server to change the Dhan token. Save them on Brokers, or set DHAN_CLIENT_ID, DHAN_PIN, and DHAN_TOTP_SECRET.",
      ),
      { status: 400 },
    );
  }
  return creds;
}

export function jwtClaim(token, key) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return "";
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    const value = Number(payload[key]);
    if (!Number.isFinite(value) || value <= 0) return "";
    return new Date(value * 1000).toISOString();
  } catch {
    return "";
  }
}

export function jwtExpiryIso(token) {
  return jwtClaim(token, "exp");
}

export function jwtIssuedAtMs(token) {
  const iso = jwtClaim(token, "iat");
  const ms = Date.parse(iso || "");
  return Number.isFinite(ms) ? ms : 0;
}

export function parseDhanExpiry(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4] || "23"}:${dmy[5] || "59"}:${dmy[6] || "00"}+05:30`;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const ms = Date.parse(`${raw}+05:30`);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

export function resolveTokenExpiry({ accessToken, expiryTime, tokenValidity, fallbackHours = 0 } = {}) {
  const resolved = jwtExpiryIso(accessToken) || parseDhanExpiry(tokenValidity) || parseDhanExpiry(expiryTime);
  if (resolved) return resolved;
  if (fallbackHours && accessToken) return new Date(Date.now() + fallbackHours * 60 * 60 * 1000).toISOString();
  return "";
}

function collectErrorCodes(json, status) {
  const codes = [];
  if (status) codes.push(String(status));
  if (!json || typeof json !== "object") return codes;
  for (const value of [json.errorCode, json.error_code, json.error?.errorCode, json.error?.error_code, json.data?.errorCode]) {
    if (value) codes.push(String(value));
  }
  const data = json.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const key of Object.keys(data)) {
      if (/^\d{3}$/.test(key) || /^DH-\d+/i.test(key)) codes.push(key);
    }
  }
  return codes;
}

export function dhanErrorFlags(json, status) {
  const codes = collectErrorCodes(json, status).map((code) => String(code).toUpperCase());
  const blob = `${JSON.stringify(json || {})} ${status || ""}`;
  const tooManyAttempts = /too many attempts/i.test(blob);
  const rateLimit =
    codes.includes("429") ||
    codes.includes("DH-904") ||
    codes.includes("805") ||
    tooManyAttempts ||
    /too many requests|rate limit/i.test(blob);
  const invalidTotp = !rateLimit && /invalid totp|invalid pin/i.test(blob);
  const authExpired =
    !invalidTotp &&
    !rateLimit &&
    (codes.includes("401") ||
      codes.includes("DH-901") ||
      codes.includes("807") ||
      codes.includes("808") ||
      codes.includes("809") ||
      /token is expired|access token is invalid|invalid or expired|authentication failed|client id or user generated access token/i.test(
        blob,
      ));
  const emptyCollection =
    codes.includes("DH-1111") ||
    /holding_error|no holdings available|no position/i.test(blob);
  return { rateLimit, authExpired, invalidTotp, tooManyAttempts, emptyCollection, codes };
}

export function retryAfterMs(res, fallback = 2000) {
  const raw = res?.headers?.["retry-after"];
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n > 100 ? n : Math.max(1, n) * 1000;
  return fallback;
}

export function isDhanRateLimitError(error) {
  if (!error) return false;
  if (error.rateLimit || error.status === 429) return true;
  return dhanErrorFlags(error.body, error.status).rateLimit;
}

export function isDhanAuthExpiredError(error) {
  if (!error) return false;
  if (error.authExpired || error.status === 401) return true;
  return dhanErrorFlags(error.body, error.status).authExpired;
}

export function isDhanInvalidTotpError(error) {
  if (!error) return false;
  if (error.invalidTotp) return true;
  return dhanErrorFlags(error.body, error.status).invalidTotp || /invalid totp/i.test(String(error.message || ""));
}

export function isDhanEmptyCollectionError(error) {
  if (!error) return false;
  if (error.emptyCollection) return true;
  return dhanErrorFlags(error.body, error.status).emptyCollection;
}

async function readJson(res) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { json, text };
}

function tokenFrom(json) {
  const data = json?.data && typeof json.data === "object" ? json.data : json || {};
  return {
    accessToken: String(data.accessToken || data.access_token || json?.accessToken || "").trim(),
    clientId: String(data.dhanClientId || data.clientId || "").trim(),
    expiryTime: String(data.expiryTime || data.expiry_time || "").trim(),
    name: String(data.dhanClientName || "").trim(),
  };
}

function throwAuth(json, text, fallback, status) {
  const flags = dhanErrorFlags(json, status);
  let message =
    json?.errorMessage ||
    json?.error_message ||
    json?.message ||
    json?.remarks ||
    (typeof json?.data === "object" && json.data
      ? Object.values(json.data).find((value) => typeof value === "string" && value.trim())
      : "") ||
    (typeof text === "string" && text.length < 180 ? text : "") ||
    fallback;
  if (flags.invalidTotp) {
    message =
      "Invalid TOTP: use the Dhan PIN and the Setup TOTP secret from web.dhan.co (not the 6-digit code that changes). Also check `timedatectl` — a wrong VPS clock breaks TOTP.";
  }
  const error = new Error(String(message || fallback));
  error.status = flags.rateLimit ? 429 : flags.invalidTotp ? 400 : flags.authExpired ? 401 : status || 400;
  error.body = json;
  error.rateLimit = flags.rateLimit;
  error.authExpired = flags.authExpired;
  error.invalidTotp = flags.invalidTotp;
  error.tooManyAttempts = flags.tooManyAttempts;
  if (flags.tooManyAttempts) error.retryAfterMs = 30 * 60 * 1000;
  throw error;
}

export async function generateDhanAccessToken({ clientId, pin, totpSecret } = {}) {
  const id = String(clientId || loadDhanSession().clientId || "").trim();
  const usePin = String(pin || loadDhanSession().pin || "").trim();
  const secret = normalizeTotpSecret(totpSecret || loadDhanSession().totpSecret);
  if (!id) throw Object.assign(new Error("Dhan Client ID is required."), { status: 400 });
  if (!/^\d{4,6}$/.test(usePin)) {
    throw Object.assign(new Error("Dhan PIN must be the 4–6 digit PIN from the Dhan app, not the TOTP code."), {
      status: 400,
    });
  }
  if (secret.length < 10) {
    throw Object.assign(
      new Error("Paste the TOTP secret key from web.dhan.co → Setup TOTP. Do not paste the 6-digit code that changes every 30 seconds."),
      { status: 400 },
    );
  }

  let lastError = null;
  let lastStatus = 0;
  let lastText = "";
  for (const totp of totpCodes(secret)) {
    const url = new URL(`${AUTH}/app/generateAccessToken`);
    url.searchParams.set("dhanClientId", id);
    url.searchParams.set("pin", usePin);
    url.searchParams.set("totp", totp);
    const res = await ipv4Request(url.toString(), {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const { json, text } = await readJson(res);
    const parsed = tokenFrom(json);
    if (res.ok && parsed.accessToken) {
      const expiryTime = resolveTokenExpiry({
        accessToken: parsed.accessToken,
        expiryTime: parsed.expiryTime,
        fallbackHours: 24,
      });
      saveDhanSession({
        clientId: parsed.clientId || id,
        accessToken: parsed.accessToken,
        pin: usePin,
        totpSecret: secret,
        expiryTime,
        generatedAt: new Date().toISOString(),
        source: "totp",
        autoStart: loadDhanSession().autoStart !== false,
      });
      console.log(`Dhan token generated · expires ${expiryTime}`);
      return { ...parsed, expiryTime, clientId: parsed.clientId || id };
    }
    const flags = dhanErrorFlags(json, res.status);
    lastError = json || { raw: text };
    lastStatus = res.status;
    lastText = text;
    if (flags.rateLimit) {
      throwAuth(json, text, "Dhan 429: too many token requests. Wait and retry — this is not an expired token.", 429);
    }
  }
  throwAuth(
    lastError,
    lastText,
    "Dhan did not generate a token. Check Client ID, PIN, and TOTP secret. Enable Setup TOTP on web.dhan.co first.",
    lastStatus,
  );
}

export async function renewDhanAccessToken() {
  const session = loadDhanSession();
  if (!session.accessToken || !session.clientId) {
    throw Object.assign(new Error("No Dhan token to renew."), { status: 400 });
  }
  const headers = {
    Accept: "application/json",
    "access-token": session.accessToken,
    dhanClientId: session.clientId,
  };
  const res = await ipv4Request(`${API}/RenewToken`, { method: "GET", headers });
  const { json, text } = await readJson(res);
  const parsed = tokenFrom(json);
  if (!res.ok || !parsed.accessToken) {
    throwAuth(json, text, "Dhan could not renew this token. Generate a new one with PIN + TOTP, or paste a fresh token.", res.status);
  }
  const expiryTime = resolveTokenExpiry({
    accessToken: parsed.accessToken,
    expiryTime: parsed.expiryTime,
    fallbackHours: 24,
  });
  saveDhanSession({
    accessToken: parsed.accessToken,
    clientId: parsed.clientId || session.clientId,
    expiryTime,
    generatedAt: new Date().toISOString(),
    source: session.source || "web",
    autoStart: session.autoStart !== false,
  });
  console.log(`Dhan token renewed · expires ${expiryTime}`);
  return { ...parsed, expiryTime, clientId: parsed.clientId || session.clientId };
}

export function persistPastedToken({ clientId, accessToken, expiryTime, tokenValidity }) {
  const session = loadDhanSession();
  const token = String(accessToken || "").trim();
  const tokenChanged = token !== String(session.accessToken || "").trim();
  saveDhanSession({
    clientId: String(clientId || session.clientId || "").trim(),
    accessToken: token,
    expiryTime: resolveTokenExpiry({
      accessToken: token,
      expiryTime,
      tokenValidity,
      fallbackHours: 24,
    }),
    generatedAt: tokenChanged ? new Date().toISOString() : session.generatedAt,
    source: session.pin && session.totpSecret ? session.source || "totp" : "web",
    autoStart: true,
  });
}

export function markDhanAutoStart(enabled) {
  saveDhanSession({ autoStart: Boolean(enabled) });
}
