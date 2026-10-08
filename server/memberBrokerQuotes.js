import { fetchDhanTapeQuotes } from "./dhan.js";
import { upcomingExpiries } from "./optionChain.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const INDEX_INSTRUMENTS = [
  { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index" },
  { symbol: "BANKNIFTY", parent: "BANKNIFTY", kind: "index" },
  { symbol: "FINNIFTY", parent: "FINNIFTY", kind: "index" },
  { symbol: "SENSEX", parent: "SENSEX", kind: "index" },
  { symbol: "INDIA VIX", parent: "INDIA VIX", kind: "index" },
];

export const CRUDE_INSTRUMENT = { symbol: "CRUDEOIL", parent: "CRUDEOIL", kind: "future" };

export const CARD_INSTRUMENTS = INDEX_INSTRUMENTS.concat(CRUDE_INSTRUMENT);

const UPSTOX_KEYS = {
  "NIFTY 50": "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  SENSEX: "BSE_INDEX|SENSEX",
  "INDIA VIX": "NSE_INDEX|India VIX",
};

const ZERODHA_KEYS = {
  "NIFTY 50": "NSE:NIFTY 50",
  BANKNIFTY: "NSE:NIFTY BANK",
  FINNIFTY: "NSE:NIFTY FIN SERVICE",
  SENSEX: "BSE:SENSEX",
  "INDIA VIX": "NSE:INDIA VIX",
};

const FYERS_KEYS = {
  "NIFTY 50": "NSE:NIFTY50-INDEX",
  BANKNIFTY: "NSE:NIFTYBANK-INDEX",
  FINNIFTY: "NSE:FINNIFTY-INDEX",
  SENSEX: "BSE:SENSEX-INDEX",
  "INDIA VIX": "NSE:INDIAVIX-INDEX",
};

const ANGEL_TOKENS = {
  "NIFTY 50": { exchange: "NSE", token: "99926000" },
  BANKNIFTY: { exchange: "NSE", token: "99926009" },
  FINNIFTY: { exchange: "NSE", token: "99926037" },
  SENSEX: { exchange: "BSE", token: "99919000" },
  "INDIA VIX": { exchange: "NSE", token: "99926017" },
};

export function frontMonthFutCode(root, ymd) {
  const match = String(ymd || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  return `${root}${match[1].slice(-2)}${MONTHS[Number(match[2]) - 1]}FUT`;
}

export function crudeInstrumentKey(brokerId, ymd = upcomingExpiries("CRUDEOIL", 1)[0]) {
  const code = frontMonthFutCode("CRUDEOIL", ymd);
  if (!code) return "";
  const id = String(brokerId || "").toLowerCase();
  if (id === "upstox") return `MCX_FO|${code}`;
  if (id === "zerodha" || id === "fyers") return `MCX:${code}`;
  return "";
}

export function crudeInstrumentKeys(brokerId, dates = upcomingExpiries("CRUDEOIL", 3)) {
  return [...new Set((dates || []).map((ymd) => crudeInstrumentKey(brokerId, ymd)).filter(Boolean))];
}

export function pickCrudeSearchHit(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const hits = list.filter((row) => {
    const blob = `${row.trading_symbol || ""} ${row.tradingsymbol || ""} ${row.name || ""} ${row.underlying_symbol || ""} ${row.instrument_type || ""} ${row.instrument_key || ""}`.toUpperCase();
    if (!blob.includes("CRUDEOIL") || blob.includes("CRUDEOILM")) return false;
    const type = String(row.instrument_type || row.instrumentType || "").toUpperCase();
    return type === "FUT" || /\bFUT\b/.test(blob);
  });
  hits.sort((a, b) => String(a.expiry || a.expiry_date || "").localeCompare(String(b.expiry || b.expiry_date || "")));
  return String(hits[0]?.instrument_key || hits[0]?.instrumentKey || "").trim();
}

export function rowsFromUpstoxInstrumentText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  try {
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed);
      return Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
    }
  } catch {
    return [];
  }
  return [];
}

