import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicUser } from "./auth.js";
import { annotateMemberLiveAuthError, credentialHint, liveOrderSession } from "./brokerIsolation.js";
import { getUnderlying, isMcxSymbol, isWeeklyOptionExpiry, upcomingExpiries } from "./optionChain.js";
import { totpCodes } from "./totp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = process.env.T2S_BROKER_SESSIONS_FILE || path.join(__dirname, "data", "broker-sessions.json");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const NFO_WEEK_MONTH = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "O", "N", "D"];

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
      { id: "apiKey", label: "Consumer key", secret: true, placeholder: "Neo consumer key" },
      { id: "accessToken", label: "Neo access token", secret: true, placeholder: "Access token from the Neo app" },
      { id: "mobile", label: "Trade login mobile", secret: true, placeholder: "Mobile registered on this Kotak Neo" },
      { id: "mpin", label: "MPIN", secret: true, placeholder: "Kotak Neo MPIN" },
      { id: "totpSecret", label: "TOTP secret", secret: true, placeholder: "TOTP secret for this client ID" },
      { id: "sessionToken", label: "Neo sid", secret: true, placeholder: "Sid from today's trade login, if already copied" },
    ],
    help: "Quotes use the Neo consumer key. Admin orders call tradeApiLogin with the access token, mobile, client ID, and TOTP, then tradeApiValidate with the MPIN, then place on the host Kotak returns. The client ID is not the sid.",
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

function nfoDateToken(ymd, root) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const yy = ymd.slice(2, 4);
  const monthIndex = Number(ymd.slice(5, 7)) - 1;
  if (getUnderlying(root).weekly && isWeeklyOptionExpiry(ymd, root)) {
    const code = NFO_WEEK_MONTH[monthIndex];
    return code ? `${yy}${code}${ymd.slice(8, 10)}` : "";
  }
  return `${yy}${MONTHS[monthIndex] || "JAN"}`;
}

