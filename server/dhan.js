import { Buffer } from "node:buffer";
import { WebSocket } from "ws";
import { markDhanLive } from "./brokers.js";
import { applyLiveQuotes, setDhanFeed } from "./market.js";

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
let socket = null;
let reconnectTimer = null;
let usedFallback = false;

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

function quoteBody(useFallback) {
  const body = {};
  for (const row of INSTRUMENTS) {
    const segment = useFallback && row.fallbackSegment ? row.fallbackSegment : row.segment;
    if (!body[segment]) body[segment] = [];
    if (!body[segment].includes(row.securityId)) body[segment].push(row.securityId);
  }
  return body;
}

function flattenQuotes(payload) {
  const quotes = [];
  const data = payload?.data || payload || {};
  for (const [segment, securities] of Object.entries(data)) {
    if (!securities || typeof securities !== "object") continue;
    for (const [id, quote] of Object.entries(securities)) {
      if (!quote || typeof quote !== "object") continue;
      const securityId = Number(id);
      const instrument =
        INSTRUMENTS.find(
          (row) =>
            row.securityId === securityId &&
            (row.segment === segment || row.fallbackSegment === segment),
        ) || INSTRUMENTS.find((row) => row.securityId === securityId);
      if (!instrument) continue;
      const ltp = Number(quote.last_price ?? quote.ltp ?? quote.lastPrice);
      if (!Number.isFinite(ltp) || ltp <= 0) continue;
      quotes.push({
        symbol: instrument.symbol,
        kind: instrument.kind,
        ltp,
        open: Number(quote.ohlc?.open ?? quote.open),
        high: Number(quote.ohlc?.high ?? quote.high),
        low: Number(quote.ohlc?.low ?? quote.low),
        close: Number(quote.ohlc?.close ?? quote.close),
        volume: Number(quote.volume ?? quote.vol),
      });
    }
  }
  return quotes;
}

async function pullQuotes() {
  if (!accessToken || !clientId) return;
  try {
    let payload = await dhanPost("/marketfeed/ohlc", accessToken, clientId, quoteBody(usedFallback));
    let quotes = flattenQuotes(payload);
    if (!quotes.length && !usedFallback) {
      usedFallback = true;
      payload = await dhanPost("/marketfeed/ohlc", accessToken, clientId, quoteBody(true));
      quotes = flattenQuotes(payload);
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
  let offset = 0;
  while (offset + 16 <= buffer.length) {
    const code = buffer.readUInt8(offset);
    const length = buffer.readUInt16LE(offset + 1);
    const securityId = buffer.readInt32LE(offset + 4);
    if (code === 2 || code === 4 || code === 8) {
      const ltp = buffer.readFloatLE(offset + 8);
      const instrument = INSTRUMENTS.find((row) => row.securityId === securityId);
      if (instrument && Number.isFinite(ltp) && ltp > 0) {
        quotes.push({ symbol: instrument.symbol, kind: instrument.kind, ltp });
      }
    }
    offset += Math.max(length >= 16 ? length : length + 8, 16);
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
    const list = INSTRUMENTS.map((row) => ({
      ExchangeSegment: usedFallback && row.fallbackSegment ? row.fallbackSegment : row.segment,
      SecurityId: String(row.securityId),
    }));
    socket.send(
      JSON.stringify({
        RequestCode: 15,
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

function startLiveLoop() {
  stopLiveLoop(false);
  void pullQuotes();
  pollTimer = setInterval(() => {
    void pullQuotes();
  }, 1200);
  startSocket();
}

function stopLiveLoop(clearCreds) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
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