export function crudeQuoteFromPayload(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  if (!data || typeof data !== "object") return null;
  const entries = Array.isArray(data) ? data.map((row, index) => [String(index), row]) : Object.entries(data);
  for (const [key, row] of entries) {
    if (!row || typeof row !== "object") continue;
    const blob = `${key} ${row.instrument_token || ""} ${row.instrument_key || ""} ${row.trading_symbol || ""} ${row.n || ""}`.toUpperCase();
    if (!blob.includes("CRUDEOIL") || blob.includes("CRUDEOILM")) continue;
    const inner = row.v && typeof row.v === "object" ? row.v : row;
    const last = pickNumber(inner.last_price, inner.lastPrice, inner.ltp, inner.lp, inner.last_traded_price);
    const next = quoteRow(CRUDE_INSTRUMENT, last, pickPrevClose(inner, last), pickSignedNumber(inner.net_change, inner.netChange));
    if (next) {
      next.expiry = String(inner.expiry || row.expiry || "").slice(0, 10);
      return next;
    }
  }
  return null;
}

const KOTAK_QUOTE_BASES = [
  "https://mis.kotaksecurities.com",
  "https://e21.kotaksecurities.com",
  "https://e22.kotaksecurities.com",
  "https://e41.kotaksecurities.com",
  "https://e43.kotaksecurities.com",
];

const KOTAK_INDEX_TOKENS = [
  { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", token: "Nifty 50", segment: "nse_cm" },
  { symbol: "BANKNIFTY", parent: "BANKNIFTY", kind: "index", token: "Nifty Bank", segment: "nse_cm" },
  { symbol: "FINNIFTY", parent: "FINNIFTY", kind: "index", token: "Nifty Fin Service", segment: "nse_cm" },
  { symbol: "SENSEX", parent: "SENSEX", kind: "index", token: "SENSEX", segment: "bse_cm" },
  { symbol: "INDIA VIX", parent: "INDIA VIX", kind: "index", token: "INDIA VIX", segment: "nse_cm" },
];

export function brokerNeedsApiKey(brokerId) {
  return ["zerodha", "fyers", "kotak", "angelone"].includes(String(brokerId || "").toLowerCase());
}

export function supportedMemberQuoteBroker(brokerId) {
  return ["dhan", "upstox", "zerodha", "fyers", "angelone", "kotak"].includes(String(brokerId || "").toLowerCase());
}

export function flattenKotakQuoteRows(payload) {
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === "object");
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.data)) return payload.data.filter((row) => row && typeof row === "object");
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === "object");
  if (!data || typeof data !== "object") return [];
  const entries = Object.entries(data).filter(([, row]) => row && typeof row === "object" && !Array.isArray(row));
  const quoteLike = (row) =>
    row.ltp != null ||
    row.lp != null ||
    row.last_price != null ||
    row.last_traded_price != null ||
    row.ts ||
    row.trading_symbol ||
    row.tradingsymbol ||
    row.display_symbol;
  if (entries.length && entries.every(([, row]) => quoteLike(row))) {
    return entries.map(([key, row]) => ({ ...row, _key: key }));
  }
  if (quoteLike(data)) return [data];
  return [];
}

export function quotesFromKotakPayload(payload) {
  const rows = flattenKotakQuoteRows(payload);
  const quotes = [];
  for (const spec of KOTAK_INDEX_TOKENS) {
    const row = rows.find((item) => {
      const token = String(item?.exchange_token || item?.instrument_token || item?.ts || item?.display_symbol || "").trim().toUpperCase();
      return token === spec.token.toUpperCase() || token.startsWith(`${spec.token.toUpperCase()}-`);
    });
    if (!row) continue;
    const last = pickNumber(row.ltp, row.last_traded_price, row.last_price, row.lp);
    const prev = pickNumber(row.ohlc?.close, row.close, row.c, row.prev_close);
    const next = quoteRow(spec, last, prev, pickSignedNumber(row.change, row.per_change, row.chg));
    if (next) quotes.push(next);
  }
  return quotes;
}

