import { getActiveBroker, PAPER_STARTING_FUNDS, publicBrokers, setPaperLedger } from "./brokers.js";
import {
  UNDERLYINGS,
  atmStrike,
  buildSyntheticChain,
  chainStats,
  dropExpired,
  getUnderlying,
  nearestWeeklyExpiry,
  normalizeExpiry,
  upcomingExpiries,
  withExpiryLabels,
} from "./optionChain.js";
import { listIndexContracts, optionCount, publicFutures, publicIndices, publicOptionRows } from "./frontFutures.js";
import { buildReport, seedClosedTrades, seedOrders, seedPositions } from "./desk.js";
import { normalizeAlgo, seedAlgos } from "./strategies.js";
import { evaluateSignals, runBacktest } from "./backtest.js";
import {
  isNiftyOptionEngineAlgo,
  isNiftyVwapReversalAlgo,
  LiveTradingAdapter,
  NiftyVwapStrategy,
  noteBrokerRejection,
  noteFeedReconnect,
  optionEngineConfig,
  PaperTradingAdapter,
  PositionManager,
  runtimeState,
  runNiftyVwapBacktest,
} from "./niftyVwap/index.js";

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function ymdIST(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nseMarketSession(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const minutes = hour * 60 + minute;
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const openMins = 9 * 60 + 15;
  const closeMins = 15 * 60 + 30;
  const inHours = minutes >= openMins && minutes < closeMins;
  const open = !weekend && inHours;
  let reason = "session";
  if (weekend) reason = "weekend";
  else if (minutes < openMins) reason = "before-open";
  else if (minutes >= closeMins) reason = "after-close";
  return {
    status: open ? "OPEN" : "CLOSED",
    open,
    reason,
    hours: "09:15–15:30 IST",
    weekday: parts.weekday,
    ist: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function shiftYmd(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function resolveBacktestWindow(options = {}) {
  const today = ymdIST();
  const rangeRaw = String(options.range || "").toLowerCase();
  const custom =
    rangeRaw === "custom" || ((options.from || options.to) && rangeRaw !== "1y" && rangeRaw !== "year");
  let from;
  let to;
  let range;
  if (custom) {
    from = String(options.from || "").slice(0, 10);
    to = String(options.to || today).slice(0, 10);
    range = "custom";
    if (!isYmd(from) || !isYmd(to)) {
      return { error: "Custom backtest needs from and to dates (YYYY-MM-DD)" };
    }
  } else {
    to = today;
    from = shiftYmd(today, -365);
    range = "1y";
  }
  const fromMs = Date.parse(`${from}T09:15:00+05:30`);
  const toMs = Date.parse(`${to}T15:30:00+05:30`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { error: "Invalid backtest dates" };
  }
  if (fromMs >= toMs) {
    return { error: "From date must be before to date" };
  }
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (days > 800) {
    return { error: "Date range cannot be longer than 800 days" };
  }
  if (days < 2) {
    return { error: "Pick at least two calendar days" };
  }
  return { from, to, range, days, fromMs, toMs };
}

export function pickBacktestTimeframe(requested, days) {
  const tf = String(requested || "5m");
  if (days <= 14) return tf;
  if (days <= 45) return tf === "1m" ? "5m" : tf;
  if (tf === "1H" || tf === "1h") return "1H";
  return "1H";
}

function sessionSlots(tf) {
  if (tf === "1D" || tf === "1d" || tf === "day") return ["15:30"];
  const step = tf === "1m" ? 1 : tf === "5m" ? 5 : tf === "15m" ? 15 : 60;
  const slots = [];
  for (let minute = 9 * 60 + 15; minute < 15 * 60 + 30; minute += step) {
    slots.push(`${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`);
  }
  return slots.length ? slots : ["15:30"];
}

function tradingDays(from, to) {
  const days = [];
  let cur = from;
  while (cur <= to) {
    const weekday = new Date(`${cur}T12:00:00+05:30`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(cur);
    cur = shiftYmd(cur, 1);
    if (days.length > 420) break;
  }
  return days;
}

export function generateRangeCandles({ from, to, timeframe = "1H", startPrice = 24580, seed = 42 }) {
  const rand = seeded(seed);
  const days = tradingDays(from, to);
  let slots = sessionSlots(timeframe);
  if (days.length * slots.length > 2200) {
    slots = sessionSlots("1H");
  }
  if (days.length * slots.length > 2200) {
    slots = sessionSlots("1D");
  }
  const candles = [];
  let price = startPrice;
  const driftScale = slots.length <= 1 ? 90 : slots.length <= 8 ? 42 : 18;
  for (const day of days) {
    for (const slot of slots) {
      const drift = (rand() - 0.48) * driftScale;
      const open = price;
      const close = Math.max(100, open + drift);
      const high = Math.max(open, close) + rand() * 12;
      const low = Math.min(open, close) - rand() * 12;
      const volume = 800_000 + rand() * 2_400_000;
      candles.push({
        time: Date.parse(`${day}T${slot}:00+05:30`),
        open,
        high,
        low,
        close,
        volume,
      });
      price = close;
    }
  }
  return candles;
}

function inferTimeframe(candles, fallback = "1H") {
  if (!candles || candles.length < 2) return fallback;
  const delta = Number(candles[1].time) - Number(candles[0].time);
  if (delta <= 90_000) return "1m";
  if (delta <= 8 * 60_000) return "5m";
  if (delta <= 20 * 60_000) return "15m";
  if (delta <= 2 * 60 * 60_000) return "1H";
  return "1D";
}

const state = {
  indices: [
    withDeskQuotes({ symbol: "NIFTY 50", name: "NIFTY", price: 24580.25, change: 125.4, changePct: 0.51, spark: [24420, 24455, 24410, 24480, 24510, 24490, 24540, 24580] }),
    withDeskQuotes({ symbol: "BANKNIFTY", name: "BANKNIFTY", price: 52140.8, change: 210.15, changePct: 0.4, spark: [51880, 51940, 51910, 52020, 52080, 52040, 52110, 52141] }),
    withDeskQuotes({ symbol: "FINNIFTY", name: "FINNIFTY", price: 24890.5, change: 98.2, changePct: 0.4, spark: [24740, 24780, 24755, 24810, 24840, 24820, 24870, 24891] }),
    withDeskQuotes({ symbol: "SENSEX", name: "SENSEX", price: 80642.3, change: 312.8, changePct: 0.39, spark: [80210, 80340, 80280, 80420, 80510, 80470, 80590, 80642] }),
    withDeskQuotes({ symbol: "INDIA VIX", name: "VIX", price: 13.24, change: -0.42, changePct: -3.07, spark: [13.9, 13.72, 13.8, 13.55, 13.48, 13.4, 13.3, 13.24] }),
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
  optionMeta: withExpiryLabels({
    symbol: "NIFTY",
    expiry: upcomingExpiries("NIFTY")[0] || "2026-08-25",
    expiries: upcomingExpiries("NIFTY"),
    spot: 24580.25,
    pcr: 0.86,
    maxPain: 24500,
    atmIv: 12.4,
    source: "demo",
    lastAt: null,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  }),
  algos: seedAlgos(),
  positions: seedPositions(),
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
    expiry: "25 Aug",
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
  orders: seedOrders(),
  closedTrades: seedClosedTrades(),
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
    ipCheck: null,
    autoRenew: false,
    autoMode: "off",
    tokenExpiry: null,
    nextRenewAt: null,
    autoStart: false,
    needsFresh: false,
  },
  liveCandles: [],
};

const optionChainCache = new Map();
const pendingLiveAlgoOrders = [];

function rememberOptionChain(symbol, rows, meta) {
  const id = String(symbol || "").toUpperCase();
  if (!id || !Array.isArray(rows) || !rows.length) return;
  optionChainCache.set(id, { rows, meta, at: Date.now() });
}

function chainForSymbol(symbol) {
  const id = String(symbol || "").toUpperCase();
  if (String(state.optionMeta?.symbol || "").toUpperCase() === id && Array.isArray(state.optionChain) && state.optionChain.length) {
    return { rows: state.optionChain, meta: state.optionMeta };
  }
  return optionChainCache.get(id) || null;
}

export function drainPendingLiveAlgoOrders() {
  return pendingLiveAlgoOrders.splice(0, pendingLiveAlgoOrders.length);
}

export function queueLiveAlgoOrder(payload) {
  const strategy = String(payload?.strategy || "");
  const side = payload?.side === "SELL" ? "SELL" : "BUY";
  if (
    strategy &&
    pendingLiveAlgoOrders.some((row) => row.strategy === strategy && (row.side === "SELL" ? "SELL" : "BUY") === side)
  ) {
    return { ok: true, queued: true, status: "PENDING", duplicate: true };
  }
  pendingLiveAlgoOrders.push({ ...payload, brokerId: "dhan" });
  return { ok: true, queued: true, status: "PENDING" };
}

export function noteLiveAlgoOrderResult(payload, live, error) {
  const name = String(payload?.strategy || "");
  if (!name) return;
  const algo = (state.algos || []).find((item) => item.name === name && isNiftyOptionEngineAlgo(item));
  if (!algo) return;
  const status = String(live?.status || "").toUpperCase();
  if (error || status === "REJECTED" || status === "CANCELLED") {
    noteBrokerRejection(algo);
  }
}

function upsertOptionBar(list, barTime, ltp) {
  const bars = Array.isArray(list) ? list : [];
  if (!(ltp > 0) || !barTime) return bars;
  const last = bars[bars.length - 1];
  if (last && Number(last.time) === Number(barTime)) {
    last.close = ltp;
    last.high = Math.max(Number(last.high), ltp);
    last.low = Math.min(Number(last.low), ltp);
    last.volume = Number(last.volume || 0) + 1;
    return bars;
  }
  bars.push({ time: barTime, open: ltp, high: ltp, low: ltp, close: ltp, volume: 1 });
  if (bars.length > 90) bars.splice(0, bars.length - 90);
  return bars;
}

function optionPremium(symbol, strike, option, expiry) {
  const pack = chainForSymbol(symbol);
  if (expiry && pack?.meta?.expiry && normalizeExpiry(pack.meta.expiry) !== normalizeExpiry(expiry)) {
    return 0;
  }
  const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
  const ltp = option === "PE" ? Number(row?.putLtp) : Number(row?.callLtp);
  return ltp > 0 ? round2(ltp) : 0;
}

function niftyListedExpiries(pack) {
  const listed = dropExpired(pack?.meta?.expiries || []);
  if (listed.length) return listed;
  return upcomingExpiries("NIFTY", 12);
}

function expiryForNiftyVwap(algo, pack) {
  const listed = niftyListedExpiries(pack);
  if (isNiftyVwapReversalAlgo(algo)) {
    return nearestWeeklyExpiry(listed, "NIFTY") || listed[0] || "";
  }
  return pack?.meta?.expiry || listed[0] || "";
}

function preferWeeklyDeskForReversal() {
  const running = (state.algos || []).some((algo) => isNiftyVwapReversalAlgo(algo) && algo.enabled);
  if (!running) return;
  if (String(state.optionMeta?.symbol || "").toUpperCase() !== "NIFTY") return;
  const weekly = nearestWeeklyExpiry(niftyListedExpiries({ meta: state.optionMeta }), "NIFTY");
  if (weekly && normalizeExpiry(state.optionMeta.expiry) !== weekly) {
    state.optionMeta = { ...state.optionMeta, expiry: weekly };
  }
}

function positionsForNiftyVwap(algo, mode) {
  const vs = runtimeState(algo);
  const mine = (row) => {
    if (row.strategy === algo.name) return true;
    if (vs.lockedSymbol && row.symbol === vs.lockedSymbol) return true;
    return false;
  };
  const rows = state.positions || [];
  if (mode === "paper") return rows.filter((row) => isPaperRow(row) && mine(row));
  return rows.filter((row) => !isPaperRow(row) && mine(row));
}

let lastNiftyVwapFeed = true;

function noteNiftyVwapFeed(feedLive) {
  if (feedLive && lastNiftyVwapFeed === false) {
    for (const algo of state.algos || []) {
      if (isNiftyOptionEngineAlgo(algo) && algo.enabled) noteFeedReconnect(algo);
    }
  }
  lastNiftyVwapFeed = Boolean(feedLive);
}

function tickNiftyVwapAlgo(algo, mode, feedLive) {
  const now = Date.now();
  const session = nseMarketSession();
  const config = optionEngineConfig(algo);
  const vs = runtimeState(algo);
  const positions = positionsForNiftyVwap(algo, mode);
  const open = PositionManager.openFor(positions, algo.name, vs);
  if (mode === "live" && !session.open && !open) return;
  if (isNiftyVwapReversalAlgo(algo)) preferWeeklyDeskForReversal();
  const futuresBars = getCandles(config.timeframe || "5m");
  const lastBar = futuresBars[futuresBars.length - 1];
  const barTime = lastBar ? Number(lastBar.time) : 0;
  const und = getUnderlying("NIFTY");
  const pack = chainForSymbol("NIFTY");
  const expiry = expiryForNiftyVwap(algo, pack);
  const spot = Number(getChainSpot("NIFTY")) || Number(lastBar?.close) || 0;
  const atm = atmStrike(spot, und.step);
  const ceStrike = vs.lockedOption === "CE" && vs.lockedStrike ? vs.lockedStrike : atm;
  const peStrike = vs.lockedOption === "PE" && vs.lockedStrike ? vs.lockedStrike : atm;
  if (vs.ceStrike !== ceStrike) {
    vs.ceBars = [];
    vs.ceStrike = ceStrike;
  }
  if (vs.peStrike !== peStrike) {
    vs.peBars = [];
    vs.peStrike = peStrike;
  }
  const ceLtp = optionPremium("NIFTY", ceStrike, "CE", expiry);
  const peLtp = optionPremium("NIFTY", peStrike, "PE", expiry);
  vs.ceBars = upsertOptionBar(vs.ceBars, barTime, ceLtp);
  vs.peBars = upsertOptionBar(vs.peBars, barTime, peLtp);
  const adapter =
    mode === "live"
      ? LiveTradingAdapter({ queueLiveOrder: queueLiveAlgoOrder, squareOff })
      : PaperTradingAdapter({ placeOrder, squareOff });
  NiftyVwapStrategy.tick({
    algo,
    config,
    now,
    feedLive: Boolean(feedLive),
    minutesToClose: session.open ? undefined : 0,
    futuresBars,
    ceBars: vs.ceBars,
    peBars: vs.peBars,
    spot,
    step: und.step,
    expiry,
    ceLtp,
    peLtp,
    positions,
    adapter,
  });
}

function algoOrderFields(algo, side, trade) {
  return {
    symbol: trade.symbol,
    side,
    qty: algo.qty || 65,
    price: trade.ltp || 0,
    kind: trade.kind,
    option: trade.option,
    strike: trade.strike,
    expiry: trade.expiry,
    product: "MIS",
    type: "MARKET",
    strategy: algo.name,
    exchangeSegment: String(algo.symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
  };
}

export function resolveAlgoTrade(algo) {
  if (isNiftyOptionEngineAlgo(algo)) {
    const symbol = "NIFTY";
    const und = getUnderlying(symbol);
    const pack = chainForSymbol(symbol);
    const spot = Number(pack?.meta?.spot) || getChainSpot(symbol);
    const vs = algo.vwapState || {};
    const strike = Number(vs.lockedStrike) || atmStrike(spot, und.step);
    const option = vs.lockedOption === "PE" ? "PE" : vs.lockedOption === "CE" ? "CE" : "";
    const expiry = isNiftyVwapReversalAlgo(algo)
      ? nearestWeeklyExpiry(niftyListedExpiries(pack), "NIFTY") || pack?.meta?.expiry || upcomingExpiries(und.id)[0] || ""
      : pack?.meta?.expiry || upcomingExpiries(und.id)[0] || "";
    const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
    const ceLtp = Number(row?.callLtp);
    const peLtp = Number(row?.putLtp);
    const liveChain = pack?.meta?.source === "dhan";
    const premium = option === "PE" ? peLtp : option === "CE" ? ceLtp : ceLtp || peLtp;
    const contract = option ? `${symbol} ${strike} ${option}` : `${symbol} ${strike} ATM`;
    let hint = "";
    if (!liveChain) hint = `Open Options on ${symbol} for live ATM CE/PE`;
    else if (isNiftyVwapReversalAlgo(algo) && expiry && pack?.meta?.expiry && normalizeExpiry(pack.meta.expiry) !== normalizeExpiry(expiry)) {
      hint = `Waiting for weekly ${expiry} chain (not monthly)`;
    } else if (!row) hint = `No ${strike} ATM on the ${symbol} tape yet`;
    else if (!(ceLtp > 0) && !(peLtp > 0)) hint = "Waiting for live ATM option LTP";
    else hint = `CE ${ceLtp > 0 ? ceLtp : "—"} · PE ${peLtp > 0 ? peLtp : "—"}`;
    const weeklyReady =
      !isNiftyVwapReversalAlgo(algo) ||
      !expiry ||
      !pack?.meta?.expiry ||
      normalizeExpiry(pack.meta.expiry) === normalizeExpiry(expiry);
    return {
      kind: "option",
      symbol: contract,
      option: option || "CE",
      strike,
      expiry,
      ltp: premium > 0 && weeklyReady ? round2(premium) : 0,
      label: expiry ? `${contract} · ${expiry}` : contract,
      source: pack?.meta?.source || "",
      ready: liveChain && weeklyReady && (ceLtp > 0 || peLtp > 0),
      hint,
    };
  }
  const symbol = algo.symbol || "NIFTY";
  const instrument = algo.instrument === "option" ? "option" : "future";
  if (instrument !== "option") {
    const index =
      state.indices.find(
        (item) => item.name === symbol || item.symbol === symbol || String(item.symbol).startsWith(symbol),
      ) || state.indices[0];
    const ltp = liveLtpForSymbol(`${symbol} FUT`) || Number(index?.future || index?.price || 0);
    return {
      kind: "future",
      symbol: `${symbol} FUT`,
      ltp: ltp > 0 ? round2(ltp) : 0,
      label: `${symbol} FUT`,
      ready: ltp > 0,
      hint: ltp > 0 ? "" : "Waiting for live future LTP",
    };
  }
  const option = algo.optionType === "PE" ? "PE" : "CE";
  const offset = Math.max(-2, Math.min(2, Math.round(Number(algo.strikeOffset) || 0)));
  const und = getUnderlying(symbol);
  const pack = chainForSymbol(symbol);
  const spot = Number(pack?.meta?.spot) || getChainSpot(symbol);
  const atm = atmStrike(spot, und.step);
  const strike = atm + offset * und.step;
  const expiry = pack?.meta?.expiry || upcomingExpiries(und.id)[0] || "";
  const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
  const ltp = option === "PE" ? Number(row?.putLtp) : Number(row?.callLtp);
  const contract = `${symbol} ${strike} ${option}`;
  const liveChain = pack?.meta?.source === "dhan";
  const premium = ltp > 0 ? round2(ltp) : 0;
  let hint = "";
  if (!liveChain) hint = `Open Options on ${symbol} for live ${option} prices`;
  else if (!row) hint = `No ${strike} ${option} on the ${symbol} tape yet`;
  else if (!(premium > 0)) hint = "Waiting for live option LTP";
  return {
    kind: "option",
    symbol: contract,
    option,
    strike,
    expiry,
    ltp: premium,
    label: expiry ? `${contract} · ${expiry}` : contract,
    source: pack?.meta?.source || "",
    ready: liveChain && premium > 0,
    hint,
  };
}

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

function withDeskQuotes(item) {
  const price = Number(item.price) || 0;
  const change = Number(item.change) || 0;
  const isVix = item.symbol === "INDIA VIX";
  const future = Number(item.future) > 0 ? Number(item.future) : round2(isVix ? price : price + Math.max(6, price * 0.00085));
  const vwap =
    Number(item.futureVwap) > 0
      ? Number(item.futureVwap)
      : Number(item.vwap) > 0
        ? Number(item.vwap)
        : round2(isVix ? price : price - Math.max(2, price * 0.00032));
  const prevClose = Number(item.prevClose) > 0 ? Number(item.prevClose) : round2(price - change);
  const ids = { "NIFTY 50": 13, BANKNIFTY: 25, FINNIFTY: 27, SENSEX: 51, "INDIA VIX": 21 };
  return {
    ...item,
    future,
    vwap,
    prevClose,
    securityId: item.securityId || ids[item.symbol] || undefined,
  };
}

function sanePrevClose(ltp, prev) {
  const close = Number(prev);
  if (!(close > 0) || !(ltp > 0)) return null;
  if (Math.abs(ltp - close) / close > 0.08) return null;
  return round2(close);
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

function isSimRow(row) {
  return Boolean(row?.sim) || row?.live === false;
}

function isPaperRow(row) {
  return Boolean(row?.paper) || row?.brokerId === "paper";
}

function liveDesk() {
  const live = isDhanFeedLive();
  const keep = (row) => isPaperRow(row) || (Boolean(row?.live) && !row?.sim);
  const orders = live ? state.orders.filter(keep) : state.orders;
  const positions = live ? state.positions.filter(keep) : state.positions;
  const closedTrades = live ? (state.closedTrades || []).filter(keep) : state.closedTrades || [];
  return { live, orders, positions, closedTrades };
}

export function clearSimulatedDesk() {
  state.orders = state.orders.filter((row) => row.paper || row.brokerId === "paper");
  state.positions = state.positions.filter((row) => row.paper || row.brokerId === "paper");
  state.closedTrades = (state.closedTrades || []).filter((row) => row.paper || row.brokerId === "paper");
  state.liveCandles = [];
  state.algos = (state.algos || []).map((algo) =>
    algo.runMode === "paper" ? algo : { ...algo, pnl: algo.runMode === "backtest" ? algo.pnl : 0 },
  );
  state.notifications = ["Dhan LIVE · live quotes. Paper fills stay virtual. No simulated Dhan book."];
}

export function restoreSimulatedDesk() {
  state.algos = (state.algos || []).map((algo) =>
    algo.runMode === "paper" && algo.enabled ? { ...algo, enabled: false, status: "PAUSED" } : algo,
  );
  state.orders = seedOrders();
  state.positions = seedPositions();
  state.closedTrades = seedClosedTrades();
  applySyntheticOptionChain();
  syncPaperLedger();
}

export function tickMarket() {
  if (state.dhanFeed.live) {
    runPaperAlgos();
    runLiveAlgos();
    markPaperToMarket();
    return;
  }

  state.indices = state.indices.map((item) => {
    const next = jitter(item.price, item.symbol === "INDIA VIX" ? 0.04 : item.price * 0.00012);
    const spark = item.spark.slice(1).concat(next);
    const change = Number((item.change + (next - item.price)).toFixed(2));
    const prevClose = item.prevClose > 0 ? item.prevClose : round2(next - change);
    const changePct = Number(((change / (prevClose || next - change || 1)) * 100).toFixed(2));
    const future = item.symbol === "INDIA VIX" ? next : jitter((item.future || next) + (next - item.price), 0.35);
    const futureVwap = item.symbol === "INDIA VIX" ? next : item.futureVwap > 0 ? jitter(item.futureVwap, item.price * 0.00004) : 0;
    const vwap =
      item.symbol === "INDIA VIX" ? next : futureVwap > 0 ? futureVwap : jitter(item.vwap || next, item.price * 0.00004);
    return withDeskQuotes({ ...item, price: next, change, changePct, spark, future, vwap, futureVwap, prevClose });
  });

  const nifty = state.indices[0];
  state.ohlc.close = nifty.price;
  state.ohlc.high = Math.max(state.ohlc.high, nifty.price);
  state.ohlc.low = Math.min(state.ohlc.low, nifty.price);

  state.positions = state.positions.map((row) => {
    if (isPaperRow(row)) return row;
    const ltp = jitter(row.ltp, 0.35);
    const dir = row.type === "BUY" ? 1 : -1;
    const pnl = Number(((ltp - row.avg) * row.qty * dir).toFixed(2));
    return { ...row, ltp, pnl };
  });

  state.algos = state.algos.map((algo) => {
    if (!algo.enabled) return algo;
    if (algo.runMode === "paper" || algo.runMode === "backtest") return algo;
    const pnl = Number((algo.pnl + (Math.random() - 0.35) * 12).toFixed(2));
    return { ...algo, pnl };
  });

  const spot = getChainSpot(state.optionMeta.symbol);
  const und = getUnderlying(state.optionMeta.symbol);
  const atm = atmStrike(spot, und.step);
  const currentAtm = state.optionChain.find((row) => row.atm)?.strike;
  if (atm !== currentAtm) {
    applySyntheticOptionChain(state.optionMeta.symbol, state.optionMeta.expiry);
    return;
  }
  state.optionChain = state.optionChain.map((row) => ({
    ...row,
    callLtp: jitter(row.callLtp, 0.55),
    putLtp: jitter(row.putLtp, 0.55),
    callOi: Math.max(1000, Math.round((row.callOi || 0) + (Math.random() - 0.45) * 8000)),
    putOi: Math.max(1000, Math.round((row.putOi || 0) + (Math.random() - 0.45) * 8000)),
    callVol: Math.max(0, Math.round((row.callVol || 0) + (Math.random() - 0.4) * 4000)),
    putVol: Math.max(0, Math.round((row.putVol || 0) + (Math.random() - 0.4) * 4000)),
    callBuy: Math.max(0, Math.round((row.callBuy || 0) + (Math.random() - 0.45) * 120)),
    callSell: Math.max(0, Math.round((row.callSell || 0) + (Math.random() - 0.45) * 120)),
    putBuy: Math.max(0, Math.round((row.putBuy || 0) + (Math.random() - 0.45) * 120)),
    putSell: Math.max(0, Math.round((row.putSell || 0) + (Math.random() - 0.45) * 120)),
    callVwap: jitter(row.callVwap || row.callLtp, 0.25),
    putVwap: jitter(row.putVwap || row.putLtp, 0.25),
    atm: row.strike === atm,
  }));
  const stats = chainStats(state.optionChain, spot);
  state.optionMeta = withExpiryLabels({ ...state.optionMeta, ...stats, source: "demo" });
  runPaperAlgos();
}

function liveLtpForSymbol(symbol) {
  const raw = String(symbol || "").toUpperCase().replace(/,/g, "");
  const named = raw.match(/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX)\s+(\d{3,6})\s*(CE|PE)\b/);
  const option = named || raw.match(/(\d{3,6})\s*(CE|PE)\b/);
  if (option) {
    const strike = Number(named ? named[2] : option[1]);
    const opt = named ? named[3] : option[2];
    const rows = named ? chainForSymbol(named[1])?.rows || [] : state.optionChain || [];
    const row = rows.find((item) => Number(item.strike) === strike);
    if (row) {
      const ltp = opt === "PE" ? Number(row.putLtp) : Number(row.callLtp);
      if (ltp > 0) return round2(ltp);
    }
  }
  const indexName = relatedIndex(symbol);
  const index = indexName
    ? state.indices.find((item) => item.symbol === indexName || item.name === indexName)
    : state.indices.find((item) => item.symbol === symbol || item.name === symbol);
  if (/\bFUT\b/.test(raw) || /FUTURE/.test(raw)) {
    const fut = Number(index?.future || index?.price);
    if (fut > 0) return round2(fut);
  }
  if (index && Number(index.price) > 0) return round2(index.price);
  const watch = [...(state.watchlist || []), ...(state.marketWatch || [])].find((item) => item.symbol === symbol);
  if (watch && Number(watch.ltp) > 0) return round2(watch.ltp);
  return 0;
}

function syncPaperLedger() {
  const positions = (state.positions || []).filter(isPaperRow);
  const closed = (state.closedTrades || []).filter(isPaperRow);
  const realized = closed.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const unrealized = positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const marginUsed = positions.reduce((sum, row) => sum + Math.abs(Number(row.avg || 0) * Number(row.qty || 0)), 0);
  setPaperLedger({
    funds: round2(PAPER_STARTING_FUNDS + realized + unrealized),
    marginUsed: round2(marginUsed),
  });
  for (const algo of state.algos || []) {
    if (algo.runMode !== "paper") continue;
    const openPnl = positions.filter((row) => row.strategy === algo.name).reduce((sum, row) => sum + Number(row.pnl || 0), 0);
    const closedPnl = closed.filter((row) => row.strategy === algo.name).reduce((sum, row) => sum + Number(row.pnl || 0), 0);
    const trades = closed.filter((row) => row.strategy === algo.name);
    const wins = trades.filter((row) => Number(row.pnl) > 0).length;
    algo.pnl = round2(openPnl + closedPnl);
    if (trades.length) algo.winRate = Math.round((wins / trades.length) * 100);
  }
}

function markPaperToMarket() {
  state.positions = (state.positions || []).map((row) => {
    if (!isPaperRow(row)) return row;
    const ltp = liveLtpForSymbol(row.symbol);
    if (!(ltp > 0)) return row;
    const dir = row.type === "BUY" ? 1 : -1;
    return { ...row, ltp, pnl: round2((ltp - row.avg) * row.qty * dir) };
  });
  syncPaperLedger();
}

export function snapshot() {
  markPaperToMarket();
  const brokers = publicBrokers();
  const active = getActiveBroker();
  const { orders, positions, closedTrades } = liveDesk();
  const totalPnl = positions.reduce((sum, row) => sum + row.pnl, 0);
  const byBroker = {};
  for (const row of positions) {
    const key = row.brokerId || "dhan";
    byBroker[key] = Number(((byBroker[key] || 0) + row.pnl).toFixed(2));
  }
  const { liveCandles: _liveCandles, closedTrades: _closedTrades, ...publicState } = clone(state);
  const liveState = { ...publicState, orders, positions, closedTrades };
  liveState.algos = (liveState.algos || []).map((algo) => ({ ...algo, trade: resolveAlgoTrade(algo) }));
  return {
    ...liveState,
    totalPnl: Number(totalPnl.toFixed(2)),
    pnlByBroker: byBroker,
    report: buildReport(liveState),
    brokers: brokers.brokers,
    activeBrokerId: brokers.activeBrokerId,
    mainBrokerId: brokers.mainBrokerId,
    dhanFeed: clone(state.dhanFeed),
    futures: publicFutures(),
    contracts: {
      indices: listIndexContracts().map(({ securityId, ...row }) => row),
      futures: publicFutures(),
      optionCount: optionCount(),
    },
    indices: publicIndices(publicState.indices),
    optionChain: publicOptionRows(publicState.optionChain),
    settings: { ...state.settings, broker: active.name },
    marketStatus: nseMarketSession().status,
    marketSession: nseMarketSession(),
    serverTime: new Date().toISOString(),
  };
}

export function toggleAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return null;
  if (algo.runMode === "backtest") {
    algo.enabled = false;
    algo.status = "BACKTEST";
    return { error: "Backtest strategies do not go live. Use Run backtest." };
  }
  const starting = !algo.enabled;
  if (starting && algo.runMode === "paper" && !isDhanFeedLive()) {
    return { error: "Paper trading uses the live Dhan feed. Connect Access Token on Brokers first." };
  }
  if (starting && algo.runMode === "live" && !isDhanFeedLive()) {
    return { error: "Start live needs Dhan LIVE — real CE/PE and futures orders only." };
  }
  algo.enabled = !algo.enabled;
  if (starting) {
    algo.lastPaperAt = 0;
    algo.lastLiveAt = 0;
    algo.lastLiveSide = "";
    algo.lastSignal = "WAIT";
    if (isNiftyOptionEngineAlgo(algo)) {
      const vs = runtimeState(algo);
      vs.inFlight = false;
      vs.exitQueued = false;
    }
  }
  if (algo.runMode === "paper") {
    algo.brokerId = "paper";
    algo.status = algo.enabled ? "PAPER" : "PAUSED";
  } else {
    algo.status = algo.enabled ? "LIVE" : "PAUSED";
  }
  return clone(algo);
}

export function createAlgo(payload) {
  const algo = normalizeAlgo(payload || {});
  algo.enabled = false;
  algo.status = algo.runMode === "backtest" ? "BACKTEST" : "PAUSED";
  algo.pnl = 0;
  algo.winRate = 0;
  if (algo.runMode === "paper" || algo.runMode === "backtest") algo.brokerId = "paper";
  state.algos.unshift(algo);
  state.notifications.unshift(`Strategy added: ${algo.name} · ${algo.runMode || "live"}`);
  return clone(algo);
}

export function updateAlgo(id, payload) {
  const index = state.algos.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Strategy not found" };
  const next = normalizeAlgo(payload || {}, state.algos[index]);
  next.id = id;
  state.algos[index] = next;
  state.notifications.unshift(`Strategy updated: ${next.name}`);
  return clone(next);
}

export function deleteAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Strategy not found" };
  state.algos = state.algos.filter((item) => item.id !== id);
  state.notifications.unshift(`Strategy deleted: ${algo.name}`);
  return { ok: true, id };
}

function candlesForBacktest(tf, allowSample = true) {
  const live = getCandles(tf || "5m");
  if (live.length >= 40) return { candles: live, sample: false };
  if (!allowSample) return { candles: live, sample: false };
  const price = Number(state.indices[0]?.price || 24580);
  const count = tf === "1m" ? 180 : tf === "15m" ? 96 : tf === "1H" ? 80 : 120;
  return { candles: generateCandles(count, price, 91), sample: true };
}

export function getAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  return algo ? clone(algo) : null;
}

function usableCandles(rows, fromMs, toMs) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      time: Number(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume || 0),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.time) &&
        Number.isFinite(row.close) &&
        row.close > 0 &&
        row.time >= fromMs - 86_400_000 &&
        row.time <= toMs + 86_400_000,
    )
    .sort((a, b) => a.time - b.time);
}

