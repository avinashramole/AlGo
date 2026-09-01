import { ipv4Request } from "./ipv4.js";
import { Buffer } from "node:buffer";
import { WebSocket } from "ws";
import { markDhanLive } from "./brokers.js";
import {
  applyLiveQuotes,
  applySyntheticOptionChain,
  clearSimulatedDesk,
  currentOptionRows,
  getChainSpot,
  getOptionMeta,
  replaceDhanBook,
  replaceDhanOrders,
  restoreSimulatedDesk,
  setDhanFeed,
  setLiveCandles,
  setOptionDesk,
} from "./market.js";
import { buildScripChain, parseOptionContract, reloadScripMaster, resolveFrontFutures, resolveTradableSecurityId, scripExpiries } from "./frontFutures.js";
import { dropExpired, getUnderlying, normalizeExpiry, parseDhanChain, upcomingExpiries } from "./optionChain.js";
import {
  canAutoGenerate,
  dhanErrorFlags,
  dhanTokenStatus,
  generateDhanAccessToken,
  isDhanAuthExpiredError,
  isDhanInvalidTotpError,
  isDhanRateLimitError,
  loadDhanSession,
  markDhanAutoStart,
  needsFreshAccessToken,
  requirePinTotp,
  persistPastedToken,
  msUntilTokenKeepAlive,
  resolveTokenExpiry,
  retryAfterMs,
} from "./dhanToken.js";

const DHAN_API = "https://api.dhan.co/v2";
const DHAN_FEED_WS = "wss://api-feed.dhan.co";

const INSTRUMENTS = [
  { symbol: "NIFTY 50", segment: "IDX_I", fallbackSegment: "NSE_IDX", securityId: 13, kind: "index" },
  { symbol: "BANK NIFTY", segment: "IDX_I", fallbackSegment: "NSE_IDX", securityId: 25, kind: "index" },
  { symbol: "FINNIFTY", segment: "IDX_I", fallbackSegment: "NSE_IDX", securityId: 27, kind: "index" },
  { symbol: "SENSEX", segment: "IDX_I", fallbackSegment: "BSE_EQ", securityId: 51, kind: "index" },
  { symbol: "INDIA VIX", segment: "IDX_I", fallbackSegment: "NSE_IDX", securityId: 21, kind: "index" },
  { symbol: "RELIANCE", segment: "NSE_EQ", securityId: 2885, kind: "equity" },
  { symbol: "HDFCBANK", segment: "NSE_EQ", securityId: 1333, kind: "equity" },
  { symbol: "ICICIBANK", segment: "NSE_EQ", securityId: 4963, kind: "equity" },
  { symbol: "INFY", segment: "NSE_EQ", securityId: 1594, kind: "equity" },
  { symbol: "TCS", segment: "NSE_EQ", securityId: 11536, kind: "equity" },
  { symbol: "SBIN", segment: "NSE_EQ", securityId: 3045, kind: "equity" },
  { symbol: "ITC", segment: "NSE_EQ", securityId: 1660, kind: "equity" },
  { symbol: "BHARTIARTL", segment: "NSE_EQ", securityId: 10604, kind: "equity" },
  { symbol: "LT", segment: "NSE_EQ", securityId: 11483, kind: "equity" },
  { symbol: "AXISBANK", segment: "NSE_EQ", securityId: 5900, kind: "equity" },
];

let accessToken = "";
let clientId = "";
let pollTimer = null;
let accountTimer = null;
let chainTimer = null;
let tokenTimer = null;
let socket = null;
let reconnectTimer = null;
let usedFallback = false;
let futureInstruments = [];
let lastTickAt = 0;
let keepAlivePromise = null;
let lastKeepAliveAt = 0;
let credentialsBlockedUntil = 0;
let quoteBackoffUntil = 0;
let chainBusy = false;
let requestSlot = Promise.resolve();
let nextAnyRequestAt = 0;
let nextOptionChainAt = 0;
let nextQuoteAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function waitForDhanSlot(kind) {
  const job = requestSlot.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, nextAnyRequestAt - now, kind === "optionchain" ? nextOptionChainAt - now : 0, kind === "quote" ? nextQuoteAt - now : 0);
    if (wait) await sleep(wait);
    const t = Date.now();
    nextAnyRequestAt = t + 220;
    if (kind === "optionchain") nextOptionChainAt = t + 3500;
    if (kind === "quote") nextQuoteAt = t + 1100;
  });
  requestSlot = job.catch(() => undefined);
  return job;
}

function requestKind(path) {
  if (String(path || "").startsWith("/optionchain")) return "optionchain";
  if (String(path || "").includes("/marketfeed")) return "quote";
  return "other";
}

function liveInstruments() {
  return INSTRUMENTS.concat(futureInstruments);
}

function tokenHint(token) {
  const clean = String(token || "").trim();
  if (clean.length < 8) return clean ? "••••" : null;
  return `••••${clean.slice(-4)}`;
}

function listedIps(ip) {
  return [ip?.primaryIP, ip?.secondaryIP].filter((value) => value && value !== "NA");
}

function parseBoolFlag(value) {
  if (value === true || value === false) return value;
  const text = String(value || "").trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return null;
}

function parseDhanIpPayload(json) {
  const nested = json?.data && typeof json.data === "object" ? json.data : null;
  const data = nested && (nested.primaryIP || nested.primaryIp || nested.detectedIP || nested.detectedIp) ? nested : json || {};
  const detectedIP = String(data.detectedIP || data.detectedIp || data.sourceIP || "").trim();
  const primaryIP = String(data.primaryIP || data.primaryIp || "").trim();
  const secondaryIP = String(data.secondaryIP || data.secondaryIp || "").trim();
  const ipMatchStatus = String(data.ipMatchStatus || "").trim();
  const saved = listedIps({ primaryIP, secondaryIP });
  let ordersAllowed = parseBoolFlag(data.ordersAllowed);
  if (ordersAllowed == null && detectedIP && saved.includes(detectedIP)) ordersAllowed = true;
  if (ordersAllowed == null && /PRIMARY_MATCH|SECONDARY_MATCH|IP_MATCHED|^MATCHED$/i.test(ipMatchStatus)) {
    ordersAllowed = true;
  }
  return { detectedIP, primaryIP, secondaryIP, ipMatchStatus, ordersAllowed };
}