function resolveNfoExpiry(root, expiry, parsedExpiry) {
  const raw = String(expiry || parsedExpiry || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const month = raw.match(/^(\d{4})-(\d{2})/);
  if (month) return upstoxExpiryDate(`${month[1]}-${month[2]}`, root);
  return "";
}

export function nfoTradingSymbol(symbol, expiry) {
  const parsed = parseDeskOptionSymbol(symbol, { expiry });
  if (!parsed) {
    const compact = String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return compact || String(symbol || "").trim();
  }
  const ymd = resolveNfoExpiry(parsed.root, expiry, parsed.expiry);
  const token = nfoDateToken(ymd, parsed.root);
  if (!token) return `${parsed.root}${parsed.strike}${parsed.option}`;
  return `${parsed.root}${token}${parsed.strike}${parsed.option}`;
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

/** A month with no day uses the nearest weekly expiry, not the monthly last Tuesday. */
export function upstoxExpiryDate(expiry, root = "NIFTY") {
  const raw = String(expiry || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const month = raw.match(/^(\d{4})-(\d{2})$/);
  if (!month) return "";
  const und = getUnderlying(root);
  const prefix = `${month[1]}-${month[2]}`;
  if (und.weekly) {
    const inMonth = upcomingExpiries(root, 16).filter((date) => date.startsWith(prefix) && isWeeklyOptionExpiry(date, root));
    if (inMonth.length) return inMonth[0];
  }
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
  const hit = raw.match(/^(?:(\d{1,2}))?([A-Z]{3})(\d{2}|\d{4})?$/);
  if (!hit || !hit[2]) return "";
  const mon = MONTHS.indexOf(hit[2]);
  if (mon < 0) return "";
  const month = String(mon + 1).padStart(2, "0");
  if (!hit[1] && hit[3]) {
    const year = hit[3].length === 2 ? `20${hit[3]}` : hit[3];
    return `${year}-${month}`;
  }
  if (!hit[1]) return "";
  const day = String(Number(hit[1])).padStart(2, "0");
  const year = hit[3]
    ? hit[3].length === 2
      ? `20${hit[3]}`
      : hit[3]
    : String(inferExpiryYear(mon, Number(hit[1])));
  return `${year}-${month}-${day}`;
}

function inferExpiryYear(monthIndex, day) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let year = Number(today.slice(0, 4));
  const ymd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (ymd < today) year += 1;
  return year;
}

const DESK_OPTION_ROOTS = "CRUDEOIL|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|NIFTY";
const DESK_OPTION_SIDES = "CE|PE|CALL|PUT";

function optionSide(token) {
  const raw = String(token || "").toUpperCase();
  if (raw === "CE" || raw === "CALL") return "CE";
  if (raw === "PE" || raw === "PUT") return "PE";
  return "";
}

function rootFromDeskSymbol(symbol) {
  const compact = String(symbol || "").toUpperCase().replace(/[^A-Z]/g, "");
  const known = ["CRUDEOILM", "CRUDEOIL", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "NIFTY"];
  return known.find((root) => compact.startsWith(root)) || "";
}

function deskOption(root, strike, option, expiry = "") {
  const side = optionSide(option);
  if (!root || !side || !strike) return null;
  return expiry ? { root, strike: Number(strike), option: side, expiry } : { root, strike: Number(strike), option: side };
}

export function parseDeskOptionSymbol(symbol, extras = {}) {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = raw.replace(/\s+/g, "-");
  const dhan = compact.match(
    new RegExp(`^(${DESK_OPTION_ROOTS})-(?:(\\d{1,2}[A-Z]{3}\\d{2,4}|[A-Z]{3}\\d{2,4})-)?(\\d{3,6})-(${DESK_OPTION_SIDES})$`),
  );
  if (dhan) {
    const expiry = parseSymbolExpiry(dhan[2]);
    return deskOption(dhan[1], dhan[3], dhan[4], expiry);
  }
  const named = raw.match(new RegExp(`^(${DESK_OPTION_ROOTS})\\s+(\\d{3,6})\\s*(${DESK_OPTION_SIDES})$`));
  if (named) return deskOption(named[1], named[2], named[3]);
  const spaced = raw.match(
    new RegExp(`^(${DESK_OPTION_ROOTS})\\s+(\\d{1,2})\\s+([A-Z]{3})(?:\\s+(\\d{2,4}))?\\s+(\\d{3,6})\\s*(${DESK_OPTION_SIDES})$`),
  );
  if (spaced) {
    const expiry = parseSymbolExpiry(`${spaced[2]}${spaced[3]}${spaced[4] || ""}`);
    return deskOption(spaced[1], spaced[5], spaced[6], expiry);
  }
  const strike = Number(extras.strike || 0);
  const option = optionSide(extras.option);
  if (strike && option) {
    const expiry = parseSymbolExpiry(extras.expiry) || String(extras.expiry || "").slice(0, 10);
    const root = String(extras.root || "").trim().toUpperCase() || rootFromDeskSymbol(raw) || "NIFTY";
    return deskOption(root, strike, option, expiry);
  }
  return null;
}

export function parseDeskFutureSymbol(symbol, extras = {}) {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = raw.replace(/\s+/g, "-");
  const dhan = compact.match(new RegExp(`^(${DESK_OPTION_ROOTS})-(?:(\\d{1,2}[A-Z]{3}\\d{2,4}|[A-Z]{3}\\d{2,4})-)?FUT$`));
  if (dhan) {
    const expiry = parseSymbolExpiry(dhan[2]);
    return expiry ? { root: dhan[1], expiry, future: true } : { root: dhan[1], future: true };
  }
  const named = raw.match(new RegExp(`^(${DESK_OPTION_ROOTS})\\s+FUT$`));
  if (named) return { root: named[1], future: true };
  return null;
}

function parseDeskContract(symbol, extras = {}) {
  const option = parseDeskOptionSymbol(symbol, extras);
  if (option) return option;
  const future = parseDeskFutureSymbol(symbol, extras);
  if (!future) return null;
  return { ...future, option: "FUT", strike: 0 };
}

export function upstoxExpiryDay(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (typeof value === "number" || /^\d{11,}$/.test(raw)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "";
    const ms = n < 1e11 ? n * 1000 : n;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
  }
  return "";
}

function upstoxRootMatches(root, under, name) {
  const u = String(under || "").toUpperCase().replace(/\s+50$/, "").replace(/50$/, "");
  const n = String(name || "").toUpperCase();
  if (root === "NIFTY") {
    if (u === "NIFTY" || u === "NIFTY50") return true;
    return /^NIFTY(\s|$)/.test(n) && !/BANKNIFTY|FINNIFTY|MIDCP/.test(n);
  }
  if (root === "CRUDEOIL") {
    const compactU = u.replace(/\s+/g, "");
    const compactN = n.replace(/\s+/g, "");
    if (compactU.includes("CRUDEOILM") || compactN.includes("CRUDEOILM")) return false;
    return compactU === "CRUDEOIL" || compactN.includes("CRUDEOIL");
  }
  return u.includes(root) || n.includes(root);
}

function selectUpstoxInstrumentRow(rows = [], { root, strike, option, expiry, segment } = {}) {
  const wantStrike = Number(strike);
  const wantOpt = String(option || "").toUpperCase();
  const wantRoot = String(root || "").toUpperCase();
  const wantExpiry = String(expiry || "").trim();
  const wantDay = /^\d{4}-\d{2}-\d{2}/.test(wantExpiry) ? wantExpiry.slice(0, 10) : "";
  const wantMonth = wantExpiry.length >= 7 ? wantExpiry.slice(0, 7) : "";
  const wantFut = wantOpt === "FUT" || wantOpt === "FUTURE";
  const scored = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row.instrument_key || row.instrumentKey || row.instrument_token || "").trim();
    if (!isUpstoxInstrumentKey(key)) continue;
    if (wantRoot === "CRUDEOIL") {
      const nseCommodity = String(segment || "").toUpperCase() === "NSE";
      if (nseCommodity ? !key.startsWith("NSE_") : !key.startsWith("MCX_")) continue;
    }
    const type = String(row.instrument_type || row.option_type || row.instrumentType || "").toUpperCase();
    const strikeN = Number(row.strike_price || row.strikePrice || row.strike || 0);
    const under = String(row.underlying_symbol || row.underlying || "").toUpperCase();
    const name = String(row.trading_symbol || row.tradingsymbol || row.name || "").toUpperCase();
    if (wantFut) {
      const isFut = type === "FUT" || type === "FUTIDX" || type === "FUTCOM" || /\bFUT\b/.test(name);
      if (!isFut) continue;
    } else {
      if (wantStrike && strikeN && strikeN !== wantStrike) continue;
      if (wantStrike && !strikeN && !name.includes(String(wantStrike))) continue;
      const isCe = type === "CE" || type === "CALL" || /\bCE\b/.test(name) || /\bCALL\b/.test(name);
      const isPe = type === "PE" || type === "PUT" || /\bPE\b/.test(name) || /\bPUT\b/.test(name);
      if (wantOpt === "CE" && !isCe) continue;
      if (wantOpt === "PE" && !isPe) continue;
    }
    if (wantRoot && !upstoxRootMatches(wantRoot, under, name)) continue;
    const exp = upstoxExpiryDay(row.expiry || row.expiry_date || row.expiryDate);
    scored.push({
      row,
      key,
      exp,
      exact: Boolean(wantDay && exp === wantDay),
      month: Boolean(wantMonth && exp.startsWith(wantMonth)),
    });
  }
  if (!scored.length) return null;
  if (wantDay) {
    const exact = scored.find((row) => row.exact);
    if (exact) return exact.row;
    if (getUnderlying(wantRoot).weekly) return null;
  }
  const monthHits = wantMonth ? scored.filter((row) => row.month) : [];
  const pool = monthHits.length ? monthHits : scored;
  pool.sort((a, b) => String(a.exp).localeCompare(String(b.exp)));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (pool.find((row) => !row.exp || row.exp >= today) || pool[0]).row;
}

export function pickUpstoxOptionHit(rows = [], query = {}) {
  const row = selectUpstoxInstrumentRow(rows, query);
  return String(row?.instrument_key || row?.instrumentKey || row?.instrument_token || "").trim();
}