export function backtestAlgo(id, options = {}) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Strategy not found" };
  const window = resolveBacktestWindow(options);
  if (window.error) return { error: window.error };
  const niftyVwap = isNiftyOptionEngineAlgo(algo);
  const cfg = niftyVwap ? optionEngineConfig(algo) : null;
  const maxVwapDays = cfg?.barMinutes >= 15 ? 60 : 25;
  const vwapFrom = niftyVwap && window.days > maxVwapDays ? shiftYmd(window.to, -(maxVwapDays - 1)) : window.from;
  const vwapFromMs = Date.parse(`${vwapFrom}T09:15:00+05:30`);
  const wantedTf = niftyVwap ? cfg.timeframe : pickBacktestTimeframe(algo.timeframe, window.days);
  let candles = usableCandles(options.candles, niftyVwap ? vwapFromMs : window.fromMs, window.toMs);
  let sample = false;
  let source = "dhan";
  if (candles.length < 40) {
    const index =
      state.indices.find(
        (item) => item.name === algo.symbol || item.symbol === algo.symbol || String(item.symbol).startsWith(algo.symbol || "NIFTY"),
      ) || state.indices[0];
    candles = generateRangeCandles({
      from: niftyVwap ? vwapFrom : window.from,
      to: window.to,
      timeframe: wantedTf,
      startPrice: Number(index?.price || 24580),
      seed: 91 + String(algo.symbol || "NIFTY").length,
    });
    sample = true;
    source = "sample";
  }
  if (candles.length < 32) {
    return { error: "Not enough bars in that date range" };
  }
  const usedTf = niftyVwap ? cfg.timeframe : inferTimeframe(candles, wantedTf);
  const result = {
    ...(niftyVwap
      ? runNiftyVwapBacktest({ ...algo, vwapState: undefined }, candles)
      : runBacktest({ ...algo, timeframe: usedTf }, candles)),
    sample,
    source,
    range: window.range,
    from: niftyVwap ? vwapFrom : window.from,
    to: window.to,
    truncated: niftyVwap && window.days > maxVwapDays ? `${cfg.timeframe} replay last ${maxVwapDays} days` : "",
  };
  result.timeframe = usedTf;
  algo.lastBacktest = result;
  algo.pnl = result.pnl;
  algo.winRate = result.winRate;
  if (algo.runMode === "backtest") {
    algo.enabled = false;
    algo.status = "BACKTEST";
    algo.brokerId = "paper";
  }
  const rangeLabel = window.range === "1y" ? "last 1 year" : `${window.from} → ${window.to}`;
  state.notifications.unshift(
    `Backtest ${algo.name} (${rangeLabel}): ${result.trades} trades · P&L ₹${result.pnl} · WR ${result.winRate}%${sample ? " · sample bars" : ""}`,
  );
  return { ok: true, algo: clone(algo), backtest: result };
}

