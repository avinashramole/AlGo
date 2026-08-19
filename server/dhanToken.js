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

export function dhanTokenStatus() {
  const session = loadDhanSession();
  const autoGenerate = Boolean(session.pin && session.totpSecret && session.clientId);
  return {
    autoRenew: autoGenerate || Boolean(session.accessToken && session.source === "web"),
    autoMode: autoGenerate ? "generate" : session.source === "web" ? "renew" : "off",
    tokenExpiry: session.expiryTime || null,
    autoStart: session.autoStart !== false,
  };
}

export function canAutoGenerate() {
  const session = loadDhanSession();
  return Boolean(session.clientId && session.pin && session.totpSecret);
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

function throwAuth(json, text, fallback) {
  const message =
    json?.errorMessage ||
    json?.error_message ||
    json?.message ||
    json?.remarks ||
    (typeof text === "string" && text.length < 180 ? text : "") ||
    fallback;
  const error = new Error(String(message || fallback));
  error.status = 400;
  error.body = json;
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
      const expiryTime = parsed.expiryTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
    lastError = json || { raw: text };
  }
  throwAuth(
    lastError,
    "",
    "Dhan did not generate a token. Check Client ID, PIN, and TOTP secret. Enable Setup TOTP on web.dhan.co first.",
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
  let res = await ipv4Request(`${API}/RenewToken`, { method: "GET", headers });
  let { json, text } = await readJson(res);
  if (!res.ok || !tokenFrom(json).accessToken) {
    res = await ipv4Request(`${API}/RenewToken`, { method: "POST", headers });
    ({ json, text } = await readJson(res));
  }
  const parsed = tokenFrom(json);
  if (!res.ok || !parsed.accessToken) {
    throwAuth(json, text, "Dhan could not renew this token. Generate a new one with PIN + TOTP, or paste a fresh token.");
  }
  const expiryTime = parsed.expiryTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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

export function persistPastedToken({ clientId, accessToken, expiryTime }) {
  const session = loadDhanSession();
  saveDhanSession({
    clientId: String(clientId || session.clientId || "").trim(),
    accessToken: String(accessToken || "").trim(),
    expiryTime: expiryTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    source: session.pin && session.totpSecret ? session.source || "totp" : "web",
    autoStart: true,
  });
}

export function markDhanAutoStart(enabled) {
  saveDhanSession({ autoStart: Boolean(enabled) });
}
