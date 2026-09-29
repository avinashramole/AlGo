import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { annotateMemberLiveAuthError, liveOrderSession } from "./brokerIsolation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = process.env.T2S_BROKER_SESSIONS_FILE || path.join(__dirname, "data", "broker-sessions.json");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const LIVE_BROKER_CATALOG = [
  {
    id: "dhan",
    name: "Dhan",
    vendor: "Dhan",
    color: "#0f9d58",
    auth: "access_token",
    segments: ["EQ", "FNO"],
    main: true,
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Dhan client ID" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "24-hour Access Token" },
    ],
    help: "Use Brokers → Dhan live feed. PIN + TOTP or paste the Access Token. Orders use DhanHQ POST /v2/orders.",
  },
  {
    id: "zerodha",
    name: "Zerodha Kite",
    vendor: "Zerodha",
    color: "#f6461a",
    auth: "api_key",
    segments: ["EQ", "FNO", "COM"],
    fields: [
      { id: "clientId", label: "User ID", placeholder: "Kite user id" },
      { id: "apiKey", label: "API key", placeholder: "Kite Connect API key" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "Daily Kite access token" },
    ],
    help: "Create an app on developers.kite.trade. Login once a day, then paste the access token. Orders use Kite POST /orders/regular.",
  },
  {
    id: "upstox",
    name: "Upstox",
    vendor: "Upstox",
    color: "#5b2d8e",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID / UCC", placeholder: "Upstox client id (393216)" },
      { id: "apiKey", label: "API key", secret: true, placeholder: "Developer app API key" },
      { id: "sessionToken", label: "API secret", secret: true, placeholder: "Developer app API secret" },
      { id: "accessToken", label: "Trading access token", secret: true, placeholder: "Filled after Get today's token" },
    ],
    help: "Upstox needs a daily trading access token, not the Analytics token. Save API key + API secret, then Get today's trading token and approve the Upstox app notification.",
  },
  {
    id: "fyers",
    name: "Fyers",
    vendor: "Fyers",
    color: "#111827",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Fyers client id" },
      { id: "apiKey", label: "App ID", placeholder: "FYERS app id" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "FYERS access token" },
    ],
    help: "Create an app on myapi.fyers.in. Authorization is appId:accessToken. Orders use POST /api/v3/orders/sync.",
  },
  {
    id: "kotak",
    name: "Kotak Neo",
    vendor: "Kotak",
    color: "#0033a0",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Kotak client id" },
      { id: "apiKey", label: "Consumer key", placeholder: "Neo consumer key" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "Neo access token" },
      { id: "sessionToken", label: "Sid / session", secret: true, placeholder: "Neo sid (if required)" },
    ],
    help: "Use Kotak Neo developer credentials. Connect checks the Neo profile API, then live orders go to Neo place-order.",
  },
  {
    id: "angelone",
    name: "Angel Broking",
    vendor: "Angel One",
    color: "#c2410c",
    auth: "api_key",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client code", placeholder: "Angel client code" },
      { id: "apiKey", label: "API key", placeholder: "Angel SmartAPI key" },
      { id: "accessToken", label: "JWT token", secret: true, placeholder: "jwtToken from SmartAPI login" },
    ],
    help: "Login with SmartAPI (client code + PIN + TOTP) to get a jwtToken, then paste it here. Orders use Angel placeOrder.",
  },
];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hintOf(value) {
  const raw = String(value || "");
  return raw.length >= 4 ? `••••${raw.slice(-4)}` : "";
}

function readSessions() {
  try {
    const row = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    return row && typeof row === "object" && !Array.isArray(row) ? row : {};
  } catch {
    return {};
  }
}

function writeSessions(store) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

let sessions = readSessions();

function persist() {
  writeSessions(sessions);
}

export function liveBrokerMeta(id) {
  return LIVE_BROKER_CATALOG.find((row) => row.id === String(id || "").trim()) || null;
}

export function isKnownLiveBroker(id) {
  const wanted = String(id || "").trim();
  return Boolean(wanted && wanted !== "paper" && liveBrokerMeta(wanted));
}

export function isLiveBrokerReady(id) {
  const wanted = String(id || "").trim();
  if (wanted === "dhan") return false;
  const row = sessions[wanted];
  return Boolean(row?.accessToken);
}