async function fetchDhanIp() {
  if (!accessToken) return null;
  try {
    const res = await ipv4Request(`${DHAN_API}/ip/getIP`, { headers: authHeaders(accessToken, clientId) });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    console.log(`Dhan getIP HTTP ${res.status}: ${String(text || "").slice(0, 400)}`);
    if (!res.ok) return null;
    const ip = parseDhanIpPayload(json);
    if (!ip.detectedIP && !ip.primaryIP) return null;
    setDhanFeed({ ipCheck: ip });
    const saved = listedIps(ip).join(" / ") || "none";
    const allowed =
      ip.ordersAllowed === true ? "allowed" : ip.ordersAllowed === false ? "blocked" : "unknown";
    console.log(
      `Dhan IP check: sees ${ip.detectedIP || "not returned"} · saved ${saved} · orders ${allowed}`,
    );
    return ip;
  } catch (error) {
    console.log(`Dhan getIP failed: ${error.message || error}`);
    return null;
  }
}

function describeIp(ip) {
  if (!ip) return "getIP (none)";
  const saved = listedIps(ip).join("/") || "none";
  const allowed = ip.ordersAllowed === true ? "yes" : ip.ordersAllowed === false ? "no" : "—";
  return `getIP sees ${ip.detectedIP || "—"} saved ${saved} allowed ${allowed}`;
}

function errorBlob(error) {
  return `${error?.message || ""} ${JSON.stringify(error?.body || {})}`;
}

function isClosedMarketError(error) {
  return /market is closed|offline order|after[\s-]?market order/i.test(errorBlob(error));
}

function nseSessionOpen(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  return !weekend && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
}

function withAmo(body) {
  return {
    ...body,
    afterMarketOrder: true,
    amoTime: "OPEN",
    correlationId: `t2s${Date.now()}`.slice(0, 30),
  };
}

