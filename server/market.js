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
  optionChain: [
    { strike: 24400, callLtp: 212.4, callChg: 8.2, putLtp: 38.15, putChg: -11.4 },
    { strike: 24500, callLtp: 142.75, callChg: 6.8, putLtp: 62.4, putChg: -8.1, atm: true },
    { strike: 24600, callLtp: 88.2, callChg: 4.1, putLtp: 104.55, putChg: -5.6 },
  ],
  algos: [
    { id: "a1", name: "VWAP Depth", tag: "Intraday", status: "LIVE", pnl: 2840.5, winRate: 68, enabled: true },
    { id: "a2", name: "Momentum Rider", tag: "Options", status: "LIVE", pnl: 1960.25, winRate: 61, enabled: true },
    { id: "a3", name: "ORB Breakout", tag: "Index", status: "PAUSED", pnl: -412.0, winRate: 54, enabled: false },
  ],
  positions: [
    { id: "p1", symbol: "NIFTY 24500 CE", type: "BUY", qty: 75, avg: 128.4, ltp: 142.75, pnl: 1076.25 },
    { id: "p2", symbol: "BANKNIFTY 52100 PE", type: "SELL", qty: 30, avg: 186.2, ltp: 164.5, pnl: 651.0 },
    { id: "p3", symbol: "NIFTY 24600 CE", type: "BUY", qty: 50, avg: 74.1, ltp: 88.2, pnl: 705.0 },
    { id: "p4", symbol: "FINNIFTY 24900 CE", type: "BUY", qty: 65, avg: 96.8, ltp: 118.4, pnl: 1404.0 },
    { id: "p5", symbol: "SENSEX 80600 CE", type: "BUY", qty: 20, avg: 142.0, ltp: 168.35, pnl: 527.0 },
    { id: "p6", symbol: "NIFTY 24400 PE", type: "SELL", qty: 50, avg: 52.6, ltp: 38.15, pnl: 722.5 },
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
    broker: "Paper trading",
    notifications: "Signals + fills",
  },
};

function jitter(price, magnitude) {
  return Number((price + (Math.random() - 0.48) * magnitude).toFixed(2));
}

export function tickMarket() {
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
    callLtp: jitter(row.callLtp, 0.6),
    putLtp: jitter(row.putLtp, 0.6),
  }));
}

export function snapshot() {
  const totalPnl = state.positions.reduce((sum, row) => sum + row.pnl, 0);
  return {
    ...clone(state),
    totalPnl: Number(totalPnl.toFixed(2)),
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
  const order = {
    id: `o${Date.now()}`,
    symbol: payload.symbol || "NIFTY 24500 CE",
    side: payload.side || "BUY",
    qty: Number(payload.qty) || 75,
    product: payload.product || "MIS",
    type: payload.type || "MARKET",
    status: "FILLED",
    price: Number(payload.price) || 142.75,
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  state.notifications.unshift(`Order ${order.status}: ${order.side} ${order.symbol}`);
  return order;
}

export function addChat(text) {
  const message = { from: "You", text, mine: true };
  state.chat.push(message);
  return clone(state.chat);
}

export function getCandles(tf = "5m") {
  const count = tf === "1m" ? 90 : tf === "5m" ? 80 : tf === "15m" ? 64 : tf === "1H" ? 48 : 36;
  return generateCandles(count, 24420, tf.length * 17);
}