export function liveBrokerPublic(id) {
  const meta = liveBrokerMeta(id);
  const row = sessions[id];
  if (!meta) return null;
  return {
    id: meta.id,
    name: meta.name,
    live: Boolean(row?.accessToken),
    clientId: row?.clientId || "",
    keyHint: row?.keyHint || "",
    funds: Number(row?.funds) || 0,
    marginUsed: Number(row?.marginUsed) || 0,
    profileName: row?.profileName || "",
    fields: meta.fields,
    help: meta.help,
  };
}

export function listLiveBrokerPublic() {
  return LIVE_BROKER_CATALOG.filter((row) => row.id !== "dhan").map((row) => liveBrokerPublic(row.id));
}

export function nfoTradingSymbol(symbol, expiry) {
  const raw = String(symbol || "").toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const named = raw.match(/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX)\s+(\d{3,6})\s*(CE|PE)$/);
  if (!named) {
    const compact = raw.replace(/\s+/g, "");
    return compact || raw;
  }
  const root = named[1];
  const strike = named[2];
  const opt = named[3];
  const ymd = String(expiry || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ymd) return `${root}${strike}${opt}`;
  const yy = ymd[1].slice(-2);
  const mon = MONTHS[Number(ymd[2]) - 1] || "JAN";
  return `${root}${yy}${mon}${strike}${opt}`;
}

export function fyersSymbol(symbol, expiry) {
  const nfo = nfoTradingSymbol(symbol, expiry);
  if (nfo.includes(":")) return nfo;
  return `NSE:${nfo}`;
}

const UPSTOX_INDEX_KEYS = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  SENSEX: "BSE_INDEX|SENSEX",
};

export function isUpstoxInstrumentKey(value) {
  return /^(NSE|BSE|MCX)_[A-Z]+\|/.test(String(value || "").trim());
}

const UPSTOX_EXPIRY_WEEKDAY = {
  NIFTY: "Tue",
  BANKNIFTY: "Tue",
  FINNIFTY: "Tue",
  MIDCPNIFTY: "Tue",
  SENSEX: "Thu",
};

/** October 2026 NIFTY monthly is the last Tuesday, 2026-10-27. */
export function upstoxExpiryDate(expiry, root = "NIFTY") {
  const raw = String(expiry || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const month = raw.match(/^(\d{4})-(\d{2})$/);
  if (!month) return "";
  const year = Number(month[1]);
  const mon = Number(month[2]);
  const weekday = UPSTOX_EXPIRY_WEEKDAY[String(root || "NIFTY").toUpperCase()] || "Tue";
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day -= 1) {
    const ymd = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const probe = new Date(`${ymd}T12:00:00+05:30`);
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(probe);
    if (name === weekday) return ymd;
  }
  return "";
}

function parseSymbolExpiry(token) {
  const raw = String(token || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const hit = raw.match(/^(?:(\d{1,2}))?([A-Z]{3})(\d{2}|\d{4})$/);
  if (!hit) return "";
  const mon = MONTHS.indexOf(hit[2]);
  if (mon < 0) return "";
  const year = hit[3].length === 2 ? `20${hit[3]}` : hit[3];
  const month = String(mon + 1).padStart(2, "0");
  if (hit[1]) return `${year}-${month}-${String(Number(hit[1])).padStart(2, "0")}`;
  return `${year}-${month}`;
}

export function parseDeskOptionSymbol(symbol, extras = {}) {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = raw.replace(/\s+/g, "-");
  const dhan = compact.match(
    /^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|MIDCPNIFTY)-(?:(\d{1,2}[A-Z]{3}\d{2,4}|[A-Z]{3}\d{2,4})-)?(\d{3,6})-(CE|PE)$/,
  );
  if (dhan) {
    const expiry = parseSymbolExpiry(dhan[2]);
    return expiry
      ? { root: dhan[1], strike: Number(dhan[3]), option: dhan[4], expiry }
      : { root: dhan[1], strike: Number(dhan[3]), option: dhan[4] };
  }
  const named = raw.match(/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|MIDCPNIFTY)\s+(\d{3,6})\s*(CE|PE)$/);
  if (named) return { root: named[1], strike: Number(named[2]), option: named[3] };
  const spaced = raw.match(
    /^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|MIDCPNIFTY)\s+(\d{1,2})\s+([A-Z]{3})(?:\s+(\d{2,4}))?\s+(\d{3,6})\s*(CE|PE)$/,
  );
  if (spaced) {
    const expiry = parseSymbolExpiry(`${spaced[2]}${spaced[3]}${spaced[4] || ""}`);
    return expiry
      ? { root: spaced[1], strike: Number(spaced[5]), option: spaced[6], expiry }
      : { root: spaced[1], strike: Number(spaced[5]), option: spaced[6] };
  }
  const strike = Number(extras.strike || 0);
  const option = String(extras.option || "").toUpperCase();
  if (strike && (option === "CE" || option === "PE")) {
    const expiry = parseSymbolExpiry(extras.expiry) || String(extras.expiry || "").slice(0, 10);
    return expiry
      ? { root: String(extras.root || "NIFTY").toUpperCase(), strike, option, expiry }
      : { root: String(extras.root || "NIFTY").toUpperCase(), strike, option };
  }
  return null;
}