function runPaperAlgos() {
  const feedLive = Boolean(state.dhanFeed.live);
  noteNiftyVwapFeed(feedLive);
  const now = Date.now();
  for (const algo of state.algos) {
    if (!algo.enabled || algo.runMode !== "paper") continue;
    if (isNiftyOptionEngineAlgo(algo)) {
      tickNiftyVwapAlgo(algo, "paper", feedLive);
      continue;
    }
    if (!feedLive) continue;
    if (algo.lastPaperAt && now - algo.lastPaperAt < 60_000) continue;
    const pack = candlesForBacktest(algo.timeframe, false);
    if (pack.candles.length < 32) continue;
    const signal = evaluateSignals(pack.candles, pack.candles.length - 1, algo);
    const open = state.positions.find((row) => (row.paper || row.brokerId === "paper") && row.strategy === algo.name);
    if (open) {
      if ((open.type === "BUY" && signal.sell) || (open.type === "SELL" && signal.buy)) {
        squareOff(open.id);
        algo.lastPaperAt = now;
      }
      continue;
    }
    const wantBuy = signal.buy && (algo.side === "BUY" || algo.side === "BOTH");
    const wantSell = signal.sell && (algo.side === "SELL" || algo.side === "BOTH");
    if (!wantBuy && !wantSell) {
      algo.lastSignal = "HOLD";
      continue;
    }
    const trade = resolveAlgoTrade(algo);
    if (!trade?.ready || !(trade.ltp > 0)) {
      algo.lastSignal = "WAIT";
      continue;
    }
    const side = wantBuy ? "BUY" : "SELL";
    placeOrder({
      ...algoOrderFields(algo, side, trade),
      brokerId: "paper",
    });
    algo.lastPaperAt = now;
    algo.lastSignal = side;
  }
}