export function kotakNeoFutCode(root, ymd) {
  const match = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${root}${match[3]}${MONTHS[Number(match[2]) - 1]}${match[1].slice(-2)}FUT`;
}

export function kotakCrudeSymbols(dates = upcomingExpiries("CRUDEOIL", 2)) {
  const neo = [];
  const kite = [];
  for (const ymd of dates || []) {
    const neoCode = kotakNeoFutCode("CRUDEOIL", ymd);
    const kiteCode = frontMonthFutCode("CRUDEOIL", ymd);
    if (neoCode) neo.push(neoCode);
    if (kiteCode) kite.push(kiteCode);
  }
  return [...new Set([...neo, ...kite, "CRUDEOIL"])];
}

function kotakRowBlob(row = {}) {
  return `${row.trading_symbol || ""} ${row.tradingsymbol || ""} ${row.display_symbol || ""} ${row.exchange_token || ""} ${row.pTrdSymbol || ""} ${row.instrument_token || ""} ${row.ts || ""} ${row.n || ""} ${row.symbol || ""} ${row._key || ""}`.toUpperCase();
}

function expiryFromKotakCrudeBlob(blob = "") {
  const neo = String(blob || "").toUpperCase().match(/CRUDEOIL(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})FUT/);
  if (neo) {
    const month = MONTHS.indexOf(neo[2]) + 1;
    if (month < 1) return "";
    return `20${neo[3]}-${String(month).padStart(2, "0")}-${neo[1]}`;
  }
  return "";
}

export function quoteFromKotakCrude(payload) {
  const rows = flattenKotakQuoteRows(payload);
  const hits = rows.filter((item) => {
    const blob = kotakRowBlob(item);
    if (!blob.includes("CRUDEOIL") || blob.includes("CRUDEOILM")) return false;
    const kind = `${item?.instrument_type || ""} ${item?.exchange_token || ""} ${blob}`.toUpperCase();
    if (/\b(CE|PE)\b/.test(kind) && !/FUT/.test(kind)) return false;
    return true;
  });
  const row = hits[0];
  if (!row) return null;
  const last = pickNumber(row.ltp, row.last_traded_price, row.last_price, row.lastPrice, row.lp);
  const close = pickNumber(row.ohlc?.close, row.close, row.c, row.prev_close, row.prevClose);
  const next = quoteRow(CRUDE_INSTRUMENT, last, close, pickSignedNumber(row.change, row.per_change, row.chg, row.net_change));
  if (next) {
    next.expiry = String(row.expiry || row.exp || expiryFromKotakCrudeBlob(kotakRowBlob(row))).slice(0, 10);
  }
  return next;
}

function quoteRow(instrument, ltp, close, netChange) {
  const price = Number(ltp);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prev = Number(close);
  const net = Number(netChange);
  return {
    symbol: instrument.symbol,
    parent: instrument.parent,
    kind: instrument.kind,
    ltp: price,
    close: Number.isFinite(prev) && prev > 0 ? prev : 0,
    prevClose: Number.isFinite(prev) && prev > 0 ? prev : 0,
    netChange: Number.isFinite(net) ? net : undefined,
    expiry: "",
  };
}

function normKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\|/g, ":")
    .replace(/\s+/g, " ");
}

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function pickSignedNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickPrevClose(inner = {}, last = 0) {
  const prev = pickNumber(
    inner.prev_close,
    inner.prevClose,
    inner.prev_close_price,
    inner.previous_close,
    inner.ohlc?.prev_close,
    inner.ohlc?.close,
    inner.close,
    inner.close_price,
  );
  const net = pickSignedNumber(inner.net_change, inner.netChange, inner.change);
  if (prev > 0 && prev !== last) return prev;
  if (net != null && last > 0 && Math.abs(net) > 0.0001) return Number((last - net).toFixed(2));
  return prev > 0 ? prev : 0;
}

export function quotesFromKeyedPayload(data, keyBySymbol, { ltp, close } = {}) {
  const bag = data && typeof data === "object" ? data : {};
  const byNorm = new Map();
  for (const [rawKey, row] of Object.entries(bag)) {
    if (!row || typeof row !== "object") continue;
    byNorm.set(normKey(rawKey), row);
    if (row.instrument_token) byNorm.set(normKey(row.instrument_token), row);
    if (row.instrument_key) byNorm.set(normKey(row.instrument_key), row);
    if (row.n) byNorm.set(normKey(row.n), row);
  }
  const quotes = [];
  for (const instrument of CARD_INSTRUMENTS) {
    const key = keyBySymbol[instrument.symbol];
    if (!key) continue;
    const row = byNorm.get(normKey(key));
    if (!row) continue;
    const inner = row.v && typeof row.v === "object" ? row.v : row;
    const last = typeof ltp === "function" ? ltp(inner) : pickNumber(inner.last_price, inner.lastPrice, inner.ltp, inner.lp, inner.last_traded_price);
    const prev = typeof close === "function" ? close(inner) : pickPrevClose(inner, last);
    const next = quoteRow(instrument, last, prev, pickSignedNumber(inner.net_change, inner.netChange, inner.v?.net_change));
    if (next) quotes.push(next);
  }
  return quotes;
}

export function quotesFromUpstoxPayload(payload) {
  return quotesFromKeyedPayload(payload?.data || payload, UPSTOX_KEYS);
}

export function quotesFromZerodhaPayload(payload) {
  return quotesFromKeyedPayload(payload?.data || payload, ZERODHA_KEYS);
}

export function quotesFromFyersPayload(payload) {
  const rows = Array.isArray(payload?.d) ? payload.d : [];
  const keyed = {};
  for (const row of rows) {
    if (row?.n) keyed[row.n] = row;
  }
  return quotesFromKeyedPayload(keyed, FYERS_KEYS, {
    ltp: (row) => pickNumber(row.lp, row.last_price, row.ltp),
    close: (row) => pickPrevClose(row.v && typeof row.v === "object" ? { ...row, ...row.v } : row, pickNumber(row.lp, row.last_price, row.ltp)),
  });
}

export function quotesFromAngelPayload(payload) {
  const rows = payload?.data?.fetched || payload?.data || [];
  const list = Array.isArray(rows) ? rows : [];
  const quotes = [];
  for (const instrument of CARD_INSTRUMENTS) {
    const spec = ANGEL_TOKENS[instrument.symbol];
    if (!spec) continue;
    const row = list.find((item) => String(item?.symbolToken || item?.symboltoken || "") === spec.token);
    if (!row) continue;
    const last = pickNumber(row.ltp, row.last_price);
    const next = quoteRow(instrument, last, pickPrevClose(row, last), pickSignedNumber(row.netChange, row.net_change));
    if (next) quotes.push(next);
  }
  return quotes;
}

async function readJson(fetchImpl, url, options) {
  const res = await fetchImpl(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const error = new Error(json?.message || json?.emsg || json?.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json;
}

async function fetchUpstoxQuotes({ accessToken, fetchImpl }) {
  const keys = INDEX_INSTRUMENTS.map((row) => UPSTOX_KEYS[row.symbol]).filter(Boolean).join(",");
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  let quotes = [];
  try {
    const payload = await readJson(fetchImpl, `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`, { headers });
    quotes = quotesFromUpstoxPayload(payload);
  } catch {
    quotes = [];
  }
  if (!quotes.length) {
    const payload = await readJson(fetchImpl, `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`, { headers });
    quotes = quotesFromUpstoxPayload(payload);
  }
  return quotes.concat(await fetchUpstoxCrude({ accessToken, fetchImpl }));
}

const UPSTOX_CRUDE_SEARCH = [
  "https://api.upstox.com/v2/instruments/search?query=CRUDEOIL&exchanges=MCX&segments=FUT&instrument_types=FUT&expiry=current_month",
  "https://api.upstox.com/v2/search/instruments?query=CRUDEOIL%20FUT&exchanges=MCX&segments=FUT",
];

const UPSTOX_MCX_INSTRUMENTS = [
  "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json",
  "https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz",
];

let upstoxInstrumentCache = { at: 0, rows: [] };
const UPSTOX_INSTRUMENT_TTL_MS = 6 * 60 * 60 * 1000;

export function resetUpstoxInstrumentCache() {
  upstoxInstrumentCache = { at: 0, rows: [] };
}

async function decodeFetchText(res) {
  if (typeof res.arrayBuffer === "function") {
    const buf = Buffer.from(await res.arrayBuffer());
    const asText = buf.toString("utf8");
    if (asText.trim().startsWith("[") || asText.trim().startsWith("{") || asText.includes("instrument_key")) {
      return asText;
    }
    try {
      const { gunzipSync } = await import("node:zlib");
      return gunzipSync(buf).toString("utf8");
    } catch {
      return asText;
    }
  }
  if (typeof res.text === "function") return res.text();
  return "";
}

async function fetchUpstoxInstrumentRows(fetchImpl) {
  if (upstoxInstrumentCache.rows.length && Date.now() - upstoxInstrumentCache.at < UPSTOX_INSTRUMENT_TTL_MS) {
    return upstoxInstrumentCache.rows;
  }
  for (const url of UPSTOX_MCX_INSTRUMENTS) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json, application/gzip, */*" } });
      if (!res?.ok) continue;
      const rows = rowsFromUpstoxInstrumentText(await decodeFetchText(res));
      if (rows.length) {
        upstoxInstrumentCache = { at: Date.now(), rows };
        return rows;
      }
    } catch {
      /* next instrument file */
    }
  }
  return [];
}

async function fetchUpstoxCrude({ accessToken, fetchImpl }) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const keys = [];
  for (const url of UPSTOX_CRUDE_SEARCH) {
    try {
      const found = await readJson(fetchImpl, url, { headers });
      const key = pickCrudeSearchHit(found?.data || found);
      if (key) keys.push(key);
    } catch {
      /* try the public MCX instrument list, then constructed keys */
    }
  }
  try {
    const key = pickCrudeSearchHit(await fetchUpstoxInstrumentRows(fetchImpl));
    if (key) keys.push(key);
  } catch {
    /* constructed tradingsymbol keys are last */
  }
  keys.push(...crudeInstrumentKeys("upstox"));
  const seen = new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const payload = await readJson(fetchImpl, `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(key)}`, { headers });
      const quote = crudeQuoteFromPayload(payload) || quotesFromKeyedPayload(payload?.data || payload, { CRUDEOIL: key })[0];
      if (quote) return [quote];
    } catch {
      /* next key */
    }
  }
  return [];
}

async function fetchZerodhaQuotes({ accessToken, apiKey, fetchImpl }) {
  const query = INDEX_INSTRUMENTS.map((row) => `i=${encodeURIComponent(ZERODHA_KEYS[row.symbol])}`).join("&");
  const payload = await readJson(fetchImpl, `https://api.kite.trade/quote?${query}`, {
    headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${accessToken}` },
  });
  const quotes = quotesFromZerodhaPayload(payload);
  const crudeKey = crudeInstrumentKey("zerodha");
  if (!crudeKey) return quotes;
  try {
    const extra = await readJson(fetchImpl, `https://api.kite.trade/quote?i=${encodeURIComponent(crudeKey)}`, {
      headers: { "X-Kite-Version": "3", Authorization: `token ${apiKey}:${accessToken}` },
    });
    return quotes.concat(quotesFromKeyedPayload(extra?.data || extra, { CRUDEOIL: crudeKey }));
  } catch {
    return quotes;
  }
}

