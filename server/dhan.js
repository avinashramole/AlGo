import { Buffer } from "node:buffer";
import { WebSocket } from "ws";
import { markDhanLive } from "./brokers.js";
import {
  applyLiveQuotes,
  applySyntheticOptionChain,
  currentOptionRows,
  getChainSpot,
  getOptionMeta,
  replaceDhanBook,
  replaceDhanOrders,
  setDhanFeed,
  setLiveCandles,
  setOptionDesk,
} from "./market.js";
import { buildScripChain, lookupFutureSecurityId, lookupOptionSecurityId, parseOptionContract, resolveFrontFutures, scripExpiries } from "./frontFutures.js";
import { dropExpired, getUnderlying, normalizeExpiry, parseDhanChain, upcomingExpiries } from "./optionChain.js";

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
let socket = null;
let reconnectTimer = null;
let usedFallback = false;
let futureInstruments = [];

function liveInstruments() {
  return INSTRUMENTS.concat(futureInstruments);
}

function tokenHint(token) {
  const clean = String(token || "").trim();
  if (clean.length < 8) return clean ? "••••" : null;
  return `••••${clean.slice(-4)}`;
}

function authHeaders(token, id) {
  const headers = {
    Accept: "application/json",
    "access-token": token,
  };
  if (id) headers["client-id"] = id;
  return headers;
}

async function dhanGet(path, token, id) {
  const res = await fetch(`${DHAN_API}${path}`, {
    headers: authHeaders(token, id),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message =
      json?.errorMessage ||
      json?.error?.errorMessage ||
      json?.message ||
      json?.remarks ||
      `Dhan API ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json;
}

async function dhanPost(path, token, id, body) {
  const res = await fetch(`${DHAN_API}${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(token, id),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message =
      json?.errorMessage ||
      json?.error?.errorMessage ||
      json?.message ||
      json?.remarks ||
      `Dhan API ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json;
}

async function dhanDelete(path, token, id) {
  const res = await fetch(`${DHAN_API}${path}`, {
    method: "DELETE",
    headers: authHeaders(token, id),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const message =
      json?.errorMessage ||
      json?.error?.errorMessage ||
      json?.message ||
      json?.remarks ||
      `Dhan API ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = json;
    throw error;
  }
  return json || { ok: true };
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
    }));
}

async function pullAccount() {
  if (!accessToken) return;
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
    setDhanFeed({ error: error.message || "Dhan positions request failed" });
  }
}