function formatPlaceError(error, ip, body) {
  if (isClosedMarketError(error)) {
    return body?.afterMarketOrder
      ? "NSE is closed (09:15–15:30 IST). Dhan did not accept this after-market order. Place it when the market opens."
      : "NSE is closed (09:15–15:30 IST). Dhan asked for an offline/AMO order.";
  }
  const raw = error?.body ? JSON.stringify(error.body).slice(0, 280) : "";
  const sent = body
    ? `sent ${body.transactionType} ${body.exchangeSegment} ${body.productType} ${body.orderType} qty ${body.quantity}`
    : "";
  return [String(error?.message || "Dhan order failed"), describeIp(ip), sent, raw ? `raw ${raw}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function authHeaders(token, id) {
  const headers = {
    Accept: "application/json",
    "access-token": token,
  };
  if (id) headers["client-id"] = id;
  return headers;
}

function remarkText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.error_message || value.errorMessage || value.message || value.error_code || value.errorCode || "");
}

function dhanErrorText(json, fallback) {
  const nested = json?.error && typeof json.error === "object" ? json.error : null;
  const data = json?.data && typeof json.data === "object" ? json.data : null;
  const flags = dhanErrorFlags(json);
  const code = flags.codes.filter((item) => item !== "200").find((item) => item.startsWith("DH-") || /^\d{3}$/.test(item)) || "";
  const dataMessage =
    data && !Array.isArray(data)
      ? Object.values(data).find((value) => typeof value === "string" && value.trim())
      : "";
  const message =
    json?.errorMessage ||
    json?.error_message ||
    nested?.errorMessage ||
    nested?.error_message ||
    remarkText(json?.remarks) ||
    data?.errorMessage ||
    data?.error_message ||
    dataMessage ||
    json?.message ||
    (typeof json?.raw === "string" && json.raw.length < 180 ? json.raw : "") ||
    fallback;
  const clean = String(message || fallback || "Dhan request failed");
  if (code && !clean.includes(String(code))) return `Dhan ${code}: ${clean}`;
  return clean;
}

function dhanFailed(json, res) {
  if (res && !res.ok) return true;
  if (!json || typeof json !== "object") return false;
  const status = String(json.status || json.Status || "").toLowerCase();
  if (status === "failure" || status === "failed" || status === "error") return true;
  if (json.errorCode || json.errorType || json.error?.errorCode || json.error?.errorType) return true;
  const orderStatus = String(json.orderStatus || json.data?.orderStatus || json.order_status || "").toUpperCase();
  return orderStatus === "REJECTED";
}

function throwDhanError(json, res) {
  console.log(`Dhan API error HTTP ${res?.status}: ${JSON.stringify(json).slice(0, 400)}`);
  const flags = dhanErrorFlags(json, res?.status);
  const fallback = flags.rateLimit
    ? "Dhan 429 rate limit. Slowing requests — token is still valid."
    : `Dhan API ${res?.status || ""}`.trim();
  const error = new Error(dhanErrorText(json, fallback));
  error.status = flags.rateLimit ? 429 : flags.authExpired ? 401 : res?.ok ? 400 : res?.status || 400;
  error.body = json;
  error.rateLimit = flags.rateLimit;
  error.authExpired = flags.authExpired;
  error.retryAfterMs = retryAfterMs(res, flags.rateLimit ? 2000 : 0);
  throw error;
}

async function readDhanJson(res) {
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (dhanFailed(json, res)) throwDhanError(json, res);
  return json;
}

async function dhanSend(method, path, token, id, body) {
  const kind = requestKind(path);
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForDhanSlot(kind);
    const headers = authHeaders(token, id);
    if (body != null) headers["Content-Type"] = "application/json";
    const res = await ipv4Request(`${DHAN_API}${path}`, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    try {
      return await readDhanJson(res);
    } catch (error) {
      lastError = error;
      if (!isDhanRateLimitError(error) || attempt === 3) throw error;
      const wait = Math.min(20_000, error.retryAfterMs || 1500 * 2 ** attempt);
      console.log(`Dhan ${path} 429 · retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastError;
}

async function dhanGet(path, token, id) {
  return dhanSend("GET", path, token, id);
}

async function dhanPost(path, token, id, body) {
  return dhanSend("POST", path, token, id, body);
}

async function dhanDelete(path, token, id) {
  return (await dhanSend("DELETE", path, token, id)) || { ok: true };
}

function quoteBody(useFallback, instruments = liveInstruments()) {
  const body = {};
  for (const row of instruments) {
    const segment = useFallback && row.fallbackSegment ? row.fallbackSegment : row.segment;
    if (!body[segment]) body[segment] = [];
    if (!body[segment].includes(row.securityId)) body[segment].push(row.securityId);
  }
  return body;
}

function flattenQuotes(payload) {
  const quotes = [];
  const data = payload?.data || payload || {};
  const instruments = liveInstruments();
  for (const [segment, securities] of Object.entries(data)) {
    if (!securities || typeof securities !== "object") continue;
    for (const [id, quote] of Object.entries(securities)) {
      if (!quote || typeof quote !== "object") continue;
      const securityId = Number(id);
      const instrument =
        instruments.find(
          (row) =>
            row.securityId === securityId &&
            (row.segment === segment || row.fallbackSegment === segment),
        ) || instruments.find((row) => row.securityId === securityId);
      if (!instrument) continue;
      const ltp = Number(quote.last_price ?? quote.ltp ?? quote.lastPrice);
      if (!Number.isFinite(ltp) || ltp <= 0) continue;
      quotes.push({
        symbol: instrument.symbol,
        parent: instrument.parent || instrument.symbol,
        kind: instrument.kind,
        securityId: instrument.securityId,
        expiry: instrument.expiry,
        ltp,
        open: Number(quote.ohlc?.open ?? quote.open),
        high: Number(quote.ohlc?.high ?? quote.high),
        low: Number(quote.ohlc?.low ?? quote.low),
        close: Number(quote.ohlc?.close ?? quote.close),
        vwap: Number(quote.average_price ?? quote.averagePrice ?? quote.vwap),
        netChange: quote.net_change ?? quote.netChange,
        volume: Number(quote.volume ?? quote.vol),
      });
    }
  }
  return quotes;
}

function kolkataStamp(date, time) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${time || `${parts.hour}:${parts.minute}:${parts.second}`}`;
}

function epochMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return n > 10_000_000_000 ? n : n * 1000;
}

function mapChartCandles(payload) {
  const opens = payload?.open || [];
  const highs = payload?.high || [];
  const lows = payload?.low || [];
  const closes = payload?.close || [];
  const volumes = payload?.volume || [];
  const times = payload?.timestamp || [];
  const candles = [];
  for (let i = 0; i < closes.length; i += 1) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    candles.push({
      time: epochMs(times[i]),
      open: Number(opens[i] ?? close),
      high: Number(highs[i] ?? close),
      low: Number(lows[i] ?? close),
      close,
      volume: Number(volumes[i] || 0),
    });
  }
  return candles;
}

function asList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function mapDhanOrders(raw) {
  const statusMap = {
    TRANSIT: "PENDING",
    PENDING: "PENDING",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
    TRADED: "FILLED",
    PART_TRADED: "PARTIAL",
    EXPIRED: "CANCELLED",
  };
  return asList(raw).map((row) => ({
    id: String(row.orderId || row.dhanOrderId || `dhan-${row.securityId}`),
    symbol: row.tradingSymbol || String(row.securityId || ""),
    side: String(row.transactionType || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    qty: Number(row.quantity || 0),
    filledQty: Number(row.filledQty || 0),
    price: Number(row.price || row.tradedPrice || 0),
    product: row.productType || "MIS",
    type: row.orderType || "MARKET",
    status: statusMap[row.orderStatus] || row.orderStatus || "PENDING",
    strategy: "",
    brokerId: "dhan",
    brokerName: "Dhan",
    securityId: String(row.securityId || ""),
    live: true,
    sim: false,
    reason: row.omsErrorDescription || row.rejectedReason || "",
    createdAt: row.createTime || row.updateTime || new Date().toISOString(),
  }));
}

function mapDhanPositions(raw) {
  const list = asList(raw);
  return list
    .filter((row) => row.positionType !== "CLOSED" && Number(row.netQty) !== 0)
    .map((row) => {
      const qty = Math.abs(Number(row.netQty) || 0);
      const type = row.positionType === "SHORT" || Number(row.netQty) < 0 ? "SELL" : "BUY";
      const avg = Number(row.costPrice || (type === "BUY" ? row.buyAvg : row.sellAvg) || 0);
      const pnl = Number(row.unrealizedProfit || 0);
      const dir = type === "BUY" ? 1 : -1;
      const implied = qty ? avg + pnl / (qty * dir) : avg;
      return {
        id: `dhan-pos-${row.securityId}-${row.productType || "MIS"}`,
        symbol: row.tradingSymbol || String(row.securityId),
        type,
        qty,
        avg: Number(avg.toFixed(2)),
        ltp: Number((Number.isFinite(implied) ? implied : avg).toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        product: row.productType || "MIS",
        strategy: "",
        securityId: String(row.securityId || ""),
        brokerId: "dhan",
        live: true,
        sim: false,
      };
    });
}

function mapDhanHoldings(raw) {
  const list = asList(raw);
  return list
    .filter((row) => Number(row.availableQty || row.totalQty) > 0)
    .map((row) => ({
      id: `dhan-hold-${row.securityId}`,
      symbol: row.tradingSymbol || String(row.securityId),
      type: "BUY",
      qty: Number(row.availableQty || row.totalQty),
      avg: Number(Number(row.avgCostPrice || 0).toFixed(2)),
      ltp: Number(Number(row.avgCostPrice || 0).toFixed(2)),
      pnl: 0,
      brokerId: "dhan",
      live: true,
      sim: false,
    }));
}

function handleDhanPollError(area, error) {
  if (isDhanRateLimitError(error)) {
    const wait = Math.min(30_000, error.retryAfterMs || 4000);
    quoteBackoffUntil = Math.max(quoteBackoffUntil, Date.now() + wait);
    setDhanFeed({
      error: `Dhan 429 rate limit on ${area}. Backing off ${Math.round(wait / 1000)}s — token is still valid, not renewing.`,
    });
    return;
  }
  if (isDhanAuthExpiredError(error)) {
    setDhanFeed({ error: `Dhan access token expired (${area}). Auto-renewing…` });
    void keepDhanTokenFresh("auth");
    return;
  }
  setDhanFeed({ error: error.message || `Dhan ${area} request failed` });
}

async function pullAccount() {
  if (!accessToken) return;
  if (Date.now() < quoteBackoffUntil) return;
  try {
    const [positionsRaw, holdingsRaw, ordersRaw] = await Promise.all([
      dhanGet("/positions", accessToken, clientId).catch(() => []),
      dhanGet("/holdings", accessToken, clientId).catch(() => []),
      dhanGet("/orders", accessToken, clientId).catch(() => []),
    ]);
    const positions = mapDhanPositions(positionsRaw);
    const holdings = mapDhanHoldings(holdingsRaw).filter(
      (hold) => !positions.some((pos) => pos.symbol === hold.symbol),
    );
    replaceDhanBook([...positions, ...holdings]);
    replaceDhanOrders(mapDhanOrders(ordersRaw));
    setDhanFeed({ positionCount: positions.length, holdingCount: holdings.length });
  } catch (error) {
    handleDhanPollError("positions", error);
  }
}

async function pullNiftyCandles() {
  if (!accessToken) return;
  if (Date.now() < quoteBackoffUntil) return;
  try {
    const from = kolkataStamp(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), "09:15:00");
    const to = kolkataStamp(new Date());
    const payload = await dhanPost("/charts/intraday", accessToken, clientId, {
      securityId: "13",
      exchangeSegment: "IDX_I",
      instrument: "INDEX",
      interval: "1",
      oi: false,
      fromDate: from,
      toDate: to,
    });
    const candles = mapChartCandles(payload);
    if (candles.length) setLiveCandles(candles);
  } catch {
    /* quotes still drive the last bar */
  }
}

async function pullQuotes() {
  if (!accessToken || !clientId) return;
  if (Date.now() < quoteBackoffUntil) return;
  if (socket?.readyState === 1 && lastTickAt && Date.now() - lastTickAt < 5000) return;
  try {
    let payload = null;
    try {
      payload = await dhanPost("/marketfeed/quote", accessToken, clientId, quoteBody(usedFallback));
    } catch (error) {
      if (isDhanRateLimitError(error) || isDhanAuthExpiredError(error)) throw error;
      payload = null;
    }
    let quotes = payload ? flattenQuotes(payload) : [];
    if (!quotes.length) {
      try {
        payload = await dhanPost("/marketfeed/ohlc", accessToken, clientId, quoteBody(usedFallback));
        quotes = flattenQuotes(payload);
      } catch (error) {
        if (isDhanRateLimitError(error) || isDhanAuthExpiredError(error)) throw error;
      }
    }
    if (!quotes.length && !usedFallback) {
      usedFallback = true;
      try {
        payload = await dhanPost("/marketfeed/quote", accessToken, clientId, quoteBody(true));
        quotes = payload ? flattenQuotes(payload) : [];
      } catch (error) {
        if (isDhanRateLimitError(error) || isDhanAuthExpiredError(error)) throw error;
      }
    }
    if (!quotes.length) {
      payload = await dhanPost("/marketfeed/ltp", accessToken, clientId, quoteBody(usedFallback));
      quotes = flattenQuotes(payload);
    }
    if (payload?.status && payload.status !== "success" && !quotes.length) {
      throw new Error(payload.errorMessage || payload.message || "Dhan quote status was not success");
    }
    if (quotes.length) {
      lastTickAt = Date.now();
      applyLiveQuotes(quotes);
      setDhanFeed({
        live: true,
        source: socket?.readyState === 1 ? "websocket" : "rest",
        lastTickAt,
        error: null,
        quoteCount: quotes.length,
      });
    } else {
      setDhanFeed({
        live: Boolean(accessToken),
        error: "Dhan returned no quotes for mapped instruments.",
      });
    }
  } catch (error) {
    handleDhanPollError("quotes", error);
  }
}

function stopSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
}

function parseFeedPackets(buffer) {
  const quotes = [];
  const instruments = liveInstruments();
  let offset = 0;
  while (offset + 16 <= buffer.length) {
    const code = buffer.readUInt8(offset);
    const length = buffer.readUInt16LE(offset + 1);
    const securityId = buffer.readInt32LE(offset + 4);
    const instrument = instruments.find((row) => row.securityId === securityId);
    const packetLen = Math.max(length >= 16 ? length : length + 8, 16);
    if (instrument && (code === 2 || code === 4 || code === 8)) {
      const ltp = buffer.readFloatLE(offset + 8);
      if (Number.isFinite(ltp) && ltp > 0) {
        const quote = {
          symbol: instrument.symbol,
          parent: instrument.parent || instrument.symbol,
          kind: instrument.kind,
          ltp,
        };
        if (code === 4 && offset + 50 <= buffer.length) {
          const avg = buffer.readFloatLE(offset + 18);
          const open = buffer.readFloatLE(offset + 34);
          const close = buffer.readFloatLE(offset + 38);
          const high = buffer.readFloatLE(offset + 42);
          const low = buffer.readFloatLE(offset + 46);
          if (avg > 0) quote.vwap = avg;
          if (open > 0) quote.open = open;
          if (close > 0) quote.close = close;
          if (high > 0) quote.high = high;
          if (low > 0) quote.low = low;
        }
        quotes.push(quote);
      }
    } else if (instrument && code === 6) {
      const prevClose = buffer.readFloatLE(offset + 8);
      if (Number.isFinite(prevClose) && prevClose > 0) {
        quotes.push({
          symbol: instrument.symbol,
          parent: instrument.parent || instrument.symbol,
          kind: instrument.kind,
          prevClose,
        });
      }
    }
    offset += packetLen;
  }
  return quotes;
}

function startSocket() {
  stopSocket();
  if (!accessToken || !clientId) return;
  const url = `${DHAN_FEED_WS}?version=2&token=${encodeURIComponent(accessToken)}&clientId=${encodeURIComponent(clientId)}&authType=2`;
  try {
    socket = new WebSocket(url);
  } catch (error) {
    setDhanFeed({ error: `Dhan websocket failed: ${error.message}` });
    return;
  }

  socket.on("open", () => {
    const list = liveInstruments().map((row) => ({
      ExchangeSegment: usedFallback && row.fallbackSegment ? row.fallbackSegment : row.segment,
      SecurityId: String(row.securityId),
    }));
    socket.send(
      JSON.stringify({
        RequestCode: 17,
        InstrumentCount: list.length,
        InstrumentList: list,
      }),
    );
    setDhanFeed({ live: true, source: "websocket", error: null });
  });

  socket.on("message", (data) => {
    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const quotes = parseFeedPackets(buffer);
      if (quotes.length) {
        lastTickAt = Date.now();
        applyLiveQuotes(quotes);
        setDhanFeed({
          live: true,
          source: "websocket",
          lastTickAt,
          error: null,
          quoteCount: quotes.length,
        });
      }
    } catch {
      /* ignore a bad packet */
    }
  });

  socket.on("close", () => {
    socket = null;
    if (!accessToken) return;
    setDhanFeed({ source: "rest" });
    reconnectTimer = setTimeout(startSocket, 4000);
  });

  socket.on("error", () => {
    setDhanFeed({ source: "rest" });
  });
}

async function loadExpiryList(und) {
  await resolveFrontFutures().catch(() => []);
  const fromScrip = scripExpiries(und.id);
  if (!accessToken) return fromScrip.length ? fromScrip : upcomingExpiries(und.id);
  try {
    const list = await dhanPost("/optionchain/expirylist", accessToken, clientId, {
      UnderlyingScrip: und.scrip,
      UnderlyingSeg: und.segment,
    });
    const dates = dropExpired(Array.isArray(list?.data) ? list.data : []);
    const merged = [...new Set([...dates, ...fromScrip].map(normalizeExpiry).filter(Boolean))].sort();
    if (merged.length) return merged;
  } catch {
    /* fall through */
  }
  return fromScrip.length ? fromScrip : upcomingExpiries(und.id);
}

function paintDesk({ symbol, expiry, expiries, rows, spot, source }) {
  const desk = getOptionMeta();
  const und = getUnderlying(symbol || desk.symbol);
  const chosen = expiry || desk.expiry;
  const nextSpot = Number(spot) || getChainSpot(und.id);
  const liveOnly = Boolean(accessToken);
  const liveRows = rows !== undefined ? rows : liveOnly ? currentOptionRows() : currentOptionRows();
  const next = buildScripChain({
    symbol: und.id,
    expiry: chosen,
    spot: nextSpot,
    step: und.step,
    liveRows,
    liveOnly,
  });
  setOptionDesk({ symbol: und.id, expiry: chosen, expiries, rows: next, spot: nextSpot, source: liveOnly ? source || "dhan" : source });
  return next;
}

async function refreshOptionChain() {
  if (!accessToken) {
    applySyntheticOptionChain();
    paintDesk({
      symbol: getOptionMeta().symbol,
      expiry: getOptionMeta().expiry,
      source: "demo",
    });
    return;
  }
  const desk = getOptionMeta();
  const und = getUnderlying(desk.symbol);
  let expiries = dropExpired(desk.expiries || []);
  if (!expiries.length) expiries = await loadExpiryList(und);
  let expiry = normalizeExpiry(desk.expiry);
  if (!expiry || !expiries.includes(expiry)) expiry = expiries[0];
  const payload = await dhanPost("/optionchain", accessToken, clientId, {
    UnderlyingScrip: und.scrip,
    UnderlyingSeg: und.segment,
    Expiry: expiry,
  });
  const parsed = parseDhanChain(payload, getChainSpot(und.id), und.step);
  if (!parsed.rows.length) {
    setDhanFeed({ error: `No option strikes for ${und.id} ${expiry}.` });
    paintDesk({ symbol: und.id, expiry, expiries, rows: [], source: "dhan" });
    return;
  }
  paintDesk({
    symbol: und.id,
    expiry,
    expiries,
    rows: parsed.rows,
    spot: parsed.spot || getChainSpot(und.id),
    source: "dhan",
  });
}

export async function selectOptionDesk({ symbol, expiry }) {
  await resolveFrontFutures().catch(() => []);
  const und = getUnderlying(symbol);
  const expiries = await loadExpiryList(und);
  const wanted = normalizeExpiry(expiry);
  const chosen = wanted && expiries.includes(wanted) ? wanted : expiries[0];
  if (!accessToken) {
    applySyntheticOptionChain(und.id, chosen);
    paintDesk({ symbol: und.id, expiry: chosen, expiries, source: "demo" });
    return getOptionMeta();
  }
  paintDesk({ symbol: und.id, expiry: chosen, expiries, rows: [], source: "dhan" });
  try {
    await refreshOptionChain();
  } catch (error) {
    paintDesk({ symbol: und.id, expiry: chosen, expiries, rows: [], source: "dhan" });
    handleDhanPollError("option chain", error);
  }
  return getOptionMeta();
}

function startLiveLoop() {
  stopLiveLoop(false);
  void (async () => {
    try {
      futureInstruments = await resolveFrontFutures();
    } catch {
      futureInstruments = [];
    }
    startSocket();
    await sleep(400);
    void pullQuotes();
    await sleep(400);
    void selectOptionDesk({ symbol: getOptionMeta().symbol }).catch(() => undefined);
  })();
  setTimeout(() => {
    void pullAccount();
  }, 800);
  setTimeout(() => {
    void pullNiftyCandles();
  }, 1400);
  pollTimer = setInterval(() => {
    void pullQuotes();
  }, 2500);
  accountTimer = setInterval(() => {
    void pullAccount();
  }, 20_000);
  chainTimer = setInterval(() => {
    if (chainBusy || Date.now() < quoteBackoffUntil) return;
    chainBusy = true;
    void refreshOptionChain()
      .catch((error) => {
        handleDhanPollError("option chain", error);
      })
      .finally(() => {
        chainBusy = false;
      });
  }, 6000);
  scheduleTokenKeepAlive();
}

function stopLiveLoop(clearCreds) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (accountTimer) {
    clearInterval(accountTimer);
    accountTimer = null;
  }
  if (chainTimer) {
    clearInterval(chainTimer);
    chainTimer = null;
  }
  if (tokenTimer) {
    clearTimeout(tokenTimer);
    tokenTimer = null;
  }
  stopSocket();
  if (clearCreds) {
    accessToken = "";
    clientId = "";
    usedFallback = false;
  }
}

export function isDhanLive() {
  return Boolean(accessToken);
}

export function getDhanCredentials() {
  return { clientId, tokenHint: tokenHint(accessToken) };
}

const CHART_UNDERLYINGS = {
  NIFTY: { securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX" },
  "NIFTY 50": { securityId: "13", exchangeSegment: "IDX_I", instrument: "INDEX" },
  BANKNIFTY: { securityId: "25", exchangeSegment: "IDX_I", instrument: "INDEX" },
  "BANK NIFTY": { securityId: "25", exchangeSegment: "IDX_I", instrument: "INDEX" },
  FINNIFTY: { securityId: "27", exchangeSegment: "IDX_I", instrument: "INDEX" },
  SENSEX: { securityId: "51", exchangeSegment: "IDX_I", instrument: "INDEX" },
};

function chartInstrument(symbol) {
  const key = String(symbol || "NIFTY")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  return CHART_UNDERLYINGS[key] || CHART_UNDERLYINGS[key.split(" ")[0]] || CHART_UNDERLYINGS.NIFTY;
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function intradayInterval(timeframe) {
  const tf = String(timeframe || "");
  if (tf === "1m") return "1";
  if (tf === "5m") return "5";
  if (tf === "15m") return "15";
  if (tf === "1H" || tf === "1h") return "60";
  return null;
}

export async function fetchDhanHistory({ symbol, from, to, timeframe } = {}) {
  if (!accessToken) return [];
  const inst = chartInstrument(symbol);
  const fromDate = dateOnly(from);
  const toDate = dateOnly(to);
  if (!fromDate || !toDate) return [];
  const interval = intradayInterval(timeframe);
  const days = Math.max(1, Math.round((Date.parse(`${toDate}T15:30:00+05:30`) - Date.parse(`${fromDate}T09:15:00+05:30`)) / 86_400_000));

  const historical = async () => {
    const payload = await dhanPost("/charts/historical", accessToken, clientId, {
      securityId: inst.securityId,
      exchangeSegment: inst.exchangeSegment,
      instrument: inst.instrument,
      expiryCode: 0,
      oi: false,
      fromDate,
      toDate,
    });
    return mapChartCandles(payload);
  };

  const tryIntraday = days <= 45 && interval;
  if (tryIntraday) {
    try {
      const payload = await dhanPost("/charts/intraday", accessToken, clientId, {
        securityId: inst.securityId,
        exchangeSegment: inst.exchangeSegment,
        instrument: inst.instrument,
        interval,
        oi: false,
        fromDate: `${fromDate} 09:15:00`,
        toDate: `${toDate} 15:30:00`,
      });
      const candles = mapChartCandles(payload);
      if (candles.length >= 40) return candles;
    } catch {
      /* daily history is the reliable 1-year path */
    }
  }

  try {
    return await historical();
  } catch {
    return [];
  }
}

function fnoSegment(symbol) {
  return String(symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO";
}

function productType(product) {
  const raw = String(product || "MIS").toUpperCase();
  if (raw === "NRML" || raw === "MARGIN") return "MARGIN";
  if (raw === "CNC") return "CNC";
  return "INTRADAY";
}

function securityIdFromOpenChain(payload = {}) {
  const parsed = parseOptionContract(payload.symbol);
  const strike = Number(payload.strike || parsed?.strike || 0);
  const option = String(payload.option || parsed?.option || "").toUpperCase();
  const opt = option === "PUT" || option === "P" ? "PE" : option === "CALL" || option === "C" ? "CE" : option;
  if (!strike || (opt !== "CE" && opt !== "PE")) return "";
  const row = currentOptionRows().find((item) => Number(item.strike) === strike);
  if (!row) return "";
  return String((opt === "PE" ? row.putId : row.callId) || "");
}

export async function placeDhanOrder(payload = {}) {
  if (!accessToken || !clientId) {
    const error = new Error("Dhan live is off. Open Brokers and paste Client ID + Access Token.");
    error.status = 400;
    throw error;
  }
  const desk = getOptionMeta();
  let securityId = securityIdFromOpenChain(payload);
  if (!securityId || securityId === "0") {
    securityId = await resolveTradableSecurityId({
      symbol: payload.symbol,
      expiry: payload.expiry || desk.expiry,
      strike: payload.strike,
      option: payload.option,
      kind: payload.kind,
    });
  }
  if (!securityId || securityId === "0") {
    await reloadScripMaster();
    securityId = await resolveTradableSecurityId({
      symbol: payload.symbol,
      expiry: payload.expiry || desk.expiry,
      strike: payload.strike,
      option: payload.option,
      kind: payload.kind,
    });
  }
  if (!securityId || securityId === "0") {
    securityId = String(payload.securityId || "").trim();
  }
  if (!securityId || securityId === "0") {
    const label = payload.symbol || `${desk.symbol} ${payload.strike || ""} ${payload.option || ""}`.trim();
    const error = new Error(
      `No live Dhan contract for ${label} (${normalizeExpiry(payload.expiry || desk.expiry) || "no expiry"}). Pick the contract on Chain, then BUY/SELL again.`,
    );
    error.status = 400;
    throw error;
  }
  const qty = Math.max(0, Math.round(Number(payload.qty) || 0));
  if (!qty) {
    const error = new Error("Quantity must be at least 1 lot.");
    error.status = 400;
    throw error;
  }
  const orderType = String(payload.type || "MARKET").toUpperCase() === "LIMIT" ? "LIMIT" : "MARKET";
  const ip = await fetchDhanIp();
  const useAmo = payload.afterMarketOrder === true || payload.amo === true || !nseSessionOpen();
  let body = {
    dhanClientId: String(clientId),
    correlationId: `t2s${Date.now()}`.slice(0, 30),
    transactionType: payload.side === "SELL" ? "SELL" : "BUY",
    exchangeSegment: payload.exchangeSegment || fnoSegment(payload.symbol),
    productType: productType(payload.product),
    orderType,
    validity: "DAY",
    securityId: String(securityId),
    quantity: qty,
    disclosedQuantity: 0,
    price: orderType === "LIMIT" ? Number(payload.price || 0) : 0,
    triggerPrice: 0,
    afterMarketOrder: useAmo,
  };
  if (useAmo) body.amoTime = "OPEN";

  const submit = (orderBody) => {
    console.log(
      `Dhan ${orderBody.afterMarketOrder ? "AMO " : ""}${orderBody.transactionType} ${orderBody.exchangeSegment} ${orderBody.productType} ${orderBody.orderType} qty ${orderBody.quantity} security ${orderBody.securityId}${orderBody.amoTime ? ` ${orderBody.amoTime}` : ""}`,
    );
    return dhanPost("/orders", accessToken, clientId, orderBody);
  };

  let result;
  try {
    result = await submit(body);
  } catch (error) {
    if (!body.afterMarketOrder && isClosedMarketError(error)) {
      body = withAmo(body);
      try {
        result = await submit(body);
      } catch (retryError) {
        retryError.message = formatPlaceError(retryError, ip, body);
        throw retryError;
      }
    } else {
      error.message = formatPlaceError(error, ip, body);
      throw error;
    }
  }
  const data = result?.data && typeof result.data === "object" ? result.data : result || {};
  const orderId = String(data.orderId || data.order_id || result?.orderId || "");
  const status = String(data.orderStatus || data.order_status || result?.orderStatus || "");
  if (!orderId || status.toUpperCase() === "REJECTED") {
    const error = new Error(dhanErrorText(result, "Dhan did not place this order."));
    error.status = 400;
    error.body = result;
    error.message = formatPlaceError(error, ip, body);
    throw error;
  }
  try {
    await pullAccount();
  } catch {
    /* order is still at Dhan */
  }
  return {
    orderId,
    status: status || "TRANSIT",
    securityId: String(securityId),
    filledQty: Number(data.filledQty || result?.filledQty || 0),
    afterMarketOrder: Boolean(body.afterMarketOrder),
    raw: result,
  };
}

export async function cancelDhanOrder(orderId) {
  if (!accessToken) {
    const error = new Error("Dhan live is off");
    error.status = 400;
    throw error;
  }
  const result = await dhanDelete(`/orders/${orderId}`, accessToken, clientId);
  try {
    await pullAccount();
  } catch {
    /* ignore */
  }
  return result;
}

export async function validateDhan(token, id) {
  const profile = await dhanGet("/profile", token, id);
  let funds = null;
  try {
    funds = await dhanGet("/fundlimit", token, id);
  } catch {
    funds = null;
  }
  return { profile, funds };
}

export async function startDhanLive({ accessToken: token, clientId: id }) {
  const cleanToken = String(token || "").trim();
  const cleanId = String(id || "").trim();
  if (!cleanToken) {
    const error = new Error("Dhan Access Token is required. Copy it from web.dhan.co → My Profile → Access DhanHQ APIs.");
    error.status = 400;
    throw error;
  }
  if (!cleanId) {
    const error = new Error("Dhan Client ID is required.");
    error.status = 400;
    throw error;
  }

  const { profile, funds } = await validateDhan(cleanToken, cleanId);
  if (profile?.dataPlan && String(profile.dataPlan).toLowerCase() === "deactive") {
    const error = new Error("Dhan Data API plan is inactive. Enable Live Market Data on web.dhan.co, then paste a new Access Token.");
    error.status = 400;
    throw error;
  }
  accessToken = cleanToken;
  clientId = String(profile.dhanClientId || profile.data?.dhanClientId || cleanId).trim();
  usedFallback = false;
  console.log(`Dhan live client ${clientId}`);

  const fundsNum = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const avail =
    fundsNum(funds?.availabelBalance) ||
    fundsNum(funds?.availableBalance) ||
    fundsNum(funds?.availablBalance) ||
    fundsNum(funds?.sodLimit);
  const used = fundsNum(funds?.utilizedAmount) || fundsNum(funds?.usedMargin);
  markDhanLive({
    clientId,
    funds: avail,
    marginUsed: used,
    keyHint: tokenHint(accessToken),
    displayName: profile.dhanClientName ? `Dhan · ${profile.dhanClientName}` : "Dhan",
  });
  persistPastedToken({
    clientId,
    accessToken,
    expiryTime: resolveTokenExpiry({
      accessToken,
      expiryTime: loadDhanSession().expiryTime,
      tokenValidity: profile.tokenValidity,
      fallbackHours: 24,
    }),
    tokenValidity: profile.tokenValidity,
  });
  setDhanFeed({
    live: true,
    source: "rest",
    lastTickAt: null,
    error: null,
    tokenHint: tokenHint(accessToken),
    profileName: profile.dhanClientName || null,
    clientId,
    quoteCount: 0,
    positionCount: 0,
    holdingCount: 0,
    ipCheck: null,
    ...dhanTokenStatus(),
  });
  clearSimulatedDesk();
  startLiveLoop();
  await fetchDhanIp();
  return { profile, funds, tokenHint: tokenHint(accessToken), ...dhanTokenStatus() };
}

export function stopDhanLive() {
  markDhanAutoStart(false);
  stopLiveLoop(true);
  restoreSimulatedDesk();
  setDhanFeed({
    live: false,
    source: "idle",
    lastTickAt: null,
    error: null,
    tokenHint: null,
    profileName: null,
    quoteCount: 0,
    positionCount: 0,
    holdingCount: 0,
    ipCheck: null,
    autoRenew: false,
    autoMode: "off",
    tokenExpiry: null,
    nextRenewAt: null,
    autoStart: false,
  });
}

export async function rotateDhanAccessToken({ clientId, pin, totpSecret, reason = "api" } = {}) {
  const creds = requirePinTotp({ clientId, pin, totpSecret });
  const generated = await generateDhanAccessToken(creds);
  lastKeepAliveAt = Date.now();
  const session = loadDhanSession();
  const userAsked = reason === "save" || reason === "api" || reason === "auth";
  if (session.autoStart === false && !userAsked) {
    scheduleTokenKeepAlive();
    console.log(
      `Dhan access token generated automatically (${reason}) · live feed left off · expires ${generated.expiryTime}`,
    );
    return { rotated: true, live: false, expiryTime: generated.expiryTime, ...dhanTokenStatus() };
  }
  const live = await startDhanLive({ accessToken: generated.accessToken, clientId: generated.clientId });
  console.log(`Dhan LIVE token changed with PIN + TOTP (${reason}) · expires ${generated.expiryTime}`);
  return { ...live, rotated: true, expiryTime: generated.expiryTime };
}

export async function enableDhanAuto({ clientId, pin, totpSecret }) {
  return rotateDhanAccessToken({ clientId, pin, totpSecret, reason: "save" });
}

function tokenMsRemaining() {
  const session = loadDhanSession();
  const expiry = Date.parse(
    resolveTokenExpiry({
      accessToken: session.accessToken || accessToken,
      expiryTime: session.expiryTime,
    }) || "",
  );
  return Number.isFinite(expiry) ? expiry - Date.now() : NaN;
}

function scheduleTokenKeepAlive() {
  if (tokenTimer) {
    clearTimeout(tokenTimer);
    tokenTimer = null;
  }
  const session = loadDhanSession();
  if (!canAutoGenerate() && !session.accessToken) return;
  let wait = msUntilTokenKeepAlive(session);
  if (Date.now() < credentialsBlockedUntil) {
    wait = Math.max(wait, credentialsBlockedUntil - Date.now());
  }
  tokenTimer = setTimeout(() => {
    void keepDhanTokenFresh("schedule");
  }, wait);
  const fireAt = new Date(Date.now() + wait).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  console.log(`Dhan token auto-renew at ${fireAt} · daily reset 8:00 AM IST`);
}

function blockBadTotp(error) {
  credentialsBlockedUntil = Date.now() + 6 * 60 * 60 * 1000;
  const when = new Date(credentialsBlockedUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const message =
    error?.message ||
    "Invalid TOTP: PIN or Setup TOTP secret is wrong, or VPS clock is off. Fix /opt/t2s/.env, then systemctl restart t2s.";
  console.log(`Dhan ${message} · not retrying until ${when}`);
  setDhanFeed({
    live: false,
    source: "idle",
    error: message,
    ...dhanTokenStatus(),
  });
  scheduleTokenKeepAlive();
}

async function keepDhanTokenFresh(reason = "schedule") {
  if (keepAlivePromise) return keepAlivePromise;
  if (reason !== "auth" && reason !== "api" && Date.now() - lastKeepAliveAt < 45_000) {
    scheduleTokenKeepAlive();
    return;
  }

  keepAlivePromise = (async () => {
    try {
      const session = loadDhanSession();
      const remainingNow = tokenMsRemaining();
      const tokenStillGood = Number.isFinite(remainingNow) && remainingNow > 20 * 60 * 1000;
      if ((reason === "retry" || reason === "boot") && tokenStillGood && session.accessToken && session.clientId) {
        await startDhanLive({ accessToken: session.accessToken, clientId: session.clientId });
        lastKeepAliveAt = Date.now();
        console.log(`Dhan LIVE restarted after ${reason} without minting a new token`);
        return;
      }
      if (reason === "schedule" && tokenStillGood && canAutoGenerate() && !needsFreshAccessToken(session)) {
        scheduleTokenKeepAlive();
        return;
      }
      await rotateDhanAccessToken({ reason });
    } catch (error) {
      if (isDhanInvalidTotpError(error)) {
        blockBadTotp(error);
        return;
      }
      if (isDhanRateLimitError(error)) {
        const wait = error.tooManyAttempts
          ? error.retryAfterMs || 30 * 60 * 1000
          : Math.min(5 * 60 * 1000, error.retryAfterMs || 30_000);
        console.log(`Dhan token keep-alive 429 · retry in ${wait}ms`);
        setDhanFeed({
          error: `Dhan 429 rate limit during token refresh. Retrying in ${Math.round(wait / 1000)}s — existing token was not discarded.`,
        });
        tokenTimer = setTimeout(() => {
          void keepDhanTokenFresh("retry");
        }, wait);
        return;
      }
      console.log(`Dhan token keep-alive failed: ${error.message || error}`);
      setDhanFeed({ error: `Access token refresh failed: ${error.message || error}` });
      tokenTimer = setTimeout(() => {
        void keepDhanTokenFresh("retry");
      }, 15 * 60 * 1000);
    }
  })().finally(() => {
    keepAlivePromise = null;
  });
  return keepAlivePromise;
}

async function startDhanWithRetry(token, id, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await startDhanLive({ accessToken: token, clientId: id });
      return true;
    } catch (error) {
      lastError = error;
      if (!isDhanRateLimitError(error) || attempt === attempts - 1) break;
      const wait = Math.min(20_000, error.retryAfterMs || 1500 * 2 ** attempt);
      console.log(`Saved Dhan token hit 429 · retry live start in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastError;
}