function upstoxHitMeta(row) {
  if (!row) return null;
  const key = String(row.instrument_key || row.instrumentKey || row.instrument_token || "").trim();
  if (!isUpstoxInstrumentKey(key)) return null;
  const tickRaw = Number(row.tick_size || row.tickSize || 0);
  const tick = tickRaw >= 1 ? tickRaw / 100 : tickRaw > 0 ? tickRaw : 0;
  const lotSize = Number(row.lot_size || row.lotSize || 0);
  const qtyMultiplier = Number(row.qty_multiplier || row.qtyMultiplier || 0);
  const tradingSymbol = String(row.trading_symbol || row.tradingsymbol || row.name || "").trim();
  return {
    key,
    lotSize: lotSize > 0 ? lotSize : 0,
    tick,
    qtyMultiplier: qtyMultiplier > 0 ? qtyMultiplier : 0,
    tradingSymbol,
  };
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

function contractExpiryWanted(parsed, expiry) {
  const raw = String(expiry || parsed.expiry || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (parsed.root === "CRUDEOIL") return raw.slice(0, 7);
  return upstoxExpiryDate(raw, parsed.root) || raw.slice(0, 10);
}

const UPSTOX_MASTER_FILES = [
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
  "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz",
];
let upstoxMasterCache = { at: 0, rows: [] };
const UPSTOX_MASTER_TTL_MS = 6 * 60 * 60 * 1000;

export function resetUpstoxMasterCache() {
  upstoxMasterCache = { at: 0, rows: [] };
}

let upstoxMcxApiDisabledUntil = 0;
const UPSTOX_MCX_DISABLE_MS = 6 * 60 * 60 * 1000;

export function resetUpstoxMcxApiDisable() {
  upstoxMcxApiDisabledUntil = 0;
}

function upstoxMcxApiDisabledNow() {
  return Date.now() < upstoxMcxApiDisabledUntil;
}

function noteUpstoxMcxApiDisabled() {
  upstoxMcxApiDisabledUntil = Date.now() + UPSTOX_MCX_DISABLE_MS;
}

function upstoxMcxApiDisabledError(error) {
  return /UDAPI1161|MCX API orders are temporarily disabled|NSCOM/i.test(String(error?.message || ""));
}

function upstoxIntradayBlocked(error) {
  return /UDAPI100500|Intraday \(I\) orders are not allowed/i.test(String(error?.message || ""));
}

async function responseText(res) {
  if (typeof res?.arrayBuffer === "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    const asText = buf.toString("utf8");
    if (asText.trim().startsWith("[") || asText.trim().startsWith("{")) return asText;
    try {
      const { gunzipSync } = await import("node:zlib");
      return gunzipSync(buf).toString("utf8");
    } catch {
      return asText;
    }
  }
  if (typeof res?.text === "function") return res.text();
  return "";
}

function rowsFromMasterText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  try {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.data)) return json.data;
  } catch {
    return [];
  }
  return [];
}

async function loadUpstoxMasterRows(fetchImpl) {
  if (upstoxMasterCache.rows.length && Date.now() - upstoxMasterCache.at < UPSTOX_MASTER_TTL_MS) return upstoxMasterCache.rows;
  const rows = [];
  for (const url of UPSTOX_MASTER_FILES) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json, application/gzip, */*" } });
      if (!res?.ok) continue;
      rows.push(...rowsFromMasterText(await responseText(res)));
    } catch {
      /* next file */
    }
  }
  if (rows.length) upstoxMasterCache = { at: Date.now(), rows };
  return rows;
}