function runLiveAlgos() {
  const feedLive = Boolean(state.dhanFeed.live);
  const sessionOpen = nseMarketSession().open;
  const now = Date.now();
  for (const algo of state.algos) {
    if (!algo.enabled || algo.runMode !== "live") continue;
    if (isNiftyOptionEngineAlgo(algo)) {
      tickNiftyVwapAlgo(algo, "live", feedLive);
      continue;
    }
    if (!feedLive || !sessionOpen) continue;
    if (algo.lastLiveAt && now - algo.lastLiveAt < 60_000) continue;
    const pack = candlesForBacktest(algo.timeframe, false);
    if (pack.candles.length < 32) continue;
    const signal = evaluateSignals(pack.candles, pack.candles.length - 1, algo);
    const wantBuy = signal.buy && (algo.side === "BUY" || algo.side === "BOTH");
    const wantSell = signal.sell && (algo.side === "SELL" || algo.side === "BOTH");
    if (!wantBuy && !wantSell) {
      algo.lastSignal = "HOLD";
      continue;
    }
    const side = wantBuy ? "BUY" : "SELL";
    if (algo.lastLiveSide === side) continue;
    const trade = resolveAlgoTrade(algo);
    if (!trade) continue;
    if (trade.kind === "option" && !(trade.strike && trade.expiry)) {
      algo.lastSignal = "WAIT";
      continue;
    }
    if (trade.kind === "future" && !(trade.ltp > 0)) {
      algo.lastSignal = "WAIT";
      continue;
    }
    pendingLiveAlgoOrders.push({
      ...algoOrderFields(algo, side, trade),
      brokerId: "dhan",
    });
    algo.lastLiveAt = now;
    algo.lastLiveSide = side;
    algo.lastSignal = side;
  }
}