function upstoxRootMatches(root, under, name) {
  const u = String(under || "").toUpperCase().replace(/\s+50$/, "").replace(/50$/, "");
  const n = String(name || "").toUpperCase();
  if (root === "NIFTY") {
    if (u === "NIFTY" || u === "NIFTY50") return true;
    return /^NIFTY(\s|$)/.test(n) && !/BANKNIFTY|FINNIFTY|MIDCP/.test(n);
  }
  return u.includes(root) || n.includes(root);
}

export function pickUpstoxOptionHit(rows = [], { root, strike, option, expiry } = {}) {
  const wantStrike = Number(strike);
  const wantOpt = String(option || "").toUpperCase();
  const wantRoot = String(root || "").toUpperCase();
  const wantExpiry = String(expiry || "").trim();
  const wantDay = wantExpiry.length >= 10 ? wantExpiry.slice(0, 10) : "";
  const wantMonth = wantExpiry.length >= 7 ? wantExpiry.slice(0, 7) : "";
  const scored = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row.instrument_key || row.instrumentKey || row.instrument_token || "").trim();
    if (!isUpstoxInstrumentKey(key)) continue;
    const type = String(row.instrument_type || row.option_type || row.instrumentType || "").toUpperCase();
    const strikeN = Number(row.strike_price || row.strikePrice || row.strike || 0);
    const under = String(row.underlying_symbol || row.underlying || "").toUpperCase();
    const name = String(row.trading_symbol || row.tradingsymbol || row.name || "").toUpperCase();
    if (wantStrike && strikeN && strikeN !== wantStrike) continue;
    if (wantStrike && !strikeN && !name.includes(String(wantStrike))) continue;
    const isCe = type === "CE" || type === "CALL" || /\bCE\b/.test(name);
    const isPe = type === "PE" || type === "PUT" || /\bPE\b/.test(name);
    if (wantOpt === "CE" && !isCe) continue;
    if (wantOpt === "PE" && !isPe) continue;
    if (wantRoot && !upstoxRootMatches(wantRoot, under, name)) continue;
    const exp = String(row.expiry || row.expiry_date || row.expiryDate || "").slice(0, 10);
    scored.push({
      key,
      exp,
      exact: Boolean(wantDay && exp === wantDay),
      month: Boolean(wantMonth && exp.startsWith(wantMonth)),
    });
  }
  if (!scored.length) return "";
  if (wantDay) {
    const exact = scored.find((row) => row.exact);
    if (exact) return exact.key;
  }
  const monthHits = wantMonth ? scored.filter((row) => row.month) : [];
  const pool = monthHits.length ? monthHits : scored;
  pool.sort((a, b) => String(a.exp).localeCompare(String(b.exp)));
  const today = new Date().toISOString().slice(0, 10);
  return (pool.find((row) => !row.exp || row.exp >= today) || pool[0]).key;
}

export function upstoxInstrumentKeyFromPayload(payload = {}) {
  for (const value of [payload.instrumentKey, payload.instrument_key, payload.instrument_token]) {
    const raw = String(value || "").trim();
    if (isUpstoxInstrumentKey(raw)) return raw;
  }
  const sid = String(payload.securityId || "").trim();
  return isUpstoxInstrumentKey(sid) ? sid : "";
}

function isAuthError(error) {
  return Number(error?.status) === 401 || /unauthorized|\b401\b/i.test(String(error?.message || ""));
}

