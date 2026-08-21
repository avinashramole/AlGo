import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ipv4Request } from "./ipv4.js";
import { totpCodes } from "./totp.js";

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

export function loadDhanSession() {
  const session = emptySession();
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    Object.assign(session, raw && typeof raw === "object" ? raw : {});
  } catch {
    /* first run */
  }
  if (!session.clientId) session.clientId = String(process.env.DHAN_CLIENT_ID || "").trim();
  if (!session.accessToken) session.accessToken = String(process.env.DHAN_ACCESS_TOKEN || "").trim();
  if (!session.pin) session.pin = String(process.env.DHAN_PIN || "").trim();
  if (!session.totpSecret) session.totpSecret = String(process.env.DHAN_TOTP_SECRET || "").trim();
  return session;
}

export function saveDhanSession(patch = {}) {
  const next = { ...loadDhanSession(), ...patch };
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(SESSION_FILE, 0o600);
  } catch {
    /* windows */
  }
  return next;
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

export function msUntilDailyRenewal(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST) {
  return Math.max(5_000, nextDailyRenewalAt(from, hour) - from);
}

export function dhanTokenStatus() {
  const session = loadDhanSession();
  const autoGenerate = Boolean(session.pin && session.totpSecret && session.clientId);
  const expiryTime = resolveTokenExpiry({
    accessToken: session.accessToken,
    expiryTime: session.expiryTime,
  });
  return {
    autoRenew: autoGenerate || Boolean(session.accessToken && session.source === "web"),
    autoMode: autoGenerate ? "generate" : session.source === "web" ? "renew" : "off",
    tokenExpiry: expiryTime || session.expiryTime || null,
    nextRenewAt: new Date(nextDailyRenewalAt()).toISOString(),
    autoStart: session.autoStart !== false,
  };
}

export function canAutoGenerate() {
  const session = loadDhanSession();
  return Boolean(session.clientId && session.pin && session.totpSecret);
}

export function jwtExpiryIso(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return "";
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp <= 0) return "";
    return new Date(exp * 1000).toISOString();
  } catch {
    return "";
  }
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
  const rateLimit =
    codes.includes("429") ||
    codes.includes("DH-904") ||
    codes.includes("805") ||
    /too many requests|rate limit/i.test(blob);
  const authExpired =
    codes.includes("401") ||
    codes.includes("DH-901") ||
    codes.includes("807") ||
    codes.includes("808") ||
    codes.includes("809") ||
    /token is expired|access token is invalid|invalid or expired|authentication failed|client id or user generated access token/i.test(
      blob,
    );
  return { rateLimit, authExpired, codes };
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
  const message =
    json?.errorMessage ||
    json?.error_message ||
    json?.message ||
    json?.remarks ||
    (typeof json?.data === "object" && json.data
      ? Object.values(json.data).find((value) => typeof value === "string" && value.trim())
      : "") ||
    (typeof text === "string" && text.length < 180 ? text : "") ||
    fallback;
  const error = new Error(String(message || fallback));
  error.status = flags.rateLimit ? 429 : flags.authExpired ? 401 : status || 400;
  error.body = json;
  error.rateLimit = flags.rateLimit;
  error.authExpired = flags.authExpired;
  throw error;
}

export async function generateDhanAccessToken({ clientId, pin, totpSecret } = {}) {
  const id = String(clientId || loadDhanSession().clientId || "").trim();
  const usePin = String(pin || loadDhanSession().pin || "").trim();
  const secret = String(totpSecret || loadDhanSession().totpSecret || "").trim();
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
        source: "totp",
        autoStart: true,
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
    source: session.source || "web",
    autoStart: true,
  });
  console.log(`Dhan token renewed · expires ${expiryTime}`);
  return { ...parsed, expiryTime, clientId: parsed.clientId || session.clientId };
}

export function persistPastedToken({ clientId, accessToken, expiryTime, tokenValidity }) {
  const session = loadDhanSession();
  const token = String(accessToken || "").trim();
  saveDhanSession({
    clientId: String(clientId || session.clientId || "").trim(),
    accessToken: token,
    expiryTime: resolveTokenExpiry({
      accessToken: token,
      expiryTime,
      tokenValidity,
      fallbackHours: 24,
    }),
    source: session.pin && session.totpSecret ? session.source || "totp" : "web",
    autoStart: true,
  });
}

export function markDhanAutoStart(enabled) {
  saveDhanSession({ autoStart: Boolean(enabled) });
}