function mapLiveStatus(status) {
  const raw = String(status || "").toUpperCase();
  if (raw === "TRADED") return "FILLED";
  if (raw === "REJECTED" || raw === "CANCELLED") return raw;
  if (raw === "EXPIRED") return "CANCELLED";
  if (raw === "PART_TRADED") return "PARTIAL";
  if (raw === "PENDING" || raw === "TRANSIT") return "PENDING";
  return raw || "PENDING";
}

export function placeOrder(payload) {
  const brokers = publicBrokers();
  const requested = String(payload.brokerId || brokers.activeBrokerId || "dhan");
  const account = brokers.brokers.find((item) => item.id === requested);
  if (!account?.connected) {
    return { error: "Connect this broker before placing an order" };
  }
  const live = payload.live;
  const brokerId = account.id;
  const isPaper = brokerId === "paper";
  if (isPaper && !isDhanFeedLive()) {
    return { error: "Paper fills use live prices. Connect Dhan LIVE first." };
  }
  if (live?.orderId) {
    const existing = state.orders.find((row) => String(row.id) === String(live.orderId));
    if (existing) return existing;
  }
  const type = String(payload.type || "MARKET").toUpperCase();
  const qty = Number(payload.qty) || 65;
  const demoDhan = brokerId === "dhan" && !live;
  const livePrice = isPaper ? liveLtpForSymbol(payload.symbol) : 0;
  const price = Number(livePrice || payload.price) || 0;
  if (isPaper && !(price > 0)) {
    return { error: "No live LTP for that contract yet. Wait for the Dhan feed." };
  }
  const status = live ? mapLiveStatus(live.status) : type === "LIMIT" ? "PENDING" : "FILLED";
  const order = {
    id: live?.orderId ? String(live.orderId) : `o${Date.now()}`,
    symbol: payload.symbol || "NIFTY 24500 CE",
    side: payload.side === "SELL" ? "SELL" : "BUY",
    qty,
    filledQty: status === "FILLED" ? qty : Number(live?.filledQty || 0),
    product: payload.product || "MIS",
    type,
    status,
    price: price || Number(payload.price) || 0,
    strategy: String(payload.strategy || ""),
    brokerId,
    brokerName: live ? "Dhan" : demoDhan ? "Dhan (demo)" : account.name,
    live: Boolean(live),
    sim: !live && !isPaper,
    paper: isPaper,
    securityId: payload.securityId != null ? String(payload.securityId) : live?.securityId || "",
    reason: live
      ? `Sent to Dhan (${live.status || "submitted"}). Order ${live.orderId}`
      : demoDhan
        ? "Not sent to Dhan. Connect a live Access Token on Brokers, then BUY/SELL again."
        : brokerId === "paper"
          ? "Paper fill at live LTP"
          : "Desk fill at LTP",
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  if (status === "FILLED" && !live) {
    state.positions.unshift({
      id: `p${Date.now()}`,
      symbol: order.symbol,
      type: order.side,
      qty: order.qty,
      avg: order.price,
      ltp: order.price,
      pnl: 0,
      product: order.product,
      strategy: order.strategy,
      brokerId,
      openedAt: order.createdAt,
      sim: !isPaper,
      live: false,
      paper: isPaper,
    });
  }
  state.notifications.unshift(
    live
      ? `Dhan ${order.status}: ${order.side} ${order.symbol}`
      : demoDhan
        ? `Desk demo ${order.status}: ${order.side} ${order.symbol} (not sent to Dhan)`
        : `${account.name} ${order.status}: ${order.side} ${order.symbol}`,
  );
  if (isPaper) markPaperToMarket();
  return order;
}

export function cancelOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return { error: "Order not found" };
  if (order.status !== "PENDING" && order.status !== "PARTIAL") {
    return { error: "Only pending orders can be cancelled" };
  }
  order.status = "CANCELLED";
  order.filledQty = Number(order.filledQty || 0);
  state.notifications.unshift(`Cancelled ${order.side} ${order.symbol}`);
  return clone(order);
}