async function resolveUpstoxInstrumentKey({ symbol, expiry, strike, option, accessToken, fetchImpl }) {
  const parsed = parseDeskOptionSymbol(symbol, { strike, option, expiry });
  if (!parsed || !accessToken) return "";
  const wantedExpiry = String(expiry || parsed.expiry || "").trim();
  const day = upstoxExpiryDate(wantedExpiry, parsed.root);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const queries = [`${parsed.root} ${parsed.strike} ${parsed.option}`, `${parsed.root}${parsed.strike}${parsed.option}`];
  if (day) {
    const [year, month, date] = day.split("-");
    const mon = MONTHS[Number(month) - 1] || "";
    queries.push(`${parsed.root} ${date} ${mon} ${year.slice(-2)} ${parsed.strike} ${parsed.option}`);
  }
  if (wantedExpiry) queries.push(`${parsed.root} ${wantedExpiry} ${parsed.strike} ${parsed.option}`);
  const original = String(symbol || "").trim();
  if (original && !queries.includes(original)) queries.push(original);
  let authError = null;
  for (const query of queries) {
    try {
      const body = await httpJson(fetchImpl, `https://api.upstox.com/v2/search/instruments?query=${encodeURIComponent(query)}`, { headers });
      const key = pickUpstoxOptionHit(body.data || body, { ...parsed, expiry: day || wantedExpiry });
      if (key) return key;
    } catch (error) {
      if (isAuthError(error)) authError = error;
    }
  }
  if (authError) throw authError;
  const indexKey = UPSTOX_INDEX_KEYS[parsed.root];
  if (!indexKey || !day) return "";
  try {
    const body = await httpJson(
      fetchImpl,
      `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(indexKey)}&expiry_date=${encodeURIComponent(day)}`,
      { headers },
    );
    return pickUpstoxOptionHit(body.data || body, { ...parsed, expiry: day });
  } catch (error) {
    if (isAuthError(error)) throw error;
    return "";
  }
}

function jsonOf(res, text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: String(text || "").slice(0, 240) };
  }
}

export function upstoxErrorMessage(body = {}, res = {}) {
  const row = Array.isArray(body.errors) ? body.errors[0] : body.errors || body.data?.errors?.[0];
  const nested = row && typeof row === "object" ? row : {};
  const parts = [
    nested.errorCode || nested.error_code || nested.code,
    nested.message || nested.errorMessage || nested.error_message,
    body.message,
    typeof body.error === "string" ? body.error : body.error?.message,
    body.emsg,
    body.statusMessage,
    body.data?.message,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length) return unique.join(" · ");
  return `${res.status || 400} ${res.statusText || "broker error"}`;
}

function decorateUpstoxPlaceError(error) {
  const message = String(error?.message || error || "broker error");
  if (/OAuth access_token|Analytics\/extended/i.test(message)) {
    return error instanceof Error ? error : fail(message, error?.status || 401);
  }
  if (/UDAPI100067|extended_token|analytics token/i.test(message)) {
    const next = fail(
      `${message}. This is an Analytics/extended token. Paste today's Upstox OAuth access_token on My plan — analytics tokens can search but cannot place orders.`,
      401,
    );
    return next;
  }
  if (Number(error?.status) === 401 || /unauthorized|\b401\b|UDAPI100050|invalid token/i.test(message)) {
    return fail(
      `${message}. Search can accept a read-only token; order place needs today's Upstox OAuth access_token (not the 1-year Analytics token).`,
      401,
    );
  }
  return error instanceof Error ? error : fail(message, error?.status || 400);
}

async function httpJson(fetchImpl, url, options = {}) {
  const res = await fetchImpl(url, options);
  const text = await res.text();
  const body = jsonOf(res, text);
  if (!res.ok) {
    throw fail(upstoxErrorMessage(body, res), res.status === 401 ? 401 : 400);
  }
  return body;
}

function requiredToken(payload) {
  const accessToken = String(payload.accessToken || payload.apiKey || payload.jwtToken || "").trim();
  const apiKey = String(payload.apiKey || payload.appId || payload.consumerKey || "").trim();
  const clientId = String(payload.clientId || payload.userId || payload.clientCode || "").trim();
  const sessionToken = String(payload.sessionToken || payload.sid || "").trim();
  return { accessToken, apiKey, clientId, sessionToken };
}

