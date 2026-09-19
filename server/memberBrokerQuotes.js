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

export function brokerNeedsApiKey(brokerId) {
  return ["zerodha", "fyers", "kotak", "angelone"].includes(String(brokerId || "").toLowerCase());
}

export function supportedMemberQuoteBroker(brokerId) {
  return ["dhan", "upstox", "zerodha", "fyers", "angelone"].includes(String(brokerId || "").toLowerCase());
}

function quoteRow(instrument, ltp, close) {
  const price = Number(ltp);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prev = Number(close);
  return {
    symbol: instrument.symbol,
    parent: instrument.parent,
    kind: instrument.kind,
    ltp: price,
    close: Number.isFinite(prev) && prev > 0 ? prev : price,
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
    const prev = typeof close === "function" ? close(inner) : pickNumber(inner.ohlc?.close, inner.close, inner.prev_close_price, inner.close_price);
    const next = quoteRow(instrument, last, prev);
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
    close: (row) => pickNumber(row.prev_close_price, row.close, row.ohlc?.close),
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
    const next = quoteRow(instrument, pickNumber(row.ltp, row.last_price), pickNumber(row.close, row.close_price));
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

async function fetchUpstoxCrude({ accessToken, fetchImpl }) {
  const key = crudeInstrumentKey("upstox");
  if (!key) return [];
  try {
    const payload = await readJson(
      fetchImpl,
      `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(key)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    return quotesFromKeyedPayload(payload?.data || payload, { CRUDEOIL: key });
  } catch {
    return [];
  }
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
        close: (row) => pickNumber(row.prev_close_price, row.close, row.ohlc?.close),
      }),
    );
  } catch {
    return quotes;
  }
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
  if (!token) return [];
  if (id === "dhan") return fetchDhan({ accessToken: token, clientId: accountId });
  if (id === "upstox") return fetchUpstoxQuotes({ accessToken: token, fetchImpl });
  if (id === "zerodha") return fetchZerodhaQuotes({ accessToken: token, apiKey: key, fetchImpl });
  if (id === "fyers") return fetchFyersQuotes({ accessToken: token, apiKey: key, fetchImpl });
  if (id === "angelone") return fetchAngelQuotes({ accessToken: token, apiKey: key, clientId: accountId, fetchImpl });
  return [];
}