async function fetchFyersQuotes({ accessToken, apiKey, fetchImpl }) {
  const symbols = INDEX_INSTRUMENTS.map((row) => FYERS_KEYS[row.symbol]).join(",");
  const payload = await readJson(fetchImpl, `https://api-t1.fyers.in/data/quotes?symbols=${encodeURIComponent(symbols)}`, {
    headers: { Authorization: `${apiKey}:${accessToken}` },
  });
  const quotes = quotesFromFyersPayload(payload);
  const crudeKey = crudeInstrumentKey("fyers");
  if (!crudeKey) return quotes;
  try {
    const extra = await readJson(fetchImpl, `https://api-t1.fyers.in/data/quotes?symbols=${encodeURIComponent(crudeKey)}`, {
      headers: { Authorization: `${apiKey}:${accessToken}` },
    });
    const keyed = {};
    for (const row of extra?.d || []) {
      if (row?.n) keyed[row.n] = row;
    }
    return quotes.concat(
      quotesFromKeyedPayload(keyed, { CRUDEOIL: crudeKey }, {
        ltp: (row) => pickNumber(row.lp, row.last_price, row.ltp),
        close: (row) => pickPrevClose(row.v && typeof row.v === "object" ? { ...row, ...row.v } : row, pickNumber(row.lp, row.last_price, row.ltp)),
      }),
    );
  } catch {
    return quotes;
  }
}