async function probeZerodha(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Zerodha API key and daily access token.");
  }
  const body = await httpJson(fetchImpl, "https://api.kite.trade/user/profile", {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${creds.apiKey}:${creds.accessToken}`,
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.user_id || creds.clientId || ""),
    profileName: String(data.user_name || data.email || "Zerodha"),
    funds: 0,
  };
}

async function probeUpstox(fetchImpl, creds) {
  if (creds.accessToken.length < 8) throw fail("Enter the Upstox daily access token.");
  const body = await httpJson(fetchImpl, "https://api.upstox.com/v2/user/profile", {
    headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" },
  });
  const data = body.data || body;
  return {
    clientId: String(data.user_id || data.email || creds.clientId || ""),
    profileName: String(data.user_name || data.email || "Upstox"),
    funds: 0,
  };
}

async function probeFyers(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Fyers App ID and access token.");
  }
  const body = await httpJson(fetchImpl, "https://api-t1.fyers.in/api/v3/profile", {
    headers: { Authorization: `${creds.apiKey}:${creds.accessToken}` },
  });
  const data = body.data || body;
  return {
    clientId: String(data.fy_id || data.display_name || creds.clientId || ""),
    profileName: String(data.name || data.display_name || "Fyers"),
    funds: 0,
  };
}

async function probeKotak(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Kotak Neo consumer key and access token.");
  }
  const body = await httpJson(fetchImpl, "https://gw-napi.kotaksecurities.com/Orders/2.0/quick/user/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "neo-fin-key": creds.apiKey,
      sid: creds.sessionToken || "",
      Auth: creds.sessionToken || creds.accessToken,
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.clientId || data.client_id || creds.clientId || ""),
    profileName: String(data.name || data.clientName || "Kotak Neo"),
    funds: 0,
  };
}

async function probeAngel(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 8 || creds.clientId.length < 3) {
    throw fail("Enter Angel client code, API key, and jwtToken.");
  }
  const body = await httpJson(fetchImpl, "https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile", {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "X-PrivateKey": creds.apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
      "Content-Type": "application/json",
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.clientcode || creds.clientId),
    profileName: String(data.name || "Angel Broking"),
    funds: 0,
  };
}

const PROBES = {
  zerodha: probeZerodha,
  upstox: probeUpstox,
  fyers: probeFyers,
  kotak: probeKotak,
  angelone: probeAngel,
};

export async function connectLiveBroker(id, payload = {}, fetchImpl = fetch) {
  const meta = liveBrokerMeta(id);
  if (!meta || meta.id === "dhan") throw fail("Use the Dhan live-feed card for Dhan.");
  const creds = requiredToken(payload);
  const probe = PROBES[meta.id];
  if (!probe) throw fail("Unknown live broker.");
  const profile = await probe(fetchImpl, creds);
  sessions[meta.id] = {
    id: meta.id,
    clientId: profile.clientId || creds.clientId,
    apiKey: creds.apiKey,
    accessToken: creds.accessToken,
    sessionToken: creds.sessionToken,
    keyHint: hintOf(creds.accessToken || creds.apiKey),
    profileName: profile.profileName,
    funds: Number(profile.funds) || 0,
    marginUsed: 0,
    connectedAt: new Date().toISOString(),
  };
  persist();
  return liveBrokerPublic(meta.id);
}

export function disconnectLiveBroker(id) {
  const wanted = String(id || "").trim();
  if (!sessions[wanted]) return false;
  delete sessions[wanted];
  persist();
  return true;
}

export function liveBrokerSession(id) {
  return sessions[String(id || "").trim()] || null;
}

function orderQty(payload) {
  const qty = Math.abs(Number(payload.qty || payload.quantity || 0));
  if (!qty) throw fail("Order quantity is required.");
  return qty;
}

function orderSide(payload) {
  return String(payload.side || payload.transaction_type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
}

export async function placeLiveBrokerOrder(id, payload = {}, fetchImpl = fetch) {
  const brokerName = liveBrokerMeta(id)?.name || id;
  const { lane, session } = liveOrderSession(payload, liveBrokerSession(id), { brokerName });
  try {
    return await placeConnectedLiveBrokerOrder(id, payload, session, fetchImpl);
  } catch (error) {
    if (lane === "member") throw annotateMemberLiveAuthError(error, session, { brokerName });
    throw error;
  }
}

async function placeConnectedLiveBrokerOrder(id, payload, session, fetchImpl) {
  const qty = orderQty(payload);
  const side = orderSide(payload);
  const symbol = String(payload.symbol || "").trim();
  const expiry = payload.expiry || "";
  const nfo = nfoTradingSymbol(symbol, expiry);
  const product = String(payload.product || "MIS").toUpperCase();

  if (id === "zerodha") {
    const body = await httpJson(fetchImpl, "https://api.kite.trade/orders/regular", {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${session.apiKey}:${session.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        tradingsymbol: nfo,
        exchange: /SENSEX/.test(nfo) ? "BFO" : "NFO",
        transaction_type: side,
        order_type: "MARKET",
        quantity: String(qty),
        product: product === "NRML" ? "NRML" : "MIS",
        validity: "DAY",
      }).toString(),
    });
    const orderId = String(body.data?.order_id || body.order_id || "");
    return { orderId, status: "PENDING", brokerId: "zerodha", tradingsymbol: nfo };
  }

  if (id === "upstox") {
    let instrument = upstoxInstrumentKeyFromPayload(payload);
    if (!instrument) {
      instrument = await resolveUpstoxInstrumentKey({
        symbol,
        expiry,
        strike: payload.strike,
        option: payload.option,
        accessToken: session.accessToken,
        fetchImpl,
      });
    }
    if (!instrument) throw fail("Upstox live orders need an instrument key or security id.");
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const baseOrder = {
      quantity: qty,
      product: product === "NRML" ? "D" : "I",
      validity: "DAY",
      price: 0,
      instrument_token: instrument,
      order_type: "MARKET",
      transaction_type: side,
      disclosed_quantity: 0,
      trigger_price: 0,
      is_amo: false,
    };
    const attempts = [
      { url: "https://api-hft.upstox.com/v3/order/place", body: { ...baseOrder, slice: false, market_protection: -1 } },
      { url: "https://api-hft.upstox.com/v2/order/place", body: { ...baseOrder, market_protection: -1 } },
    ];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const body = await httpJson(fetchImpl, attempt.url, {
          method: "POST",
          headers,
          body: JSON.stringify(attempt.body),
        });
        return {
          orderId: String(body.data?.order_id || body.data?.order_ids?.[0] || body.order_id || ""),
          status: "PENDING",
          brokerId: "upstox",
        };
      } catch (error) {
        lastError = error;
        const message = String(error?.message || "");
        const retry =
          error.status === 401 ||
          error.status === 404 ||
          error.status === 410 ||
          /UDAPI10000|UDAPI100015|not supported|does not exist/i.test(message);
        if (!retry) throw decorateUpstoxPlaceError(error);
      }
    }
    throw decorateUpstoxPlaceError(lastError || fail("Upstox live order place failed."));
  }

  if (id === "fyers") {
    const body = await httpJson(fetchImpl, "https://api-t1.fyers.in/api/v3/orders/sync", {
      method: "POST",
      headers: {
        Authorization: `${session.apiKey}:${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: fyersSymbol(symbol, expiry),
        qty,
        type: 2,
        side: side === "SELL" ? -1 : 1,
        productType: product === "NRML" ? "MARGIN" : "INTRADAY",
        limitPrice: 0,
        stopPrice: 0,
        disclosedQty: 0,
        validity: "DAY",
        offlineOrder: false,
      }),
    });
    return { orderId: String(body.id || body.data?.id || ""), status: "PENDING", brokerId: "fyers" };
  }

  if (id === "kotak") {
    const body = await httpJson(fetchImpl, "https://gw-napi.kotaksecurities.com/Orders/2.0/quick/order/rule/ms/place", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "neo-fin-key": session.apiKey,
        sid: session.sessionToken || "",
        Auth: session.sessionToken || session.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amo: "NO",
        exchange_segment: /SENSEX/.test(nfo) ? "bse_fo" : "nse_fo",
        product: product === "NRML" ? "NRML" : "MIS",
        price: "0",
        order_type: "MKT",
        quantity: String(qty),
        disclosed_quantity: "0",
        validity: "DAY",
        trading_symbol: nfo,
        transaction_type: side,
      }),
    });
    return { orderId: String(body.nOrdNo || body.data?.nOrdNo || body.orderId || ""), status: "PENDING", brokerId: "kotak" };
  }

  if (id === "angelone") {
    const token = String(payload.securityId || payload.symboltoken || "").trim();
    if (!token) throw fail("Angel live option orders need a symbol token / security id.");
    const body = await httpJson(fetchImpl, "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-PrivateKey": session.apiKey,
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variety: "NORMAL",
        tradingsymbol: nfo,
        symboltoken: token,
        transactiontype: side,
        exchange: /SENSEX/.test(nfo) ? "BFO" : "NFO",
        ordertype: "MARKET",
        producttype: product === "NRML" ? "CARRYFORWARD" : "INTRADAY",
        duration: "DAY",
        quantity: String(qty),
      }),
    });
    return { orderId: String(body.data?.orderid || body.orderid || ""), status: "PENDING", brokerId: "angelone" };
  }

  throw fail("Unknown live broker.");
}