async function resolveUpstoxInstrumentKey({ symbol, expiry, strike, option, accessToken, fetchImpl, segment }) {
  const parsed = parseDeskContract(symbol, { strike, option, expiry, root: rootFromDeskSymbol(symbol) });
  if (!parsed) return null;
  const wanted = contractExpiryWanted(parsed, expiry);
  const pickFrom = (rows, expiryValue) => upstoxHitMeta(selectUpstoxInstrumentRow(rows, { ...parsed, expiry: expiryValue, segment }));
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } : null;
  const queries = [];
  if (parsed.option === "FUT") {
    queries.push(`${parsed.root} FUT`);
    if (wanted.length >= 10) {
      const [year, month, date] = wanted.split("-");
      const mon = MONTHS[Number(month) - 1] || "";
      queries.push(`${parsed.root} FUT ${date} ${mon} ${year.slice(-2)}`);
    }
  } else {
    queries.push(`${parsed.root} ${parsed.strike} ${parsed.option}`, `${parsed.root}${parsed.strike}${parsed.option}`);
    if (wanted.length >= 10) {
      const [year, month, date] = wanted.split("-");
      const mon = MONTHS[Number(month) - 1] || "";
      queries.push(`${parsed.root} ${date} ${mon} ${year.slice(-2)} ${parsed.strike} ${parsed.option}`);
    }
    if (wanted) queries.push(`${parsed.root} ${wanted} ${parsed.strike} ${parsed.option}`);
  }
  const original = String(symbol || "").trim();
  if (original && !queries.includes(original)) queries.push(original);
  let authError = null;
  if (headers) {
    for (const query of queries) {
      try {
        const body = await httpJson(fetchImpl, `https://api.upstox.com/v2/search/instruments?query=${encodeURIComponent(query)}`, { headers });
        const hit = pickFrom(body.data || body, wanted);
        if (hit) return hit;
      } catch (error) {
        if (isAuthError(error)) authError = error;
      }
    }
  }
  try {
    const hit = pickFrom(await loadUpstoxMasterRows(fetchImpl), wanted);
    if (hit) return hit;
  } catch {
    /* contract API is the last index-option path */
  }
  if (authError) throw authError;
  const indexKey = UPSTOX_INDEX_KEYS[parsed.root];
  const day = wanted.length >= 10 ? wanted : "";
  if (!headers || !indexKey || !day || parsed.option === "FUT") return null;
  try {
    const body = await httpJson(
      fetchImpl,
      `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(indexKey)}&expiry_date=${encodeURIComponent(day)}`,
      { headers },
    );
    return pickFrom(body.data || body, day);
  } catch (error) {
    if (isAuthError(error)) throw error;
    return null;
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

function networkFail(error, url) {
  const cause = error?.cause;
  const code = String(cause?.code || cause?.errno || "").trim();
  const causeText = String(cause?.message || "").trim();
  let host = "";
  try {
    host = new URL(String(url)).host;
  } catch {
    host = "";
  }
  const detail = [code, causeText && causeText !== code ? causeText : ""].filter(Boolean).join(" ");
  const lead = String(error?.message || "request failed");
  const where = host ? ` ${host}` : "";
  const message = detail ? `${lead} (${detail}${where})` : host ? `${lead} (${host})` : lead;
  return fail(message, 0);
}

async function httpJson(fetchImpl, url, options = {}) {
  let res;
  try {
    res = await fetchImpl(url, options);
  } catch (error) {
    throw networkFail(error, url);
  }
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
  const mobile = String(payload.mobile || "").trim();
  const mpin = String(payload.mpin || "").trim();
  const totpSecret = String(payload.totpSecret || payload.totp || "").trim();
  return { accessToken, apiKey, clientId, sessionToken, mobile, mpin, totpSecret };
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
  const token = String(creds.apiKey || creds.accessToken || "").trim();
  if (token.length < 4) throw fail("Enter Kotak Neo consumer key and access token.");
  await httpJson(fetchImpl, "https://mis.kotaksecurities.com/script-details/1.0/quotes/neosymbol/nse_cm%7CNifty%2050/all", {
    headers: { Authorization: token, Accept: "application/json" },
  });
  return {
    clientId: creds.clientId,
    profileName: "Kotak Neo",
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
  const previous = meta.id === "kotak" ? sessions[meta.id] || {} : {};
  sessions[meta.id] = {
    id: meta.id,
    clientId: profile.clientId || creds.clientId,
    apiKey: creds.apiKey,
    accessToken: creds.accessToken,
    sessionToken: meta.id === "kotak" ? creds.sessionToken || previous.sessionToken || "" : creds.sessionToken,
    mobile: meta.id === "kotak" ? creds.mobile || previous.mobile || "" : "",
    mpin: meta.id === "kotak" ? creds.mpin || previous.mpin || "" : "",
    totpSecret: meta.id === "kotak" ? creds.totpSecret || previous.totpSecret || "" : "",
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

function upstoxPlaceQuantity(payload, rawQty, instrument = {}) {
  const meta = typeof instrument === "number" ? { lotSize: instrument } : instrument || {};
  const lotSize = Number(meta.lotSize || 0);
  const qtyMultiplier = Number(meta.qtyMultiplier || 0);
  const segment = String(payload.exchangeSegment || "").toUpperCase();
  const commodity = segment === "MCX_COMM" || isMcxSymbol(payload.symbol);
  if (!commodity) return rawQty;
  const strategyLot = Math.max(1, Math.round(Number(payload.lotSize) || 100));
  const lots =
    Math.max(0, Math.round(Number(payload.lots) || 0)) ||
    (rawQty >= strategyLot ? Math.max(1, Math.round(rawQty / strategyLot)) : Math.max(1, rawQty));
  const nseCommodity = String(meta.key || "").startsWith("NSE_") && lotSize <= 1;
  if (nseCommodity || (lotSize <= 1 && qtyMultiplier >= 100)) return Math.max(1, lots);
  const lot = Math.max(1, Math.round(lotSize || strategyLot));
  if (rawQty >= lot) return Math.round(rawQty / lot) * lot;
  if (lots > 0) return lots * lot;
  if (!rawQty) throw fail("Order quantity is required.");
  return rawQty;
}

function upstoxLimit(payload, tick = 0) {
  const type = String(payload.type || payload.order_type || payload.orderType || "").toUpperCase();
  const price = Number(payload.price);
  if (!(type === "LIMIT" && price > 0)) return { orderType: "MARKET", price: 0 };
  const mcx = String(payload.exchangeSegment || "").toUpperCase() === "MCX_COMM" || isMcxSymbol(payload.symbol);
  const step = tick > 0 ? tick : mcx ? 0.1 : 0.05;
  const factor = Math.round(1 / step);
  return { orderType: "LIMIT", price: Math.round(price * factor) / factor };
}

function orderSide(payload) {
  return String(payload.side || payload.transaction_type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
}

const KOTAK_ORDER_HOSTS = [
  "https://mis.kotaksecurities.com",
  "https://e21.kotaksecurities.com",
  "https://e22.kotaksecurities.com",
  "https://e41.kotaksecurities.com",
  "https://e43.kotaksecurities.com",
];

const kotakTradeCache = new Map();

export function clearKotakTradeCache() {
  kotakTradeCache.clear();
}

export function kotakTotpCandidates(value, at = Date.now()) {
  const raw = String(value || "").trim();
  if (/^\d{6}$/.test(raw)) return [raw];
  try {
    return totpCodes(raw, at);
  } catch {
    throw fail(
      "Kotak TOTP secret is not valid. Paste the Setup TOTP secret from Kotak Neo, or the current 6-digit code.",
      400,
    );
  }
}

function kotakEnv(name) {
  return String(process.env[name] || "").trim();
}

export function indianMobileDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : "";
}

export function kotakMobileNumber(value) {
  const digits = indianMobileDigits(value);
  if (digits) return `+91${digits}`;
  return String(value || "").trim().replace(/[\s-]/g, "");
}

export function kotakMobileNumberCandidates(...values) {
  const digitsList = [];
  for (const value of values) {
    const digits = indianMobileDigits(value);
    if (digits && !digitsList.includes(digits)) digitsList.push(digits);
  }
  const out = [];
  for (const digits of digitsList) {
    for (const form of [`+91${digits}`, digits, `+91-${digits}`, `91${digits}`]) {
      if (!out.includes(form)) out.push(form);
    }
  }
  if (out.length) return out;
  for (const value of values) {
    const formatted = kotakMobileNumber(value);
    if (formatted && !out.includes(formatted)) out.push(formatted);
  }
  return out;
}

export function firstKotakMobile(...values) {
  for (const value of values) {
    if (indianMobileDigits(value)) return String(value || "").trim();
  }
  return String(values.find((value) => String(value || "").trim()) || "").trim();
}

function isKotakMobileFieldError(error) {
  const text = [error?.message, error?.body && JSON.stringify(error.body)].filter(Boolean).join(" ");
  return /invalid field ['"]?mobile\s*number['"]?|must be a valid mobile number/i.test(text);
}

function kotakMobileHint(...values) {
  for (const value of values) {
    const digits = indianMobileDigits(value);
    if (digits) return `${digits.slice(0, 2)}••••${digits.slice(-4)}`;
  }
  return "";
}

function istClock(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    weekend: value("weekday") === "Sat" || value("weekday") === "Sun",
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export function kotakOrderAmo(payload = {}, date = new Date()) {
  if (payload.afterMarketOrder === true || payload.amo === true || String(payload.amo).toUpperCase() === "YES") return "YES";
  const clock = payload.orderAt ? new Date(payload.orderAt) : date;
  const when = Number.isNaN(clock.getTime()) ? new Date() : clock;
  const { weekend, minutes } = istClock(when);
  if (weekend) return "YES";
  const crude = isMcxSymbol(payload.symbol) || String(payload.exchangeSegment || "") === "MCX_COMM";
  const open = crude ? minutes >= 9 * 60 && minutes < 23 * 60 + 30 : minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
  return open ? "NO" : "YES";
}

function kotakOrderBody({ payload, nfo, qty, side, product }) {
  const limit = String(payload.type || "").toUpperCase() === "LIMIT" && Number(payload.price) > 0;
  const segment = /SENSEX/i.test(`${nfo} ${payload.symbol || ""}`)
    ? "bse_fo"
    : isMcxSymbol(payload.symbol)
      ? "mcx_fo"
      : "nse_fo";
  return {
    am: kotakOrderAmo(payload),
    dq: "0",
    es: segment,
    mp: "0",
    pc: product === "NRML" ? "NRML" : "MIS",
    pf: "N",
    pr: limit ? String(payload.price) : "0",
    pt: limit ? "L" : "MKT",
    qt: String(qty),
    rt: "DAY",
    tp: "0",
    ts: nfo,
    tt: side === "SELL" ? "S" : "B",
    os: "NEOTRADEAPI",
  };
}

function kotakUsersMobile(session = {}) {
  return (
    String(session.profileMobile || "").trim() ||
    (session.copyUserId ? String(getPublicUser(session.copyUserId)?.mobile || "").trim() : "") ||
    String(session.mobile || "").trim()
  );
}

function kotakDeskCreds(session = {}, lane = "admin") {
  const own = {
    clientId: String(session.clientId || "").trim(),
    apiKey: String(session.apiKey || "").trim(),
    accessToken: String(session.accessToken || "").trim(),
    sessionToken: String(session.sessionToken || "").trim(),
    mobile: String(session.mobile || kotakUsersMobile(session) || "").trim(),
    profileMobile: String(session.profileMobile || kotakUsersMobile(session) || "").trim(),
    copyUserId: String(session.copyUserId || "").trim(),
    mpin: String(session.mpin || "").trim(),
    totpSecret: String(session.totpSecret || "").trim(),
    baseUrl: String(session.baseUrl || "").replace(/\/$/, ""),
    serverId: String(session.serverId || "").trim(),
    tradeToken: String(session.tradeToken || "").trim(),
    tradeSid: String(session.tradeSid || "").trim(),
  };
  if (lane === "member") return own;
  return {
    ...own,
    clientId: own.clientId || kotakEnv("T2S_KOTAK_CLIENT_ID"),
    apiKey: own.apiKey || kotakEnv("T2S_KOTAK_CONSUMER_KEY"),
    accessToken: own.accessToken || kotakEnv("T2S_KOTAK_ACCESS_TOKEN") || kotakEnv("T2S_KOTAK_CONSUMER_KEY"),
    mobile: own.mobile || kotakEnv("T2S_KOTAK_MOBILE"),
    mpin: own.mpin || kotakEnv("T2S_KOTAK_MPIN"),
    totpSecret: own.totpSecret || kotakEnv("T2S_KOTAK_TOTP_SECRET"),
    baseUrl: own.baseUrl || kotakEnv("T2S_KOTAK_BASE_URL").replace(/\/$/, ""),
    serverId: own.serverId || kotakEnv("T2S_KOTAK_SERVER_ID"),
  };
}

function kotakBrokerMessage(body = {}, res = {}) {
  const row = Array.isArray(body.error) ? body.error[0] : body.error;
  const nested = row && typeof row === "object" ? row : {};
  const asString = typeof row === "string" ? row.trim() : "";
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
  const field = nested.field || nested.Field;
  const fieldText = field ? `Invalid field '${field}'; ${nested.message || nested.msg || "must be a valid mobile number"}` : "";
  const text = [
    nested.message,
    nested.msg,
    asString,
    fieldText,
    nested.MobileNumber,
    nested.mobileNumber,
    body.errMsg,
    body.emsg,
    data.errMsg,
    data.message,
    body.message,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)[0];
  return text || upstoxErrorMessage(body, res);
}

function kotakRejected(body) {
  if (!body || typeof body !== "object") return false;
  if (body.nOrdNo || body.orderId || body.data?.nOrdNo) return false;
  const stat = String(body.stat || "").toLowerCase();
  if (stat === "not_ok" || stat === "not ok" || stat === "error") return true;
  if (Array.isArray(body.error) && body.error.length) return true;
  return Boolean(body.errMsg || body.emsg);
}

async function kotakRequest(fetchImpl, url, options) {
  let res;
  try {
    res = await fetchImpl(url, options);
  } catch (error) {
    throw networkFail(error, url);
  }
  const text = await res.text();
  const body = jsonOf(res, text);
  if (!res.ok || kotakRejected(body)) {
    const error = fail(kotakBrokerMessage(body, res), res.ok ? 400 : res.status || 400);
    error.body = body;
    throw error;
  }
  return body;
}

function kotakHostMiss(error) {
  const status = Number(error?.status || 0);
  return status === 0 || status === 404 || status === 401 || status === 403;
}

function stampKotakPlaceError(error) {
  if (!error || typeof error !== "object") return;
  let reason = String(error.message || "Kotak Neo did not accept this order.");
  if (isKotakMobileFieldError({ message: reason, body: error.body })) {
    reason =
      String(error.message || "").includes("Users mobile")
        ? reason
        : "Kotak Neo rejected the Users-list mobile. Paste the 10-digit number shown on Users — the mobile registered on this Kotak Neo TOTP.";
    error.message = reason;
  }
  error.live = { ...(error.live || {}), status: "REJECTED", reason, brokerId: "kotak" };
}

export function kotakLoginAuthorization(creds = {}) {
  const token = String(creds.accessToken || "").trim();
  const key = String(creds.apiKey || "").trim();
  if (token && token !== key) return token;
  return key || token;
}

export function canKotakTradeLogin(creds = {}) {
  return Boolean(
    String(creds.mobile || creds.profileMobile || "").trim() &&
      String(creds.mpin || "").trim() &&
      String(creds.totpSecret || "").trim() &&
      String(creds.clientId || "").trim() &&
      kotakLoginAuthorization(creds),
  );
}

export async function openKotakTradeSession(creds, fetchImpl = fetch, lane = "admin") {
  const authHeader = kotakLoginAuthorization(creds);
  const key = `${creds.clientId}|${authHeader}`;
  const cached = kotakTradeCache.get(key);
  if (cached && cached.expires > Date.now() && cached.baseUrl && cached.tradeToken) return cached;
  const codes = kotakTotpCandidates(creds.totpSecret);
  const profileMobile = creds.profileMobile || kotakUsersMobile(creds);
  const mobiles = kotakMobileNumberCandidates(profileMobile, creds.mobile);
  if (!mobiles.length) {
    throw fail("Kotak trade-login mobile must be a valid 10-digit Indian mobile number. Use the number shown on Users.");
  }
  const auths = [authHeader];
  const consumerKey = String(creds.apiKey || "").trim();
  if (consumerKey && consumerKey !== authHeader) auths.push(consumerKey);
  const classicLogin = "https://mis.kotaksecurities.com/login/1.0/tradeApiLogin";
  const v6Login = "https://mis.kotaksecurities.com/login/1.0/login/v6/totp/login";
  const loginUrls = lane === "member" ? [v6Login, classicLogin] : [classicLogin, v6Login];
  let login = null;
  let loginAuth = authHeader;
  let loginUrl = loginUrls[0];
  let lastLoginError = null;
  totpLoop: for (const totp of codes) {
    for (const url of loginUrls) {
      for (const mobileNumber of mobiles) {
        for (const authorization of auths) {
          for (const body of [{ mobileNumber, ucc: creds.clientId, totp }, { MobileNumber: mobileNumber, ucc: creds.clientId, totp }]) {
            try {
              login = await kotakRequest(fetchImpl, url, {
                method: "POST",
                headers: {
                  Authorization: authorization,
                  "neo-fin-key": "neotradeapi",
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify(body),
              });
              loginAuth = authorization;
              loginUrl = url;
              break totpLoop;
            } catch (error) {
              lastLoginError = error;
              if (isKotakMobileFieldError(error)) continue;
              if (!/invalid totp/i.test(String(error?.message || "")) || totp === codes[codes.length - 1]) throw error;
              continue totpLoop;
            }
          }
        }
      }
    }
  }
  if (!login) {
    const hint = kotakMobileHint(creds.mobile, profileMobile);
    const rejected = lastLoginError && isKotakMobileFieldError(lastLoginError);
    throw rejected
      ? fail(
          `Kotak Neo rejected Users mobile${hint ? ` ${hint}` : ""}. Paste the 10-digit number shown on Users — the mobile registered on this Kotak Neo TOTP.`,
        )
      : lastLoginError || fail("Kotak TOTP login did not return a trading session.");
  }
  const view = login.data || login;
  const viewToken = String(view.token || "").trim();
  const viewSid = String(view.sid || "").trim();
  if (!viewToken || !viewSid) throw fail("Kotak TOTP login did not return a trading session.");
  const validateUrls = String(loginUrl).includes("/v6/totp/")
    ? [
        "https://mis.kotaksecurities.com/login/1.0/login/v6/totp/validate",
        "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate",
      ]
    : [
        "https://mis.kotaksecurities.com/login/1.0/tradeApiValidate",
        "https://mis.kotaksecurities.com/login/1.0/login/v6/totp/validate",
      ];
  let validated = null;
  let lastValidateError = null;
  for (const url of validateUrls) {
    try {
      validated = await kotakRequest(fetchImpl, url, {
        method: "POST",
        headers: {
          Authorization: loginAuth || authHeader,
          "neo-fin-key": "neotradeapi",
          sid: viewSid,
          Auth: viewToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ mpin: creds.mpin }),
      });
      break;
    } catch (error) {
      lastValidateError = error;
      if (url === validateUrls[validateUrls.length - 1]) throw error;
    }
  }
  if (!validated) throw lastValidateError || fail("Kotak MPIN login did not return a trading host.");
  const data = validated.data || validated;
  const trade = {
    tradeToken: String(data.token || "").trim(),
    tradeSid: String(data.sid || "").trim(),
    baseUrl: String(data.baseUrl || "").replace(/\/$/, ""),
    serverId: String(data.hsServerId || data.serverId || "").trim(),
    expires: Date.now() + 6 * 60 * 60 * 1000,
  };
  if (!trade.tradeToken || !trade.baseUrl) throw fail("Kotak MPIN login did not return a trading host.");
  kotakTradeCache.set(key, trade);
  return trade;
}

function kotakMemberTradePair(creds = {}) {
  const sid = String(creds.sessionToken || "").trim();
  const auth = String(creds.accessToken || "").trim();
  const key = String(creds.apiKey || "").trim();
  const clientId = String(creds.clientId || "").trim();
  return {
    sid: sid && sid !== clientId && sid !== key && sid !== auth ? sid : "",
    auth: auth && auth !== key ? auth : "",
  };
}

function kotakPlaceUrls(trade) {
  const hosts = trade?.baseUrl ? [trade.baseUrl] : KOTAK_ORDER_HOSTS;
  const query = trade?.serverId ? `?sId=${encodeURIComponent(trade.serverId)}` : "";
  return hosts.map((host) => `${host}/quick/order/rule/ms/place${query}`);
}

export function mapKotakOrdSt(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (/reject/.test(raw)) return "REJECTED";
  if (/cancel|expired/.test(raw)) return "CANCELLED";
  if (/complete|traded|filled/.test(raw) && !/pending|partial|part/.test(raw)) return "FILLED";
  if (/part/.test(raw)) return "PARTIAL";
  if (/open|pending|received|transit|trigger|queued/.test(raw)) return "PENDING";
  return "";
}

export function kotakOrderRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data?.data)) return body.data.data;
  if (Array.isArray(body?.data)) return body.data;
  if (body?.nOrdNo || body?.ordSt) return [body];
  return [];
}

export function normalizeKotakBrokerOrder(row = {}) {
  const orderId = String(row.nOrdNo || row.orderId || row.nOrdNo || "").trim();
  const orderStatus = mapKotakOrdSt(row.ordSt || row.stat || row.status || row.orderStatus);
  const filledQty = Number(row.fldQty || row.filledQty || 0);
  const price = Number(row.avgPrc || row.averageTradedPrice || row.tradedPrice || row.prc || 0);
  const reason = String(row.rejRsn || row.ordUsrMsg || row.reason || "")
    .replace(/^(-+|NA)$/i, "")
    .trim();
  return {
    orderId,
    orderStatus,
    filledQty: Number.isFinite(filledQty) ? filledQty : 0,
    averageTradedPrice: Number.isFinite(price) && price > 0 ? price : 0,
    price: Number.isFinite(price) && price > 0 ? price : 0,
    reason,
  };
}

export function pickKotakHistoryState(rows) {
  const mapped = (Array.isArray(rows) ? rows : []).map(normalizeKotakBrokerOrder).filter((row) => row.orderId);
  const rank = { REJECTED: 4, FILLED: 3, CANCELLED: 3, PARTIAL: 2, PENDING: 1 };
  return mapped.sort((left, right) => (rank[right.orderStatus] || 0) - (rank[left.orderStatus] || 0))[0] || null;
}

function kotakHistoryUrls(trade) {
  const hosts = trade?.baseUrl ? [trade.baseUrl] : KOTAK_ORDER_HOSTS;
  const query = trade?.serverId ? `?sId=${encodeURIComponent(trade.serverId)}` : "";
  return hosts.map((host) => `${host}/quick/order/history${query}`);
}

async function readKotakPlacedOrder({ trade, orderId, fetchImpl, headers }) {
  const body = new URLSearchParams({ jData: JSON.stringify({ nOrdNo: orderId }) }).toString();
  let last = null;
  for (const url of kotakHistoryUrls(trade)) {
    try {
      const parsed = await kotakRequest(fetchImpl, url, { method: "POST", headers, body });
      const viewed = pickKotakHistoryState(kotakOrderRows(parsed));
      if (viewed?.orderId) return viewed;
    } catch (error) {
      last = error;
      if (!kotakHostMiss(error) || url === kotakHistoryUrls(trade).at(-1)) break;
    }
  }
  return null;
}

function kotakLiveFromPlace({ orderId, tradingSymbol, amo, viewed }) {
  const pending = {
    orderId,
    status: "PENDING",
    brokerId: "kotak",
    tradingSymbol,
    reason: amo === "YES" ? "Sent to Kotak Neo as an after-market order." : "Sent to Kotak Neo.",
  };
  if (!viewed?.orderStatus || viewed.orderStatus === "PENDING") return pending;
  return {
    ...pending,
    status: viewed.orderStatus,
    filledQty: viewed.filledQty,
    price: viewed.averageTradedPrice || viewed.price || 0,
    reason:
      viewed.reason ||
      (viewed.orderStatus === "FILLED" ? "Filled on Kotak Neo." : viewed.orderStatus === "REJECTED" ? "Rejected on Kotak Neo." : pending.reason),
  };
}

async function placeKotakOrder({ payload, session, fetchImpl, lane, nfo, qty, side, product }) {
  const creds = kotakDeskCreds(session, lane);
  const memberPair = lane === "member" ? kotakMemberTradePair(creds) : null;
  const pastedTrade = Boolean(memberPair?.sid && memberPair?.auth);
  let trade = null;
  if (!pastedTrade && canKotakTradeLogin(creds)) {
    trade = await openKotakTradeSession(creds, fetchImpl, lane);
  } else if (creds.baseUrl && creds.tradeToken) {
    trade = {
      baseUrl: creds.baseUrl,
      tradeToken: creds.tradeToken,
      tradeSid: creds.tradeSid || creds.sessionToken,
      serverId: creds.serverId,
    };
  }
  if (lane === "member" && !trade && (!memberPair?.sid || !memberPair?.auth)) {
    const who = creds.clientId ? `client ID ${creds.clientId}` : "this user";
    throw fail(
      `Kotak Neo has no trade session for ${who}. The quote consumer key cannot place this order. On Profile, paste this user's trade-login mobile, MPIN, and TOTP, or paste the Neo sid and the session token from today's trade login.`,
    );
  }
  if (lane !== "member" && !trade) {
    throw fail(
      "Kotak Neo admin order was not sent. Save the access token, trade-login mobile, MPIN, and TOTP secret on Brokers. The desk calls tradeApiLogin, then tradeApiValidate, then places on the host Kotak returns.",
    );
  }
  const auth = trade?.tradeToken || memberPair?.auth || "";
  const sid = trade?.tradeSid || memberPair?.sid || "";
  if (!auth || !sid) throw fail("Kotak Neo has no trade session for this order.");
  const jData = kotakOrderBody({ payload, nfo, qty, side, product });
  const headers = {
    Auth: auth,
    Sid: sid,
    "neo-fin-key": "neotradeapi",
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const body = new URLSearchParams({ jData: JSON.stringify(jData) }).toString();
  const urls = kotakPlaceUrls(trade);
  console.log(`Kotak ${jData.am === "YES" ? "AMO " : ""}${side} ${jData.es} ${jData.pc} ${jData.pt} qty ${jData.qt} ${jData.ts}`);
  let last = null;
  for (const url of urls) {
    try {
      const parsed = await kotakRequest(fetchImpl, url, { method: "POST", headers, body });
      const orderId = String(parsed.nOrdNo || parsed.data?.nOrdNo || parsed.orderId || "");
      if (!orderId) throw fail("Kotak Neo did not return an order number.");
      let viewed = null;
      try {
        viewed = await readKotakPlacedOrder({ trade: trade || { baseUrl: new URL(url).origin, serverId: trade?.serverId }, orderId, fetchImpl, headers });
      } catch {
        viewed = null;
      }
      return kotakLiveFromPlace({ orderId, tradingSymbol: jData.ts, amo: jData.am, viewed });
    } catch (error) {
      last = error;
      if (!kotakHostMiss(error) || url === urls[urls.length - 1]) throw error;
    }
  }
  throw last || fail("Kotak Neo order was not sent.");
}

function memberKotakOwnKeyError(error, session = {}) {
  const raw = String(error?.message || "");
  const key = String(session.apiKey || "").trim();
  const token = String(session.accessToken || "").trim();
  if (!/consumer key/i.test(raw) || !/does not exist|not linked/i.test(raw)) {
    let message = raw;
    if (key) message = message.split(key).join(credentialHint(key));
    if (token && token !== key) message = message.split(token).join(credentialHint(token));
    if (message === raw) return error instanceof Error ? error : new Error(message);
    const next = new Error(message);
    next.status = error?.status || 400;
    return next;
  }
  const who = String(session.clientId || "").trim() ? `client ID ${String(session.clientId).trim()}` : "this user";
  const next = new Error(
    `Kotak Neo refused this user's own consumer key ${credentialHint(key || token)} for ${who}. The admin broker was not used. This key loads quotes. Orders need the trade consumer key from this user's own Kotak Neo API app.`,
  );
  next.status = error?.status || 424;
  return next;
}

export async function placeLiveBrokerOrder(id, payload = {}, fetchImpl = fetch) {
  const brokerName = liveBrokerMeta(id)?.name || id;
  const { lane, session } = liveOrderSession(payload, liveBrokerSession(id), { brokerName });
  try {
    return await placeConnectedLiveBrokerOrder(id, payload, session, fetchImpl, lane);
  } catch (error) {
    const owned = lane === "member" && String(id) === "kotak" ? memberKotakOwnKeyError(error, session) : error;
    const wrapped = lane === "member" ? annotateMemberLiveAuthError(owned, session, { brokerName }) : owned;
    if (String(id) === "kotak") stampKotakPlaceError(wrapped);
    throw wrapped;
  }
}

async function placeConnectedLiveBrokerOrder(id, payload, session, fetchImpl, lane = "admin") {
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
    const crude = isMcxSymbol(symbol);
    const useNseCommodity = crude && upstoxMcxApiDisabledNow();
    let instrument = upstoxInstrumentKeyFromPayload(payload);
    if (useNseCommodity && String(instrument).startsWith("MCX_")) instrument = "";
    let resolved = null;
    if (!instrument) {
      resolved = await resolveUpstoxInstrumentKey({
        symbol,
        expiry,
        strike: payload.strike,
        option: payload.option,
        accessToken: session.accessToken,
        fetchImpl,
        segment: useNseCommodity ? "NSE" : "",
      });
      instrument = resolved?.key || "";
    }
    if (!instrument) throw fail("Upstox live orders need an instrument key or security id.");
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const upstoxOrder = (hit, token) => {
      const limit = upstoxLimit(payload, hit?.tick || 0);
      const commodity = crude || String(token).startsWith("NSE_COM") || String(token).startsWith("MCX_");
      return {
        quantity: upstoxPlaceQuantity(payload, qty, hit || { key: token }),
        product: product === "NRML" || commodity ? "D" : "I",
        validity: "DAY",
        price: limit.price,
        instrument_token: token,
        order_type: limit.orderType,
        transaction_type: side,
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false,
      };
    };
    const upstoxAttempts = (order) => {
      const protection = order.order_type === "MARKET" ? { market_protection: -1 } : {};
      return [
        { url: "https://api-hft.upstox.com/v3/order/place", body: { ...order, slice: false, ...protection } },
        { url: "https://api-hft.upstox.com/v2/order/place", body: { ...order, ...protection } },
      ];
    };
    let current = upstoxOrder(resolved, instrument);
    let nseUsed = useNseCommodity || String(instrument).startsWith("NSE_COM");
    let deliveryRetried = current.product === "D";
    let lastError = null;
    for (let round = 0; round < 3; round += 1) {
      let switchToNse = false;
      let switchToDelivery = false;
      for (const attempt of upstoxAttempts(current)) {
        try {
          const body = await httpJson(fetchImpl, attempt.url, {
            method: "POST",
            headers,
            body: JSON.stringify(attempt.body),
          });
          const tradingSymbol = nseUsed ? resolved?.tradingSymbol || "" : "";
          const note = [current.product === "D" && crude ? "Delivery" : "", tradingSymbol ? `NSE NSCOM · ${tradingSymbol}` : ""]
            .filter(Boolean)
            .join(" · ");
          return {
            orderId: String(body.data?.order_id || body.data?.order_ids?.[0] || body.order_id || ""),
            status: "PENDING",
            brokerId: "upstox",
            tradingSymbol,
            reason: note,
          };
        } catch (error) {
          lastError = error;
          if (!nseUsed && crude && upstoxMcxApiDisabledError(error)) {
            noteUpstoxMcxApiDisabled();
            switchToNse = true;
            break;
          }
          if (!deliveryRetried && current.product === "I" && upstoxIntradayBlocked(error)) {
            deliveryRetried = true;
            switchToDelivery = true;
            break;
          }
          const message = String(error?.message || "");
          const retry =
            error.status === 401 ||
            error.status === 404 ||
            error.status === 410 ||
            /UDAPI10000|UDAPI100015|not supported|does not exist/i.test(message);
          if (!retry) throw decorateUpstoxPlaceError(error);
        }
      }
      if (switchToDelivery) {
        current = { ...current, product: "D" };
        continue;
      }
      if (!switchToNse) throw decorateUpstoxPlaceError(lastError || fail("Upstox live order place failed."));
      const nse = await resolveUpstoxInstrumentKey({
        symbol,
        expiry,
        strike: payload.strike,
        option: payload.option,
        accessToken: session.accessToken,
        fetchImpl,
        segment: "NSE",
      });
      if (!nse?.key) throw decorateUpstoxPlaceError(lastError || fail("Upstox live order place failed."));
      nseUsed = true;
      resolved = nse;
      current = upstoxOrder(nse, nse.key);
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
    return placeKotakOrder({ payload, session, fetchImpl, lane, nfo, qty, side, product });
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