async function fetchKotakNeo(fetchImpl, token, neo) {
  const path = `/script-details/1.0/quotes/neosymbol/${encodeURIComponent(neo)}/all`;
  let last = null;
  for (const base of KOTAK_QUOTE_BASES) {
    try {
      return await readJson(fetchImpl, `${base}${path}`, {
        headers: { Authorization: token, Accept: "application/json" },
      });
    } catch (error) {
      last = error;
    }
  }
  if (last) throw last;
  return null;
}

async function fetchKotakQuotes({ accessToken, apiKey, fetchImpl }) {
  const token = String(apiKey || accessToken || "").trim();
  if (!token) return [];
  const indexNeo = KOTAK_INDEX_TOKENS.map((row) => `${row.segment}|${row.token}`).join(",");
  let quotes = [];
  try {
    quotes = quotesFromKotakPayload(await fetchKotakNeo(fetchImpl, token, indexNeo));
  } catch {
    quotes = [];
  }
  for (const code of kotakCrudeSymbols()) {
    try {
      const crude = quoteFromKotakCrude(await fetchKotakNeo(fetchImpl, token, `mcx_fo|${code}`));
      if (!crude) continue;
      quotes = quotes.filter((row) => row.symbol !== "CRUDEOIL").concat(crude);
      break;
    } catch {
      /* the next crude contract; index quotes stay */
    }
  }
  return quotes;
}