export function squareOff(id) {
  const index = state.positions.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Position not found" };
  const pos = state.positions[index];
  const brokers = publicBrokers();
  const account = brokers.brokers.find((item) => item.id === (pos.brokerId || brokers.activeBrokerId));
  if (!account?.connected) return { error: "Connect this broker before squaring off" };
  const dir = pos.type === "BUY" ? 1 : -1;
  const liveExit = isPaperRow(pos) ? liveLtpForSymbol(pos.symbol) : 0;
  const exit = Number(liveExit || pos.ltp || pos.avg);
  const pnl = Number(((exit - pos.avg) * pos.qty * dir).toFixed(2));
  const order = {
    id: `o${Date.now()}`,
    symbol: pos.symbol,
    side: pos.type === "BUY" ? "SELL" : "BUY",
    qty: pos.qty,
    filledQty: pos.qty,
    product: pos.product || "MIS",
    type: "MARKET",
    status: "FILLED",
    price: exit,
    strategy: pos.strategy || "",
    brokerId: account.id,
    brokerName: account.name,
    sim: !pos.paper,
    live: false,
    paper: Boolean(pos.paper || pos.brokerId === "paper"),
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  if (!Array.isArray(state.closedTrades)) state.closedTrades = [];
  state.closedTrades.unshift({
    id: `t${Date.now()}`,
    symbol: pos.symbol,
    side: pos.type,
    qty: pos.qty,
    entry: pos.avg,
    exit,
    pnl,
    product: pos.product || "MIS",
    strategy: pos.strategy || "",
    brokerId: account.id,
    closedAt: order.createdAt,
    sim: !pos.paper,
    live: false,
    paper: Boolean(pos.paper || pos.brokerId === "paper"),
  });
  state.positions.splice(index, 1);
  state.notifications.unshift(`Squared off ${pos.symbol} · ${pnl >= 0 ? "+" : ""}₹${Math.abs(pnl).toFixed(2)}`);
  if (isPaperRow(pos)) markPaperToMarket();
  return { ok: true, order, pnl };
}

export function replaceDhanOrders(rows) {
  const incoming = Array.isArray(rows) ? rows : [];
  const others = state.orders.filter((row) => row.brokerId !== "dhan");
  state.orders = [...incoming, ...others];
}

export function assignAlgoBroker(id, brokerId) {
  const account = publicBrokers().brokers.find((item) => item.id === brokerId);
  if (!account?.connected) return { error: "Connect this broker first" };
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Algo not found" };
  if (algo.runMode === "paper" || algo.runMode === "backtest") {
    algo.brokerId = "paper";
    return clone(algo);
  }
  algo.brokerId = brokerId;
  return clone(algo);
}

export function applyBrokerPositions(positions, brokerId) {
  const existing = new Set(state.positions.map((row) => row.id));
  for (const row of positions) {
    if (!existing.has(row.id)) state.positions.push({ ...row, sim: true, live: false, brokerId: row.brokerId || brokerId });
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
  const wanted = normalizeExpiry(expiry);
  let expiries = upcomingExpiries(meta.id);
  if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && !expiries.includes(wanted)) {
    expiries = [...expiries, wanted].sort();
  }
  const chosen = wanted && expiries.includes(wanted) ? wanted : expiries[0];
  const spot = getChainSpot(meta.id);
  const rows = buildSyntheticChain(spot, meta.step, 10);
  const stats = chainStats(rows, spot);
  state.optionChain = rows;
  state.optionMeta = withExpiryLabels({
    symbol: meta.id,
    expiry: chosen,
    expiries,
    ...stats,
    source: "demo",
    lastAt: Date.now(),
    contractIds: 0,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  });
  rememberOptionChain(meta.id, rows, state.optionMeta);
  return clone(state.optionMeta);
}

export function setOptionDesk({ symbol, expiry, expiries, rows, spot, source }) {
  const meta = getUnderlying(symbol || state.optionMeta.symbol);
  const nextRows = Array.isArray(rows) && rows.length ? rows : state.optionChain;
  const nextSpot = Number(spot) || getChainSpot(meta.id);
  const stats = chainStats(nextRows, nextSpot);
  state.optionChain = nextRows;
  state.optionMeta = withExpiryLabels({
    ...state.optionMeta,
    symbol: meta.id,
    expiry: expiry || state.optionMeta.expiry,
    expiries: expiries?.length ? expiries : state.optionMeta.expiries,
    ...stats,
    source: source || state.optionMeta.source,
    lastAt: Date.now(),
    contractIds: nextRows.filter((row) => row.callId || row.putId).length,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  });
  rememberOptionChain(meta.id, nextRows, state.optionMeta);
  return clone(state.optionMeta);
}

export function currentOptionRows() {
  return state.optionChain;
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
  const now = Date.now();
  state.liveCandles = [
    {
      time: now,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    },
  ];
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
      volume: 0,
    });
    if (state.liveCandles.length > 400) state.liveCandles.shift();
    return;
  }
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
}