export async function bootDhanFromEnv() {
  const session = loadDhanSession();
  const token = String(process.env.DHAN_ACCESS_TOKEN || session.accessToken || "").trim();
  const id = String(process.env.DHAN_CLIENT_ID || session.clientId || "").trim();
  if (session.autoStart === false && !process.env.DHAN_ACCESS_TOKEN) {
    scheduleTokenKeepAlive();
    return false;
  }

  const creds = {
    clientId: id || session.clientId,
    pin: session.pin,
    totpSecret: session.totpSecret,
  };
  const sessionForFreshness = { ...session, accessToken: token, clientId: id };

  let totpRejected = false;

  if (canAutoGenerate() && needsFreshAccessToken(sessionForFreshness)) {
    try {
      await enableDhanAuto(creds);
      console.log("Dhan access token generated automatically (PIN + TOTP)");
      return true;
    } catch (error) {
      if (isDhanInvalidTotpError(error)) {
        totpRejected = true;
        blockBadTotp(error);
      } else if (isDhanRateLimitError(error)) {
        setDhanFeed({
          live: false,
          source: "idle",
          error: `Dhan 429 rate limit while generating token. ${error.message}`,
          ...dhanTokenStatus(),
        });
        tokenTimer = setTimeout(
          () => {
            void keepDhanTokenFresh("retry");
          },
          error.tooManyAttempts ? error.retryAfterMs || 30 * 60 * 1000 : Math.min(60_000, error.retryAfterMs || 30_000),
        );
        if (token && id) {
          try {
            await startDhanWithRetry(token, id);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      } else {
        console.log(`Auto token generate failed: ${error.message || error}`);
      }
    }
  } else if (canAutoGenerate()) {
    console.log("Dhan access token already generated after today's 08:00 IST reset — next auto-generate is tomorrow 08:00 IST");
  }

  if (token && id && !totpRejected) {
    try {
      await startDhanWithRetry(token, id);
      return true;
    } catch (error) {
      if (isDhanRateLimitError(error)) {
        setDhanFeed({
          live: false,
          source: "idle",
          error: "Dhan 429 rate limit while starting live feed. Token was kept; retry shortly or click Generate token.",
          ...dhanTokenStatus(),
        });
        tokenTimer = setTimeout(() => {
          void keepDhanTokenFresh("boot");
        }, Math.min(60_000, error.retryAfterMs || 15_000));
        return false;
      }
      console.log(`Saved Dhan token failed: ${error.message || error}`);
    }
  }
  if (canAutoGenerate() && !totpRejected) {
    try {
      await enableDhanAuto(creds);
      console.log("Dhan live feed started from PIN + TOTP");
      return true;
    } catch (error) {
      if (isDhanInvalidTotpError(error)) {
        blockBadTotp(error);
        return false;
      }
      const rate = isDhanRateLimitError(error);
      setDhanFeed({
        live: false,
        source: "idle",
        error: rate
          ? `Dhan 429 rate limit while generating token. ${error.message}`
          : `Auto token failed: ${error.message}`,
        ...dhanTokenStatus(),
      });
      scheduleTokenKeepAlive();
      if (rate) {
        tokenTimer = setTimeout(() => {
          void keepDhanTokenFresh("retry");
        }, 30_000);
      }
      return false;
    }
  }
  if (totpRejected) return false;
  if (process.env.DHAN_ACCESS_TOKEN) {
    setDhanFeed({
      live: false,
      source: "idle",
      error: "Env token failed. PIN + TOTP is required on the server to change the Dhan token.",
    });
  }
  scheduleTokenKeepAlive();
  return false;
}
