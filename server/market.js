import { getActiveBroker, publicBrokers } from "./brokers.js";
import {
  UNDERLYINGS,
  buildSyntheticChain,
  chainStats,
  getUnderlying,
  upcomingExpiries,
} from "./optionChain.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function generateCandles(count, startPrice, seed = 42) {
  const rand = seeded(seed);
  const candles = [];
  let price = startPrice;
  const now = Date.now();
  const step = 60_000;

  for (let i = count; i >= 0; i -= 1) {
    const drift = (rand() - 0.48) * 18;
    const open = price;
    const close = Math.max(100, open + drift);
    const high = Math.max(open, close) + rand() * 12;
    const low = Math.min(open, close) - rand() * 12;
    const volume = 800_000 + rand() * 2_400_000;
    candles.push({ time: now - i * step, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

const state = {
  indices: [
    { symbol: "NIFTY 50", name: "NIFTY", price: 24580.25, change: 125.4, changePct: 0.51, spark: [24420, 24455, 24410, 24480, 24510, 24490, 24540, 24580] },
    { symbol: "BANKNIFTY", name: "BANKNIFTY", price: 52140.8, change: 210.15, changePct: 0.4, spark: [51880, 51940, 51910, 52020, 52080, 52040, 52110, 52141] },
    { symbol: "FINNIFTY", name: "FINNIFTY", price: 24890.5, change: 98.2, changePct: 0.4, spark: [24740, 24780, 24755, 24810, 24840, 24820, 24870, 24891] },
    { symbol: "SENSEX", name: "SENSEX", price: 80642.3, change: 312.8, changePct: 0.39, spark: [80210, 80340, 80280, 80420, 80510, 80470, 80590, 80642] },
    { symbol: "INDIA VIX", name: "VIX", price: 13.24, change: -0.42, changePct: -3.07, spark: [13.9, 13.72, 13.8, 13.55, 13.48, 13.4, 13.3, 13.24] },
  ],
  ohlc: { open: 24462.1, high: 24612.8, low: 24418.35, close: 24580.25 },
  dnaScores: [
    { label: "Trend", value: 86 },
    { label: "Momentum", value: 78 },
    { label: "Buy Pressure", value: 91 },
    { label: "Volatility", value: 34 },
    { label: "OI Build", value: 72 },
    { label: "PCR", value: 64 },
  ],
  optionChain: buildSyntheticChain(24580.25, 50, 10),
  optionMeta: {
    symbol: "NIFTY",
    expiry: upcomingExpiries()[0] || "2026-08-20",
    expiries: upcomingExpiries(),
    spot: 24580.25,
    pcr: 0.86,
    maxPain: 24500,
    atmIv: 12.4,
    source: "demo",
    lastAt: null,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  },
  algos: [
    { id: "a1", name: "VWAP Depth", tag: "Intraday", status: "LIVE", pnl: 2840.5, winRate: 68, enabled: true, brokerId: "dhan" },
    { id: "a2", name: "Momentum Rider", tag: "Options", status: "LIVE", pnl: 1960.25, winRate: 61, enabled: true, brokerId: "dhan" },
    { id: "a3", name: "ORB Breakout", tag: "Index", status: "PAUSED", pnl: -412.0, winRate: 54, enabled: false, brokerId: "dhan" },
  ],
  positions: [
    { id: "p1", symbol: "NIFTY 24500 CE", type: "BUY", qty: 75, avg: 128.4, ltp: 142.75, pnl: 1076.25, brokerId: "dhan" },
    { id: "p2", symbol: "BANKNIFTY 52100 PE", type: "SELL", qty: 30, avg: 186.2, ltp: 164.5, pnl: 651.0, brokerId: "dhan" },
    { id: "p3", symbol: "NIFTY 24600 CE", type: "BUY", qty: 50, avg: 74.1, ltp: 88.2, pnl: 705.0, brokerId: "dhan" },
    { id: "p4", symbol: "FINNIFTY 24900 CE", type: "BUY", qty: 65, avg: 96.8, ltp: 118.4, pnl: 1404.0, brokerId: "dhan" },
    { id: "p5", symbol: "SENSEX 80600 CE", type: "BUY", qty: 20, avg: 142.0, ltp: 168.35, pnl: 527.0, brokerId: "dhan" },
    { id: "p6", symbol: "NIFTY 24400 PE", type: "SELL", qty: 50, avg: 52.6, ltp: 38.15, pnl: 722.5, brokerId: "dhan" },
  ],
  signals: [
    { id: "s1", action: "BUY", symbol: "NIFTY 24500 CE", strategy: "VWAP Depth", time: "09:28:14", confidence: 91 },
    { id: "s2", action: "SELL", symbol: "BANKNIFTY 52200 CE", strategy: "Mean Revert", time: "09:21:02", confidence: 77 },
    { id: "s3", action: "BUY", symbol: "FINNIFTY 24900 CE", strategy: "Momentum Rider", time: "09:16:41", confidence: 84 },
    { id: "s4", action: "BUY", symbol: "NIFTY 24600 CE", strategy: "ORB Breakout", time: "09:12:08", confidence: 72 },
    { id: "s5", action: "SELL", symbol: "INDIA VIX FUT", strategy: "Vol Crush", time: "09:08:55", confidence: 69 },
  ],
  watchlist: [
    { symbol: "RELIANCE", ltp: 2984.2, chg: 1.12 },
    { symbol: "HDFCBANK", ltp: 1672.4, chg: 0.64 },
    { symbol: "ICICIBANK", ltp: 1238.9, chg: 0.41 },
    { symbol: "INFY", ltp: 1864.15, chg: -0.28 },
    { symbol: "TCS", ltp: 4128.6, chg: -0.14 },
    { symbol: "SBIN", ltp: 812.35, chg: 1.04 },
    { symbol: "BHARTIARTL", ltp: 1542.8, chg: 0.72 },
    { symbol: "ITC", ltp: 492.15, chg: -0.36 },
  ],
  fiiDii: {
    fii: { buy: 12480, sell: 10840, net: 1640 },
    dii: { buy: 9860, sell: 8420, net: 1440 },
  },
  marketWatch: [
    { symbol: "NIFTY 50", ltp: 24580.25, chg: 0.51, volume: "182.4 Cr" },
    { symbol: "BANKNIFTY", ltp: 52140.8, chg: 0.4, volume: "96.1 Cr" },
    { symbol: "RELIANCE", ltp: 2984.2, chg: 1.12, volume: "48.2 L" },
    { symbol: "HDFCBANK", ltp: 1672.4, chg: 0.64, volume: "62.8 L" },
    { symbol: "ICICIBANK", ltp: 1238.9, chg: 0.41, volume: "54.1 L" },
    { symbol: "INFY", ltp: 1864.15, chg: -0.28, volume: "31.6 L" },
    { symbol: "TCS", ltp: 4128.6, chg: -0.14, volume: "18.4 L" },
    { symbol: "SBIN", ltp: 812.35, chg: 1.04, volume: "71.2 L" },
    { symbol: "LT", ltp: 3612.4, chg: 0.88, volume: "12.9 L" },
    { symbol: "AXISBANK", ltp: 1174.5, chg: 0.22, volume: "28.7 L" },
  ],
  featuredSignal: {
    action: "BUY",
    symbol: "NIFTY 24,500 CE",
    strategy: "VWAP Depth",
    expiry: "28 Aug",
    confidence: 91,
    risk: "LOW",
    metrics: [
      { label: "VWAP", value: 92 },
      { label: "DEPTH", value: 99 },
      { label: "OI", value: 84 },
      { label: "VOLUME", value: 78 },
    ],
  },
  sentiment: 91,
  orders: [],
  notifications: [
    "VWAP Depth generated BUY on NIFTY 24500 CE",
    "Momentum Rider filled FINNIFTY 24900 CE",
    "ORB Breakout paused after 2 consecutive losses",
    "FII net inflow crossed +1,500 Cr",
  ],
  chat: [
    { from: "Risk", text: "VIX crushed 3%. Prefer defined-risk spreads.", mine: false },
    { from: "Algo", text: "VWAP Depth confidence 91% on 24500 CE.", mine: false },
    { from: "You", text: "Reviewing the ticket now.", mine: true },
  ],
  settings: {
    product: "MIS",
    confirmation: "Enabled",
    riskGuard: "Max 2% per trade",
    broker: "Dhan",
    notifications: "Signals + fills",
  },
  dhanFeed: {
    live: false,
    source: "idle",
    lastTickAt: null,
    error: null,
    tokenHint: null,
    profileName: null,
    clientId: null,
    quoteCount: 0,
    positionCount: 0,
    holdingCount: 0,
  },
  liveCandles: [],
};

const INDEX_ALIASES = {
  "NIFTY 50": "NIFTY 50",
  "BANK NIFTY": "BANKNIFTY",
  BANKNIFTY: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  SENSEX: "SENSEX",
  "INDIA VIX": "INDIA VIX",
};

function round2(value) {
  return Number(Number(value).toFixed(2));
}

export function setDhanFeed(patch) {
  state.dhanFeed = { ...state.dhanFeed, ...patch };
}

export function isDhanFeedLive() {
  return Boolean(state.dhanFeed.live);
}

function jitter(price, magnitude) {
  return Number((price + (Math.random() - 0.48) * magnitude).toFixed(2));
}

export function tickMarket() {
  if (state.dhanFeed.live) {
    state.algos = state.algos.map((algo) => {
      if (!algo.enabled) return algo;
      const pnl = Number((algo.pnl + (Math.random() - 0.35) * 4).toFixed(2));
      return { ...algo, pnl };
    });
    return;
  }

  state.indices = state.indices.map((item) => {
    const next = jitter(item.price, item.symbol === "INDIA VIX" ? 0.04 : item.price * 0.00012);
    const spark = item.spark.slice(1).concat(next);
    const change = Number((item.change + (next - item.price)).toFixed(2));
    const changePct = Number(((change / (next - change)) * 100).toFixed(2));
    return { ...item, price: next, change, changePct, spark };
  });

  const nifty = state.indices[0];
  state.ohlc.close = nifty.price;
  state.ohlc.high = Math.max(state.ohlc.high, nifty.price);
  state.ohlc.low = Math.min(state.ohlc.low, nifty.price);

  state.positions = state.positions.map((row) => {
    const ltp = jitter(row.ltp, 0.35);
    const dir = row.type === "BUY" ? 1 : -1;
    const pnl = Number(((ltp - row.avg) * row.qty * dir).toFixed(2));
    return { ...row, ltp, pnl };
  });

  state.algos = state.algos.map((algo) => {
    if (!algo.enabled) return algo;
    const pnl = Number((algo.pnl + (Math.random() - 0.35) * 12).toFixed(2));
    return { ...algo, pnl };
  });

  state.optionChain = state.optionChain.map((row) => ({
    ...row,
    callLtp: jitter(row.callLtp, 0.55),
    putLtp: jitter(row.putLtp, 0.55),
    callOi: Math.max(1000, Math.round((row.callOi || 0) + (Math.random() - 0.45) * 8000)),
    putOi: Math.max(1000, Math.round((row.putOi || 0) + (Math.random() - 0.45) * 8000)),
  }));
  const stats = chainStats(state.optionChain, state.optionMeta.spot);
  state.optionMeta = { ...state.optionMeta, ...stats, source: "demo" };
}

export function snapshot() {
  const brokers = publicBrokers();
  const active = getActiveBroker();
  const totalPnl = state.positions.reduce((sum, row) => sum + row.pnl, 0);
  const byBroker = {};
  for (const row of state.positions) {
    const key = row.brokerId || "dhan";
    byBroker[key] = Number(((byBroker[key] || 0) + row.pnl).toFixed(2));
  }
  const { liveCandles: _liveCandles, ...publicState } = clone(state);
  return {
    ...publicState,
    totalPnl: Number(totalPnl.toFixed(2)),
    pnlByBroker: byBroker,
    brokers: brokers.brokers,
    activeBrokerId: brokers.activeBrokerId,
    mainBrokerId: brokers.mainBrokerId,
    dhanFeed: clone(state.dhanFeed),
    settings: { ...state.settings, broker: active.name },
    marketStatus: "OPEN",
    serverTime: new Date().toISOString(),
  };
}

export function toggleAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return null;
  algo.enabled = !algo.enabled;
  algo.status = algo.enabled ? "LIVE" : "PAUSED";
  return clone(algo);
}

export function placeOrder(payload) {
  const brokers = publicBrokers();
  const requested = String(payload.brokerId || brokers.activeBrokerId || "dhan");
  const account = brokers.brokers.find((item) => item.id === requested);
  if (!account?.connected) {
    return { error: "Connect this broker before placing an order" };
  }
  const brokerId = account.id;
  const order = {
    id: `o${Date.now()}`,
    symbol: payload.symbol || "NIFTY 24500 CE",
    side: payload.side || "BUY",
    qty: Number(payload.qty) || 75,
    product: payload.product || "MIS",
    type: payload.type || "MARKET",
    status: "FILLED",
    price: Number(payload.price) || 142.75,
    brokerId,
    brokerName: account.name,
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  state.positions.unshift({
    id: `p${Date.now()}`,
    symbol: order.symbol,
    type: order.side,
    qty: order.qty,
    avg: order.price,
    ltp: order.price,
    pnl: 0,
    brokerId,
  });
  state.notifications.unshift(`${account.name} ${order.status}: ${order.side} ${order.symbol}`);
  return order;
}

export function assignAlgoBroker(id, brokerId) {
  const account = publicBrokers().brokers.find((item) => item.id === brokerId);
  if (!account?.connected) return { error: "Connect this broker first" };
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Algo not found" };
  algo.brokerId = brokerId;
  return clone(algo);
}

export function applyBrokerPositions(positions, brokerId) {
  const existing = new Set(state.positions.map((row) => row.id));
  for (const row of positions) {
    if (!existing.has(row.id)) state.positions.push(row);
  }
  state.notifications.unshift(`Broker connected: ${brokerId}`);
}

export function dropBrokerPositions(brokerId) {
  state.positions = state.positions.filter((row) => row.brokerId !== brokerId);
  state.algos = state.algos.map((algo) => (algo.brokerId === brokerId ? { ...algo, brokerId: "dhan", enabled: false, status: "PAUSED" } : algo));
}

export function replaceDhanBook(rows) {
  const incoming = Array.isArray(rows) ? rows : [];
  const others = state.positions.filter((row) => row.brokerId !== "dhan");
  state.positions = [...incoming, ...others];
}

export function setLiveCandles(candles) {
  if (!Array.isArray(candles) || !candles.length) return;
  state.liveCandles = candles;
  const last = candles[candles.length - 1];
  state.ohlc = {
    open: round2(candles[0]?.open ?? last.open),
    high: round2(Math.max(...candles.map((row) => row.high))),
    low: round2(Math.min(...candles.map((row) => row.low))),
    close: round2(last.close),
  };
  const nifty = state.indices.find((item) => item.symbol === "NIFTY 50");
  if (nifty && last.close > 0) {
    nifty.price = round2(last.close);
    nifty.spark = pushSpark(nifty.spark, last.close);
  }
}

export function getChainSpot(symbol = state.optionMeta.symbol) {
  const meta = getUnderlying(symbol);
  const index = state.indices.find((item) => item.symbol === meta.indexSymbol);
  return Number(index?.price || state.optionMeta.spot || 24580);
}

export function applySyntheticOptionChain(symbol = state.optionMeta.symbol, expiry = state.optionMeta.expiry) {
  const meta = getUnderlying(symbol);
  const expiries = upcomingExpiries();
  const chosen = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  const spot = getChainSpot(meta.id);
  const rows = buildSyntheticChain(spot, meta.step, 10);
  const stats = chainStats(rows, spot);
  state.optionChain = rows;
  state.optionMeta = {
    symbol: meta.id,
    expiry: chosen,
    expiries,
    ...stats,
    source: "demo",
    lastAt: Date.now(),
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  };
  return clone(state.optionMeta);
}

export function setOptionDesk({ symbol, expiry, expiries, rows, spot, source }) {
  const meta = getUnderlying(symbol || state.optionMeta.symbol);
  const nextRows = Array.isArray(rows) && rows.length ? rows : state.optionChain;
  const nextSpot = Number(spot) || getChainSpot(meta.id);
  const stats = chainStats(nextRows, nextSpot);
  state.optionChain = nextRows;
  state.optionMeta = {
    ...state.optionMeta,
    symbol: meta.id,
    expiry: expiry || state.optionMeta.expiry,
    expiries: expiries?.length ? expiries : state.optionMeta.expiries,
    ...stats,
    source: source || state.optionMeta.source,
    lastAt: Date.now(),
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  };
  return clone(state.optionMeta);
}

export function getOptionMeta() {
  return clone(state.optionMeta);
}

export function addChat(text) {
  const message = { from: "You", text, mine: true };
  state.chat.push(message);
  return clone(state.chat);
}

function relatedIndex(symbol) {
  const upper = String(symbol || "").toUpperCase();
  if (upper.includes("BANKNIFTY") || upper.includes("BANK NIFTY")) return "BANKNIFTY";
  if (upper.includes("FINNIFTY")) return "FINNIFTY";
  if (upper.includes("SENSEX")) return "SENSEX";
  if (upper.includes("NIFTY")) return "NIFTY 50";
  return null;
}

function pushSpark(spark, value) {
  const next = (spark || []).slice(-7);
  next.push(round2(value));
  return next;
}

function seedLiveCandles(price) {
  state.liveCandles = generateCandles(90, price, 91);
  const last = state.liveCandles[state.liveCandles.length - 1];
  if (last) {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
  }
}

function updateLiveCandle(price) {
  if (!state.liveCandles.length) seedLiveCandles(price);
  const last = state.liveCandles[state.liveCandles.length - 1];
  const now = Date.now();
  if (!last || now - last.time >= 60_000) {
    const open = last ? last.close : price;
    state.liveCandles.push({
      time: now,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      volume: 800_000,
    });
    if (state.liveCandles.length > 120) state.liveCandles.shift();
    return;
  }
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
}

export function applyLiveQuotes(quotes) {
  const indexPrev = Object.fromEntries(state.indices.map((item) => [item.symbol, item.price]));

  for (const quote of quotes) {
    const ltp = Number(quote.ltp);
    if (!Number.isFinite(ltp) || ltp <= 0) continue;
    const indexSymbol = INDEX_ALIASES[quote.symbol] || quote.symbol;
    const index = state.indices.find((item) => item.symbol === indexSymbol);
    if (index) {
      const prevClose = Number(quote.close) > 0 ? Number(quote.close) : index.price;
      const change = round2(ltp - prevClose);
      const changePct = round2(prevClose ? (change / prevClose) * 100 : 0);
      index.price = round2(ltp);
      index.change = change;
      index.changePct = changePct;
      index.spark = pushSpark(index.spark, ltp);
      if (index.symbol === "NIFTY 50") {
        const open = Number(quote.open) > 0 ? Number(quote.open) : state.ohlc.open;
        state.ohlc = {
          open: round2(open),
          high: round2(Number(quote.high) > 0 ? Math.max(quote.high, ltp) : Math.max(state.ohlc.high, ltp)),
          low: round2(Number(quote.low) > 0 ? Math.min(quote.low, ltp) : Math.min(state.ohlc.low, ltp)),
          close: round2(ltp),
        };
        updateLiveCandle(ltp);
      }
    }

    const watch = state.watchlist.find((item) => item.symbol === quote.symbol);
    if (watch) {
      const prev = watch.ltp;
      watch.ltp = round2(ltp);
      watch.chg = round2(prev ? ((ltp - prev) / prev) * 100 : watch.chg);
    }

    const row = state.marketWatch.find((item) => item.symbol === quote.symbol || item.symbol === indexSymbol);
    if (row) {
      const prev = row.ltp;
      row.ltp = round2(ltp);
      row.chg = round2(prev ? ((ltp - prev) / prev) * 100 : row.chg);
    }
  }

  state.positions = state.positions.map((row) => {
    const equity = quotes.find((quote) => quote.symbol === row.symbol && quote.kind === "equity");
    if (equity) {
      const ltp = round2(equity.ltp);
      const dir = row.type === "BUY" ? 1 : -1;
      return { ...row, ltp, pnl: round2((ltp - row.avg) * row.qty * dir) };
    }
    const indexName = relatedIndex(row.symbol);
    if (!indexName || !indexPrev[indexName]) return row;
    const nextIndex = state.indices.find((item) => item.symbol === indexName);
    if (!nextIndex) return row;
    const movePct = (nextIndex.price - indexPrev[indexName]) / indexPrev[indexName];
    if (!Number.isFinite(movePct) || movePct === 0) return row;
    const ltp = round2(Math.max(0.05, row.ltp * (1 + movePct * 8)));
    const dir = row.type === "BUY" ? 1 : -1;
    return { ...row, ltp, pnl: round2((ltp - row.avg) * row.qty * dir) };
  });

  const nifty = state.indices.find((item) => item.symbol === "NIFTY 50");
  if (nifty && indexPrev["NIFTY 50"] && state.optionMeta?.source !== "dhan") {
    const move = nifty.price - indexPrev["NIFTY 50"];
    state.optionChain = state.optionChain.map((row) => ({
      ...row,
      callLtp: round2(Math.max(0.05, row.callLtp + move * 0.08)),
      putLtp: round2(Math.max(0.05, row.putLtp - move * 0.08)),
    }));
  }
}

export function getCandles(tf = "5m") {
  if (state.dhanFeed.live && state.liveCandles.length) {
    const step = tf === "1m" ? 1 : tf === "5m" ? 5 : tf === "15m" ? 15 : tf === "1H" ? 60 : 5;
    if (step <= 1) return clone(state.liveCandles);
    const grouped = [];
    for (let i = 0; i < state.liveCandles.length; i += step) {
      const slice = state.liveCandles.slice(i, i + step);
      if (!slice.length) continue;
      grouped.push({
        time: slice[0].time,
        open: slice[0].open,
        high: Math.max(...slice.map((row) => row.high)),
        low: Math.min(...slice.map((row) => row.low)),
        close: slice[slice.length - 1].close,
        volume: slice.reduce((sum, row) => sum + row.volume, 0),
      });
    }
    return grouped;
  }
  const count = tf === "1m" ? 90 : tf === "5m" ? 80 : tf === "15m" ? 64 : tf === "1H" ? 48 : 36;
  return generateCandles(count, 24420, tf.length * 17);
}