async function pullNiftyCandles() {
  if (!accessToken) return;
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
  try {
    let payload = await dhanPost("/marketfeed/quote", accessToken, clientId, quoteBody(usedFallback)).catch(() => null);
    let quotes = payload ? flattenQuotes(payload) : [];
    if (!quotes.length) {
      payload = await dhanPost("/marketfeed/ohlc", accessToken, clientId, quoteBody(usedFallback));
      quotes = flattenQuotes(payload);
    }
    if (!quotes.length && !usedFallback) {
      usedFallback = true;
      payload = await dhanPost("/marketfeed/quote", accessToken, clientId, quoteBody(true)).catch(() => null);
      quotes = payload ? flattenQuotes(payload) : [];
      if (!quotes.length) {
        payload = await dhanPost("/marketfeed/ohlc", accessToken, clientId, quoteBody(true));
        quotes = flattenQuotes(payload);
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
      applyLiveQuotes(quotes);
      setDhanFeed({
        live: true,
        source: socket?.readyState === 1 ? "websocket" : "rest",
        lastTickAt: Date.now(),
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
    setDhanFeed({
      live: Boolean(accessToken),
      error: error.message || "Dhan quote request failed",
    });
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
        applyLiveQuotes(quotes);
        setDhanFeed({
          live: true,
          source: "websocket",
          lastTickAt: Date.now(),
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
  const next = buildScripChain({
    symbol: und.id,
    expiry: chosen,
    spot: nextSpot,
    step: und.step,
    liveRows: rows || currentOptionRows(),
    wings: 12,
  });
  setOptionDesk({ symbol: und.id, expiry: chosen, expiries, rows: next, spot: nextSpot, source });
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
    applySyntheticOptionChain(und.id, expiry);
    paintDesk({ symbol: und.id, expiry, expiries, source: "demo" });
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
  applySyntheticOptionChain(und.id, chosen);
  paintDesk({ symbol: und.id, expiry: chosen, expiries, source: accessToken ? "demo" : "demo" });
  if (accessToken) {
    try {
      await refreshOptionChain();
    } catch (error) {
      applySyntheticOptionChain(und.id, chosen);
      paintDesk({ symbol: und.id, expiry: chosen, expiries, source: "demo" });
      setDhanFeed({ error: error.message || "Dhan option chain failed" });
    }
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
    void pullQuotes();
    startSocket();
    void selectOptionDesk({ symbol: getOptionMeta().symbol }).catch(() => undefined);
  })();
  void pullAccount();
  void pullNiftyCandles();
  pollTimer = setInterval(() => {
    void pullQuotes();
  }, 1200);
  accountTimer = setInterval(() => {
    void pullAccount();
  }, 20_000);
  chainTimer = setInterval(() => {
    void refreshOptionChain().catch((error) => {
      setDhanFeed({ error: error.message || "Dhan option chain failed" });
    });
  }, 4000);
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

function fnoSegment(symbol) {
  return String(symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO";
}

function productType(product) {
  const raw = String(product || "MIS").toUpperCase();
  if (raw === "NRML" || raw === "MARGIN") return "MARGIN";
  if (raw === "CNC") return "CNC";
  return "INTRADAY";
}

export async function placeDhanOrder(payload = {}) {
  if (!accessToken || !clientId) {
    const error = new Error("Dhan live is off. Open Brokers and paste Client ID + Access Token.");
    error.status = 400;
    throw error;
  }
  let securityId = String(payload.securityId || "").trim();
  const parsed = parseOptionContract(payload.symbol);
  const isFuture = payload.kind === "future" || /\bFUT\b/i.test(String(payload.symbol || ""));
  if (!securityId || securityId === "0") {
    if (isFuture || (!parsed && !payload.option && !payload.strike)) {
      securityId = String(
        await lookupFutureSecurityId({
          symbol: payload.symbol,
          expiry: payload.expiry,
        }),
      ).trim();
    }
  }
  if (!securityId || securityId === "0") {
    const desk = getOptionMeta();
    securityId = String(
      await lookupOptionSecurityId({
        symbol: payload.symbol || desk.symbol,
        expiry: payload.expiry || desk.expiry,
        strike: payload.strike || parsed?.strike,
        option: payload.option || parsed?.option,
      }),
    ).trim();
  }
  if (!securityId || securityId === "0") {
    const desk = getOptionMeta();
    const label = payload.symbol || `${desk.symbol} ${payload.strike || ""} ${payload.option || ""}`.trim();
    const error = new Error(
      `No Dhan contract ID for ${label} (${normalizeExpiry(payload.expiry || desk.expiry) || "no expiry"}). Open Chain, pick the live expiry, wait a few seconds, then BUY/SELL again.`,
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
  const result = await dhanPost("/orders", accessToken, clientId, {
    dhanClientId: clientId,
    correlationId: `t2s${Date.now()}`.slice(0, 30),
    transactionType: payload.side === "SELL" ? "SELL" : "BUY",
    exchangeSegment: payload.exchangeSegment || fnoSegment(payload.symbol),
    productType: productType(payload.product),
    orderType,
    validity: "DAY",
    securityId,
    quantity: qty,
    disclosedQuantity: 0,
    price: orderType === "LIMIT" ? Number(payload.price || 0) : 0,
    triggerPrice: 0,
    afterMarketOrder: false,
  });
  try {
    await pullAccount();
  } catch {
    /* order is still at Dhan */
  }
  const data = result?.data || result || {};
  return {
    orderId: String(data.orderId || data.order_id || result?.orderId || ""),
    status: data.orderStatus || data.order_status || result?.orderStatus || "TRANSIT",
    securityId,
    filledQty: Number(data.filledQty || result?.filledQty || 0),
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
  clientId = profile.dhanClientId || cleanId;
  usedFallback = false;

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
  });
  startLiveLoop();
  return { profile, funds, tokenHint: tokenHint(accessToken) };
}

export function stopDhanLive() {
  stopLiveLoop(true);
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
  });
}

export async function bootDhanFromEnv() {
  const token = process.env.DHAN_ACCESS_TOKEN || "";
  const id = process.env.DHAN_CLIENT_ID || "";
  if (!token || !id) return false;
  try {
    await startDhanLive({ accessToken: token, clientId: id });
    return true;
  } catch (error) {
    setDhanFeed({
      live: false,
      source: "idle",
      error: `Env token failed: ${error.message}`,
    });
    return false;
  }
}