function dayChange(index, quote, ltp) {
  const net = Number(quote.netChange);
  const close = Number(quote.close);
  const open = Number(quote.open);
  const high = Number(quote.high);
  const quotedPrev = sanePrevClose(ltp, quote.prevClose);
  const storedPrev = sanePrevClose(ltp, index.prevClose);
  const ohlcPrev = close > 0 && Math.abs(close - ltp) > 0.05 ? sanePrevClose(ltp, close) : null;
  const hasSession = open > 0 || high > 0 || Number(quote.low) > 0;

  const last = Number(index.price);
  const jumped = last > 0 && Math.abs(ltp - last) / last > 0.004;
  let prevClose = quotedPrev || ohlcPrev || (jumped ? null : storedPrev);
  let change = index.change;
  if (Number.isFinite(net) && quote.netChange != null && (Math.abs(net) > 0.0001 || hasSession)) {
    change = round2(net);
    prevClose = round2(ltp - net);
  } else if (prevClose) {
    change = round2(ltp - prevClose);
  } else {
    change = 0;
    prevClose = round2(ltp);
  }
  const changePct = round2(prevClose ? (change / prevClose) * 100 : 0);
  return { prevClose, change, changePct };
}

export function applyLiveQuotes(quotes) {
  const indexPrev = Object.fromEntries(state.indices.map((item) => [item.symbol, item.price]));

  for (const quote of quotes) {
    const indexSymbol = INDEX_ALIASES[quote.parent || quote.symbol] || quote.symbol;
    const index = state.indices.find((item) => item.symbol === indexSymbol);
    const ltp = Number(quote.ltp);
    if (index && quote.kind === "future" && Number.isFinite(ltp) && ltp > 0) {
      index.future = round2(ltp);
      if (quote.securityId) index.futureId = String(quote.securityId);
      if (quote.expiry) index.futureExpiry = quote.expiry;
      const futVwap = Number(quote.vwap);
      if (futVwap > 0) {
        index.futureVwap = round2(futVwap);
        index.vwap = round2(futVwap);
      }
      continue;
    }
    if (index && Number(quote.prevClose) > 0 && !(Number.isFinite(ltp) && ltp > 0)) {
      const prev = sanePrevClose(index.price, quote.prevClose);
      if (prev) {
        index.prevClose = prev;
        index.change = round2(index.price - prev);
        index.changePct = round2(prev ? (index.change / prev) * 100 : 0);
      }
      continue;
    }
    if (!Number.isFinite(ltp) || ltp <= 0) continue;
    if (index) {
      const day = dayChange(index, quote, ltp);
      const vwap = Number(quote.vwap);
      index.price = round2(ltp);
      index.change = day.change;
      index.changePct = day.changePct;
      index.prevClose = day.prevClose;
      if (!(index.futureVwap > 0)) {
        if (vwap > 0) index.vwap = round2(vwap);
        else if (!(index.vwap > 0) || Math.abs(index.vwap - ltp) / ltp > 0.012) {
          index.vwap = round2(ltp - Math.max(2, ltp * 0.00032));
        }
      }
      if (!(index.future > 0) || Math.abs(index.future - ltp) / ltp > 0.012) {
        index.future = round2(ltp + Math.max(6, ltp * 0.00085));
      }
      if (quote.securityId) index.securityId = Number(quote.securityId) || index.securityId;
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

  if (!state.dhanFeed.live) {
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
  }

  const nifty = state.indices.find((item) => item.symbol === "NIFTY 50");
  if (nifty && indexPrev["NIFTY 50"] && state.optionMeta?.source !== "dhan") {
    const move = nifty.price - indexPrev["NIFTY 50"];
    state.optionChain = state.optionChain.map((row) => ({
      ...row,
      callLtp: round2(Math.max(0.05, row.callLtp + move * 0.08)),
      putLtp: round2(Math.max(0.05, row.putLtp - move * 0.08)),
    }));
  }
  runPaperAlgos();
  runLiveAlgos();
  markPaperToMarket();
}

export function getCandles(tf = "5m") {
  if (state.dhanFeed.live) {
    if (!state.liveCandles.length) return [];
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