async function fetchAngelQuotes({ accessToken, apiKey, clientId, fetchImpl }) {
  const exchangeTokens = {};
  for (const instrument of INDEX_INSTRUMENTS) {
    const spec = ANGEL_TOKENS[instrument.symbol];
    if (!exchangeTokens[spec.exchange]) exchangeTokens[spec.exchange] = [];
    exchangeTokens[spec.exchange].push(spec.token);
  }
  const payload = await readJson(fetchImpl, "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-PrivateKey": apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "OHLC", exchangeTokens }),
  });
  return quotesFromAngelPayload(payload);
}

export async function fetchMemberBrokerQuotes({
  brokerId,
  accessToken,
  clientId,
  apiKey,
  fetchImpl = fetch,
  fetchDhan = fetchDhanTapeQuotes,
} = {}) {
  const id = String(brokerId || "").trim().toLowerCase();
  const token = String(accessToken || "").trim();
  const key = String(apiKey || "").trim();
  const accountId = String(clientId || "").trim();
  if (id === "kotak") return fetchKotakQuotes({ accessToken: token, apiKey: key, fetchImpl });
  if (!token) return [];
  if (id === "dhan") return fetchDhan({ accessToken: token, clientId: accountId });
  if (id === "upstox") return fetchUpstoxQuotes({ accessToken: token, fetchImpl });
  if (id === "zerodha") return fetchZerodhaQuotes({ accessToken: token, apiKey: key, fetchImpl });
  if (id === "fyers") return fetchFyersQuotes({ accessToken: token, apiKey: key, fetchImpl });
  if (id === "angelone") return fetchAngelQuotes({ accessToken: token, apiKey: key, clientId: accountId, fetchImpl });
  return [];
}
