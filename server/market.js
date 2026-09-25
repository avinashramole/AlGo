import { getActiveBroker, isKnownLiveBroker, isLiveBrokerReady, PAPER_STARTING_FUNDS, publicBrokers, setPaperLedger } from "./brokers.js";
import { dhanTokenStatus } from "./dhanToken.js";
import { dropStrategyFromMemberDesks, liveAutoTradeBrokers } from "./memberDesk.js";
import { deleteStrategyEnrollments } from "./subscriptions.js";
import { dispatchMemberCopies, dispatchMemberExitCopies, memberCopyPayloads } from "./liveCopy.js";
import {
  UNDERLYINGS,
  atmStrike,
  buildSyntheticChain,
  chainStats,
  dropExpired,
  exchangeSegmentFor,
  getUnderlying,
  nearestWeeklyExpiry,
  normalizeExpiry,
  isWeeklyOptionExpiry,
  upcomingExpiries,
  withExpiryLabels,
  keepStrikeWindow,
} from "./optionChain.js";
import { listIndexContracts, optionCount, parseOptionContract, publicFutures, publicIndices, publicOptionRows } from "./frontFutures.js";
import { optionBacktestWindow } from "./niftyOptionHistory.js";
import { aggregateIndexBars } from "./indexHistory.js";
import { runReplayInWorker } from "./backtestJob.js";
import { isOptionContract, isSaneOptionLtp, markContractToMarket, preferMarkLtp } from "./positionMark.js";
import { buildReport } from "./desk.js";
import { evaluateSignals, runBacktest } from "./backtest.js";
import { listPublicUsers } from "./auth.js";
import { loadAlgoStore, mappedClientIdsForMembers, normalizeAlgo, saveAlgoStore } from "./strategies.js";
import { canonicalStrategyName, realStrategyName, rememberOrderStrategy, resolveOrderStrategy, strategyForPlacedOrder } from "./orderStrategy.js";
import { isDhanBrokerReject } from "./dhanPlaceError.js";
import {
  isNiftyFirstCandleAlgo,
  isNiftyOptionEngineAlgo,
  isNiftyVwapReversalAlgo,
  LiveTradingAdapter,
  NiftyVwapStrategy,
  noteBrokerRejection,
  noteFeedReconnect,
  optionEngineConfig,
  parseIstHm,
  PaperTradingAdapter,
  PositionManager,
  runtimeState,
  runNiftyVwapBacktest,
  VwapSignalEngine,
} from "./niftyVwap/index.js";
import {
  isNiftyVwapHedgeAlgo,
  niftyVwapHedgeConfig,
  NiftyVwapHedgeStrategy,
  noteHedgeBrokerRejection,
  runNiftyVwapHedgeBacktest,
  hedgeState,
  hedgePreviewTrade,
  hedgeReversalFromBars,
} from "./niftyVwapHedge/index.js";
import {
  applyHedgeDailyLive,
  applyFirstCandleDailyLive,
  loadHedgeDailyLiveArmedYmd,
  saveHedgeDailyLiveArmedYmd,
  loadFirstCandleDailyLiveArmedYmd,
  saveFirstCandleDailyLiveArmedYmd,
} from "./niftyVwapHedge/dailyLive.js";
import { dhanOrderFillPrice, mergeDhanOrderPrice, resolveLiveBookPrice } from "./dhanOrderPrice.js";
import { dayChangeFromQuote } from "./quoteDayChange.js";
import {
  buildFeaturedSignal,
  buildLiveDna,
  buildLiveSignals,
  emptyFiiDii,
  indexWatchRows,
  liveSentiment,
} from "./liveSignals.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const algoStore = loadAlgoStore();
let removedAlgoIds = [...(algoStore.removedIds || [])];

function persistAlgos() {
  try {
    saveAlgoStore(clone(state.algos || []), [...removedAlgoIds]);
  } catch (error) {
    console.log(`Could not save strategies: ${error.message || error}`);
  }
}

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

function sessionParts(date = new Date()) {
  return Object.fromEntries(
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
}

function clockSession(date, openMins, closeMins, hours) {
  const parts = sessionParts(date);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
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
    hours,
    weekday: parts.weekday,
    ist: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function nseMarketSession(date = new Date()) {
  return clockSession(date, 9 * 60 + 15, 15 * 60 + 30, "09:15–15:30 IST");
}

export function firstCandleWatchSession(algo = {}, date = new Date()) {
  const cfg = optionEngineConfig(algo);
  const start = parseIstHm(cfg.dailyLiveIst || cfg.firstBarStartIst, "09:00");
  const [hour, minute] = start.split(":").map(Number);
  return clockSession(date, hour * 60 + minute, 15 * 60 + 30, `${start}–15:30 IST`);
}

export function mcxMarketSession(date = new Date()) {
  return clockSession(date, 9 * 60, 23 * 60 + 30, "09:00–23:30 IST");
}

export function isCrudeSymbol(symbol) {
  return String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .includes("CRUDEOIL");
}

export function candleSymbol(symbol) {
  const raw = String(symbol || "NIFTY")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (raw.includes("CRUDEOIL")) return "CRUDEOIL";
  if (raw.includes("BANKNIFTY")) return "BANKNIFTY";
  if (raw.includes("FINNIFTY")) return "FINNIFTY";
  if (raw.includes("SENSEX")) return "SENSEX";
  return "NIFTY";
}

function sessionOpenForAlgo(algo) {
  return isCrudeSymbol(algo?.symbol) ? mcxMarketSession().open : nseMarketSession().open;
}

export function liveSessionOpenForOrder(payload = {}, date = new Date()) {
  const segment = String(payload.exchangeSegment || exchangeSegmentFor(payload.symbol) || "");
  if (segment === "MCX_COMM" || isCrudeSymbol(payload.symbol)) return mcxMarketSession(date).open;
  return nseMarketSession(date).open;
}

export function routeManualOrderBrokerId(payload = {}, options = {}) {
  const requested = String(payload.brokerId || options.activeBrokerId || "dhan");
  const chainClick =
    String(payload.kind || "") === "option" ||
    String(payload.kind || "") === "future" ||
    Boolean(String(payload.securityId || "").trim());
  if (options.dhanLive === true && chainClick && requested === "paper") return "dhan";
  return requested;
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
  if (tf === "1m" && Number(days) > 14) return "5m";
  return tf;
}

function tfMinutesForSample(tf) {
  const raw = String(tf || "5m");
  if (raw === "1m") return 1;
  if (raw === "15m") return 15;
  if (raw === "1H" || raw === "1h") return 60;
  if (raw === "1D" || raw === "1d") return 390;
  return 5;
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
  const rand = seeded(Number(seed) + tfMinutesForSample(timeframe));
  const days = tradingDays(from, to);
  const slots = sessionSlots(timeframe);
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
    emptyDeskIndex("NIFTY 50", "NIFTY"),
    emptyDeskIndex("BANKNIFTY", "BANKNIFTY"),
    emptyDeskIndex("FINNIFTY", "FINNIFTY"),
    emptyDeskIndex("SENSEX", "SENSEX"),
    emptyDeskIndex("CRUDEOIL", "CRUDE OIL"),
    emptyDeskIndex("INDIA VIX", "VIX"),
  ],
  ohlc: { open: 0, high: 0, low: 0, close: 0 },
  dnaScores: [
    { label: "Trend", value: 0 },
    { label: "Momentum", value: 0 },
    { label: "Buy Pressure", value: 0 },
    { label: "Volatility", value: 0 },
    { label: "OI Build", value: 0 },
    { label: "PCR", value: 0 },
  ],
  optionChain: [],
  optionMeta: withExpiryLabels({
    symbol: "NIFTY",
    expiry: upcomingExpiries("NIFTY")[0] || "",
    expiries: upcomingExpiries("NIFTY"),
    spot: 0,
    pcr: 0,
    maxPain: 0,
    atmIv: 0,
    source: "idle",
    lastAt: null,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  }),
  algos: algoStore.algos,
  positions: [],
  signals: [],
  watchlist: [],
  fiiDii: {
    fii: { buy: 0, sell: 0, net: 0 },
    dii: { buy: 0, sell: 0, net: 0 },
  },
  marketWatch: [],
  featuredSignal: {
    action: "BUY",
    symbol: "",
    strategy: "",
    expiry: "—",
    confidence: 0,
    risk: "—",
    metrics: [
      { label: "VWAP", value: 0 },
      { label: "DEPTH", value: 0 },
      { label: "OI", value: 0 },
      { label: "VOLUME", value: 0 },
    ],
  },
  sentiment: 50,
  orders: [],
  closedTrades: [],
  notifications: [],
  chat: [],
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
const liveCandleCache = new Map();
const pendingLiveAlgoOrders = [];

function rememberOptionChain(symbol, rows, meta) {
  const id = String(symbol || "").toUpperCase();
  if (!id || !Array.isArray(rows) || !rows.length) return;
  optionChainCache.set(id, { rows, meta, at: Date.now() });
}

function seedCachedChains() {
  if (Array.isArray(state.optionChain) && state.optionChain.length) {
    rememberOptionChain(state.optionMeta.symbol, state.optionChain, state.optionMeta);
  }
}

seedCachedChains();

function chainForSymbol(symbol) {
  const id = String(symbol || "").toUpperCase();
  if (String(state.optionMeta?.symbol || "").toUpperCase() === id && Array.isArray(state.optionChain) && state.optionChain.length) {
    return { rows: state.optionChain, meta: state.optionMeta };
  }
  return optionChainCache.get(id) || null;
}

export function optionRowsForSymbol(symbol) {
  return chainForSymbol(candleSymbol(symbol))?.rows || [];
}

export function peekOptionChain(symbol) {
  return optionChainCache.get(String(symbol || "").toUpperCase()) || null;
}

export function drainPendingLiveAlgoOrders() {
  return pendingLiveAlgoOrders.splice(0, pendingLiveAlgoOrders.length);
}

function liveOrderSide(row) {
  return row?.side === "SELL" ? "SELL" : "BUY";
}

function sameLiveContract(left, right) {
  if (left?.symbol && right?.symbol && left.symbol === right.symbol) return true;
  const a = PositionManager.niftyOptionLeg(left);
  const b = PositionManager.niftyOptionLeg(right);
  return Boolean(a && b && Number(a.strike) === Number(b.strike) && a.option === b.option);
}

function orderBrokerId(row) {
  return String(row?.brokerId || "dhan").trim().toLowerCase() || "dhan";
}

function enqueueLiveAlgoOrder(payload) {
  const strategy = String(payload?.strategy || "");
  const side = liveOrderSide(payload);
  const role = String(payload?.role || "");
  const brokerId = orderBrokerId(payload);
  const allowHedge = payload?.allowHedge === true && role === "hedge";
  const copyUserId = String(payload?.copyUserId || "");
  const sameCopy = (row) => String(row?.copyUserId || "") === copyUserId;
  const sameContractPending = pendingLiveAlgoOrders.some(
    (row) =>
      sameCopy(row) && orderBrokerId(row) === brokerId && liveOrderSide(row) === side && sameLiveContract(payload, row),
  );
  if (sameContractPending) {
    return { ok: true, queued: false, status: "PENDING", duplicate: true };
  }
  const sameStrategyRole = pendingLiveAlgoOrders.some((row) => {
    if (!sameCopy(row)) return false;
    if (orderBrokerId(row) !== brokerId) return false;
    if (!strategy || row.strategy !== strategy) return false;
    if (liveOrderSide(row) !== side) return false;
    return String(row.role || "") === role;
  });
  if (sameStrategyRole) {
    return { ok: true, queued: false, status: "PENDING", duplicate: true };
  }
  if (side === "BUY" && allowHedge) {
    const pendingStrategyBuy = pendingLiveAlgoOrders.some(
      (row) =>
        sameCopy(row) && orderBrokerId(row) === brokerId && row.strategy === strategy && liveOrderSide(row) === "BUY",
    );
    if (pendingStrategyBuy) {
      return { ok: true, queued: false, status: "PENDING", duplicate: true };
    }
  } else if (side === "BUY") {
    const niftyBuy = Boolean(PositionManager.niftyOptionLeg(payload));
    const openSameStrategy =
      !copyUserId &&
      niftyBuy &&
      strategy &&
      (state.positions || []).some(
        (row) =>
          !isPaperRow(row) &&
          orderBrokerId(row) === brokerId &&
          PositionManager.isOpenNiftyOption(row) &&
          realStrategyName(row.strategy) === strategy,
      );
    if (openSameStrategy) {
      return { ok: true, queued: false, status: "PENDING", duplicate: true };
    }
  }
  pendingLiveAlgoOrders.push({ ...payload, brokerId, copyUserId });
  return { ok: true, queued: true, status: "PENDING" };
}

export function fanOutAdminOrderCopies(payload = {}, order = {}) {
  if (payload.copyUserId || payload.copiedToMembers || order?.copiedToMembers) return { queued: false, copies: 0 };
  const next = {
    ...payload,
    strategy: String(order.strategy || payload.strategy || "").trim(),
    qty: order.qty || payload.qty,
    side: order.side || payload.side,
    symbol: order.symbol || payload.symbol,
    price: order.price || payload.price,
  };
  const copies = memberCopyPayloads(next, { mappingScope: "both", mappedClientIds: [] });
  if (!copies.length) {
    console.log(
      `Copy fan-out: 0 members for ${next.side || "?"} ${next.symbol || "order"} — Copy ON + saved token copies even if the user is logged off`,
    );
  }
  dispatchMemberCopies(next, { mappingScope: "both", mappedClientIds: [] });
  if (order && typeof order === "object") order.copiedToMembers = true;
  return { queued: true, copies: copies.length };
}

export function queueLiveAlgoOrder(payload) {
  const brokers = liveAutoTradeBrokers({
    strategyName: payload?.strategy,
    algoBrokerId: payload?.brokerId || "dhan",
  });
  const targets = brokers.length ? brokers : [orderBrokerId(payload)];
  let primary = { ok: true, queued: false, status: "PENDING" };
  for (const brokerId of targets) {
    const result = enqueueLiveAlgoOrder({ ...payload, brokerId });
    if (!primary.queued) primary = result;
  }
  const algo = (state.algos || []).find((row) => String(row.name || "") === String(payload?.strategy || ""));
  for (const copy of memberCopyPayloads(payload, algo || {})) {
    enqueueLiveAlgoOrder(copy);
  }
  return primary;
}

export function queueLivePositionExit(pos) {
  if (!pos) return { error: "Position not found" };
  const strategy =
    resolveOrderStrategy(pos, {
      previous: state.orders || [],
      algos: state.algos || [],
      positions: state.positions || [],
    }) || realStrategyName(pos.strategy);
  return queueLiveAlgoOrder({
    symbol: pos.symbol,
    name: pos.symbol,
    side: pos.type === "BUY" ? "SELL" : "BUY",
    qty: Math.abs(Number(pos.qty) || 0),
    product: pos.product || "MIS",
    type: "MARKET",
    securityId: pos.securityId,
    strategy,
    brokerId: pos.brokerId && pos.brokerId !== "paper" ? pos.brokerId : "dhan",
    strike: pos.strike,
    option: pos.option,
    expiry: pos.expiry,
    kind: pos.kind || (pos.option ? "option" : undefined),
    exchangeSegment: exchangeSegmentFor(pos.symbol),
  });
}

export function noteLiveAlgoOrderResult(payload, live, error) {
  const name = realStrategyName(payload?.strategy) || String(payload?.strategy || "");
  if (!name) return;
  const algo = (state.algos || []).find(
    (item) => item.name === name && (isNiftyOptionEngineAlgo(item) || isNiftyVwapHedgeAlgo(item)),
  );
  if (!algo) return;
  rememberOrderStrategy(
    { id: live?.orderId, securityId: live?.securityId || payload?.securityId, strategy: name },
    name,
  );
  if (isNiftyVwapHedgeAlgo(algo) && live?.orderId) {
    hedgeState(algo).lastOrderId = String(live.orderId);
  }
  const status = String(live?.status || "").toUpperCase();
  if (error || status === "REJECTED" || status === "CANCELLED") {
    if (isNiftyVwapHedgeAlgo(algo)) noteHedgeBrokerRejection(algo);
    else noteBrokerRejection(algo);
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
  const weeklyFirstCandle = isNiftyFirstCandleAlgo(algo) && String(algo.expiryKind || "weekly").toLowerCase() !== "monthly";
  if (isNiftyVwapReversalAlgo(algo) || isNiftyVwapHedgeAlgo(algo) || weeklyFirstCandle) {
    return nearestWeeklyExpiry(listed, "NIFTY") || listed[0] || "";
  }
  return pack?.meta?.expiry || listed[0] || "";
}

function preferWeeklyDeskForReversal() {
  const running = (state.algos || []).some(
    (algo) =>
      (isNiftyVwapReversalAlgo(algo) ||
        isNiftyVwapHedgeAlgo(algo) ||
        (isNiftyFirstCandleAlgo(algo) && String(algo.expiryKind || "weekly").toLowerCase() !== "monthly")) &&
      algo.enabled,
  );
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
    if (row.strategy && row.strategy !== algo.name) return false;
    if (row.strategy === algo.name) return true;
    if (vs.lockedSymbol && row.symbol === vs.lockedSymbol) return true;
    if (PositionManager.isOpenNiftyOption(row)) return true;
    return false;
  };
  const rows = state.positions || [];
  if (mode === "paper") return rows.filter((row) => isPaperRow(row) && mine(row));
  return rows.filter((row) => !isPaperRow(row) && mine(row));
}

function positionsForHedge(algo, mode) {
  const rows = state.positions || [];
  const mine = (row) => {
    const tagged = realStrategyName(row.strategy);
    if (tagged && tagged !== algo.name) return false;
    if (tagged === algo.name) return true;
    const hs = algo.hedgeState || {};
    const active = hs.inFlight || (hs.phase && hs.phase !== "IDLE") || hs.primarySide;
    if (!active || tagged || !PositionManager.isOpenNiftyOption(row)) return false;
    if (row.option && hs.hedgeSide && row.option === hs.hedgeSide) return true;
    if (row.option && hs.primarySide && row.option === hs.primarySide) return true;
    return !row.option;
  };
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

export function liveOptionSampleTime(now, barMinutes = 5, sessionOpen) {
  const open = VwapSignalEngine.sessionBarOpenMs(now, barMinutes, {
    sessionOpenMinutes: sessionOpen,
  });
  return open || 0;
}

function tickNiftyVwapAlgo(algo, mode, feedLive) {
  const now = Date.now();
  const session = isNiftyFirstCandleAlgo(algo) ? firstCandleWatchSession(algo) : nseMarketSession();
  const config = optionEngineConfig(algo);
  const vs = runtimeState(algo);
  const positions = positionsForNiftyVwap(algo, mode);
  const open = PositionManager.openFor(positions, algo.name, vs);
  if (mode === "live" && !session.open && !open) return;
  if (isNiftyVwapReversalAlgo(algo) || (isNiftyFirstCandleAlgo(algo) && config.expiryKind !== "monthly")) {
    preferWeeklyDeskForReversal();
  }
  const futuresBars = feedLive ? getCandles(config.timeframe || "5m") : [];
  const lastBar = futuresBars[futuresBars.length - 1];
  const barTime = lastBar ? Number(lastBar.time) : 0;
  const und = getUnderlying("NIFTY");
  const pack = chainForSymbol("NIFTY");
  const expiry = expiryForNiftyVwap(algo, pack);
  if (
    (isNiftyVwapReversalAlgo(algo) || (isNiftyFirstCandleAlgo(algo) && config.expiryKind !== "monthly")) &&
    expiry &&
    !isWeeklyOptionExpiry(expiry, "NIFTY") &&
    !open
  ) {
    if (!positions.some((row) => PositionManager.isOpenNiftyOption(row))) {
      algo.lastSignal = "WAIT WEEKLY EXPIRY";
      return;
    }
  }
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
  const sampleTime =
    liveOptionSampleTime(
      now,
      Number(config.barMinutes) || 5,
      config.signalMode === "first-candle" ? config.firstBarStartIst : undefined,
    ) || barTime;
  vs.ceBars = upsertOptionBar(vs.ceBars, sampleTime, ceLtp);
  vs.peBars = upsertOptionBar(vs.peBars, sampleTime, peLtp);
  if (feedLive && !open && !futuresBars.length) {
    algo.lastSignal = "WAIT CANDLES";
    return;
  }
  const ceSecurityId = optionLegId(ceStrike, "CE");
  const peSecurityId = optionLegId(peStrike, "PE");
  const adapter =
    mode === "live"
      ? LiveTradingAdapter({
          queueLiveOrder: (payload) => queueLiveAlgoOrder({ ...payload, brokerId: algo.brokerId || "dhan" }),
          squareOff,
        })
      : PaperTradingAdapter({ placeOrder, squareOff });
  const beforeTrades = Number(vs.sessionTrades || 0);
  const beforeBar = Number(vs.lastEntryBarTime || 0);
  const beforeProcessed = Number(vs.processedFirstBarTime || 0);
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
    ceSecurityId,
    peSecurityId,
    positions,
    adapter,
  });
  if (
    isNiftyFirstCandleAlgo(algo) &&
    (Number(vs.sessionTrades || 0) !== beforeTrades ||
      Number(vs.lastEntryBarTime || 0) !== beforeBar ||
      Number(vs.processedFirstBarTime || 0) !== beforeProcessed)
  ) {
    persistAlgos();
  }
}

function optionLegId(strike, option) {
  const pack = chainForSymbol("NIFTY");
  const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
  if (!row) return "";
  const id = option === "PE" ? row.putId || row.putSecurityId : row.callId || row.callSecurityId;
  return id ? String(id) : "";
}

function hedgeCapital(mode) {
  if (mode === "paper") return PAPER_STARTING_FUNDS;
  const dhan = publicBrokers().brokers.find((row) => row.id === "dhan");
  const funds = Number(dhan?.funds);
  return funds > 0 ? funds : PAPER_STARTING_FUNDS;
}

function cancelPendingForStrategy(strategy) {
  for (let i = pendingLiveAlgoOrders.length - 1; i >= 0; i -= 1) {
    if (pendingLiveAlgoOrders[i].strategy === strategy) pendingLiveAlgoOrders.splice(i, 1);
  }
  for (const row of state.orders || []) {
    if (row.strategy === strategy && (row.status === "PENDING" || row.status === "PARTIAL")) {
      cancelOrder(row.id);
    }
  }
  return { ok: true };
}

function hedgeAdapter(mode, algo) {
  const base =
    mode === "live"
      ? LiveTradingAdapter({
          queueLiveOrder: (payload) => queueLiveAlgoOrder({ ...payload, brokerId: algo.brokerId || "dhan" }),
          squareOff,
        })
      : PaperTradingAdapter({ placeOrder, squareOff });
  const withName = (payload = {}) => ({
    ...payload,
    strategy: realStrategyName(payload.strategy) || algo.name || "NIFTY 15m VWAP hedge",
  });
  return {
    ...base,
    place(payload) {
      return base.place(withName(payload));
    },
    exit(position) {
      return base.exit(withName(position));
    },
    cancelPending({ strategy } = {}) {
      return cancelPendingForStrategy(strategy || algo.name);
    },
  };
}

function tickNiftyVwapHedgeAlgo(algo, mode, feedLive) {
  const now = Date.now();
  const session = nseMarketSession();
  const config = niftyVwapHedgeConfig(algo);
  const positions = positionsForHedge(algo, mode);
  const open = positions.some((row) => Number(row.qty) > 0);
  if (mode === "live" && !session.open && !open) return;
  preferWeeklyDeskForReversal();
  const futuresBars = feedLive ? getCandles("1m") : [];
  const lastBar = futuresBars[futuresBars.length - 1];
  const und = getUnderlying("NIFTY");
  const pack = chainForSymbol("NIFTY");
  const expiry = expiryForNiftyVwap(algo, pack);
  if (expiry && !isWeeklyOptionExpiry(expiry, "NIFTY") && !open) {
    algo.lastSignal = "WAIT WEEKLY EXPIRY";
    return;
  }
  const hs = hedgeState(algo);
  const { reversal, bar } = hedgeReversalFromBars(futuresBars, now);
  const spot = Number(reversal.close) || Number(bar?.close) || Number(getChainSpot("NIFTY")) || Number(lastBar?.close) || 0;
  const atm = Number(hs.primaryStrike) > 0 ? Number(hs.primaryStrike) : atmStrike(spot, und.step);
  const ceLtp = optionPremium("NIFTY", atm, "CE", expiry);
  const peLtp = optionPremium("NIFTY", atm, "PE", expiry);
  const liveChain = pack?.meta?.source === "dhan";
  const ceId = optionLegId(atm, "CE");
  const peId = optionLegId(atm, "PE");
  const pending = pendingLiveAlgoOrders.filter((row) => row.strategy === algo.name);
  const orders = (state.orders || []).filter((row) => row.strategy === algo.name);
  NiftyVwapHedgeStrategy.tick({
    algo,
    config,
    now,
    feedLive: Boolean(feedLive),
    futuresBars,
    spot,
    step: und.step,
    expiry,
    ceLtp,
    peLtp,
    capital: hedgeCapital(mode),
    positions,
    orders,
    pending,
    requireSecurityId: liveChain,
    ceSecurityId: ceId,
    peSecurityId: peId,
    adapter: hedgeAdapter(mode, algo),
  });
}

function algoOrderFields(algo, side, trade) {
  return {
    symbol: trade.symbol,
    side,
    qty: algo.qty || 65,
    lots: algo.lots || 1,
    lotSize: algo.lotSize,
    price: trade.ltp || 0,
    kind: trade.kind,
    option: trade.option,
    strike: trade.strike,
    expiry: trade.expiry,
    securityId: trade.securityId || "",
    product: "MIS",
    type: "MARKET",
    strategy: algo.name,
    exchangeSegment: exchangeSegmentFor(trade.symbol || algo.symbol),
  };
}

function resolveHedgeAlgoTrade(algo) {
  const symbol = "NIFTY";
  const und = getUnderlying(symbol);
  const pack = chainForSymbol(symbol);
  const hs = algo.hedgeState || {};
  const ones = getCandles("1m");
  const { reversal } = hedgeReversalFromBars(ones.length ? ones : getCandles("15m"));
  const preview = hedgePreviewTrade({
    reversal,
    primarySide: hs.primarySide,
    primaryStrike: hs.primaryStrike,
    step: und.step,
  });
  const strike =
    Number(preview.strike) || atmStrike(Number(pack?.meta?.spot) || getChainSpot(symbol), und.step);
  const option = preview.option === "PE" ? "PE" : preview.option === "CE" ? "CE" : "";
  const expiry =
    nearestWeeklyExpiry(niftyListedExpiries(pack), "NIFTY") || pack?.meta?.expiry || upcomingExpiries(und.id)[0] || "";
  const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
  const ceLtp = Number(row?.callLtp);
  const peLtp = Number(row?.putLtp);
  const liveChain = pack?.meta?.source === "dhan";
  const premium = option === "PE" ? peLtp : option === "CE" ? ceLtp : 0;
  const contract = option ? `${symbol} ${strike} ${option}` : preview.label || `${symbol} weekly ATM CE/PE`;
  const weeklyReady =
    !expiry || !pack?.meta?.expiry || normalizeExpiry(pack.meta.expiry) === normalizeExpiry(expiry);
  let hint = preview.reason;
  if (!liveChain) hint = [preview.reason, `Open Options on ${symbol} for live ATM CE/PE`].filter(Boolean).join(" · ");
  else if (expiry && pack?.meta?.expiry && normalizeExpiry(pack.meta.expiry) !== normalizeExpiry(expiry)) {
    hint = [preview.reason, `Waiting for weekly ${expiry} chain (not monthly)`].filter(Boolean).join(" · ");
  } else if (!row && strike) hint = [preview.reason, `No ${strike} ATM on the ${symbol} tape yet`].filter(Boolean).join(" · ");
  else if (option && !(premium > 0)) hint = [preview.reason, "Waiting for live ATM option LTP"].filter(Boolean).join(" · ");
  return {
    kind: "option",
    symbol: contract,
    option,
    strike,
    expiry,
    ltp: premium > 0 && weeklyReady ? round2(premium) : 0,
    label: expiry ? `${contract} · ${expiry}` : contract,
    source: pack?.meta?.source || "",
    ready: liveChain && weeklyReady && (option ? premium > 0 : ceLtp > 0 || peLtp > 0),
    hint,
  };
}

export function resolveAlgoTrade(algo) {
  if (isNiftyVwapHedgeAlgo(algo)) return resolveHedgeAlgoTrade(algo);
  if (isNiftyOptionEngineAlgo(algo)) {
    const symbol = "NIFTY";
    const und = getUnderlying(symbol);
    const pack = chainForSymbol(symbol);
    const spot = Number(pack?.meta?.spot) || getChainSpot(symbol);
    const vs = algo.vwapState || {};
    const hs = algo.hedgeState || {};
    const strike = Number(vs.lockedStrike) || atmStrike(spot, und.step);
    const option =
      vs.lockedOption === "PE" || hs.primarySide === "PE"
        ? "PE"
        : vs.lockedOption === "CE" || hs.primarySide === "CE"
          ? "CE"
          : "";
    const weeklyCard =
      isNiftyVwapReversalAlgo(algo) ||
      isNiftyVwapHedgeAlgo(algo) ||
      (isNiftyFirstCandleAlgo(algo) && String(algo.expiryKind || "weekly").toLowerCase() !== "monthly");
    const expiry = weeklyCard
      ? nearestWeeklyExpiry(niftyListedExpiries(pack), "NIFTY") || pack?.meta?.expiry || upcomingExpiries(und.id)[0] || ""
      : pack?.meta?.expiry || upcomingExpiries(und.id)[0] || "";
    const row = (pack?.rows || []).find((item) => Number(item.strike) === Number(strike));
    const ceLtp = Number(row?.callLtp);
    const peLtp = Number(row?.putLtp);
    const liveChain = pack?.meta?.source === "dhan";
    const premium = option === "PE" ? peLtp : option === "CE" ? ceLtp : ceLtp || peLtp;
    const securityId = option === "PE" ? row?.putId || row?.putSecurityId : row?.callId || row?.callSecurityId;
    const contract = option ? `${symbol} ${strike} ${option}` : `${symbol} ${strike} ATM`;
    let hint = "";
    if (!liveChain) hint = `Open Options on ${symbol} for live ATM CE/PE`;
    else if (
      weeklyCard &&
      expiry &&
      pack?.meta?.expiry &&
      normalizeExpiry(pack.meta.expiry) !== normalizeExpiry(expiry)
    ) {
      hint = `Waiting for weekly ${expiry} chain (not monthly)`;
    } else if (!row) hint = `No ${strike} ATM on the ${symbol} tape yet`;
    else if (!(ceLtp > 0) && !(peLtp > 0)) hint = "Waiting for live ATM option LTP";
    else hint = `CE ${ceLtp > 0 ? ceLtp : "—"} · PE ${peLtp > 0 ? peLtp : "—"}`;
    const weeklyReady =
      !weeklyCard ||
      !expiry ||
      !pack?.meta?.expiry ||
      normalizeExpiry(pack.meta.expiry) === normalizeExpiry(expiry);
    return {
      kind: "option",
      symbol: contract,
      option: option || "CE",
      strike,
      expiry,
      securityId: securityId ? String(securityId) : "",
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
  const securityId = option === "PE" ? row?.putId || row?.putSecurityId : row?.callId || row?.callSecurityId;
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
    securityId: securityId ? String(securityId) : "",
    ltp: premium,
    label: expiry ? `${contract} · ${expiry}` : contract,
    source: pack?.meta?.source || "",
    ready: liveChain && premium > 0,
    hint,
  };
}

const INDEX_ALIASES = {
  "NIFTY 50": "NIFTY 50",
  "NIFTY FUT": "NIFTY 50",
  NIFTY: "NIFTY 50",
  "BANK NIFTY": "BANKNIFTY",
  BANKNIFTY: "BANKNIFTY",
  "BANKNIFTY FUT": "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  "FINNIFTY FUT": "FINNIFTY",
  SENSEX: "SENSEX",
  "SENSEX FUT": "SENSEX",
  CRUDEOIL: "CRUDEOIL",
  "CRUDEOIL FUT": "CRUDEOIL",
  "CRUDE OIL": "CRUDEOIL",
  "INDIA VIX": "INDIA VIX",
};

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function withDeskQuotes(item) {
  const price = Number(item.price) || 0;
  const isVix = item.symbol === "INDIA VIX";
  const future = Number(item.future) > 0 ? Number(item.future) : isVix && price > 0 ? round2(price) : 0;
  const vwap =
    Number(item.futureVwap) > 0 ? Number(item.futureVwap) : Number(item.vwap) > 0 ? Number(item.vwap) : isVix && price > 0 ? round2(price) : 0;
  const day = dayChangeFromQuote(price, { prevClose: item.prevClose, netChange: item.change }, item.prevClose);
  const prevClose =
    day.prevClose ||
    (Number(item.prevClose) > 0 ? Number(item.prevClose) : price > 0 && Number(item.change) ? round2(price - Number(item.change)) : 0);
  const change = prevClose > 0 && price > 0 ? round2(price - prevClose) : Number(item.change) || 0;
  const changePct = prevClose > 0 && price > 0 ? round2((change / prevClose) * 100) : Number(item.changePct) || 0;
  const ids = { "NIFTY 50": 13, BANKNIFTY: 25, FINNIFTY: 27, SENSEX: 51, CRUDEOIL: 565899, "INDIA VIX": 21 };
  return {
    ...item,
    future,
    vwap,
    prevClose,
    change,
    changePct,
    securityId: item.securityId || ids[item.symbol] || undefined,
  };
}

function emptyDeskIndex(symbol, name) {
  return withDeskQuotes({
    symbol,
    name,
    price: 0,
    change: 0,
    changePct: 0,
    spark: [],
    future: 0,
    vwap: 0,
    futureVwap: 0,
    prevClose: 0,
  });
}

function sanePrevClose(ltp, prev, { loose = false } = {}) {
  const close = Number(prev);
  if (!(close > 0) || !(ltp > 0)) return null;
  const maxMove = loose ? 0.35 : 0.08;
  if (Math.abs(ltp - close) / close > maxMove) return null;
  return round2(close);
}

export function setDhanFeed(patch) {
  state.dhanFeed = { ...state.dhanFeed, ...patch };
}

const LAST_QUOTES_FILE = process.env.T2S_QUOTE_CACHE || path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "last-quotes.json");

function underNodeTest() {
  return process.execArgv.includes("--test") || process.argv.includes("--test") || process.env.NODE_TEST === "1";
}

export function indexFamilyHasTape(family) {
  const rows = state.indices || [];
  if (family === "mcx") {
    const crude = rows.find((row) => row.symbol === "CRUDEOIL");
    return Number(crude?.price) > 0 || Number(crude?.future) > 0;
  }
  return rows.some((row) => row.symbol !== "CRUDEOIL" && Number(row.price) > 0);
}

export function persistLastIndexQuotes(file = LAST_QUOTES_FILE) {
  const indices = (state.indices || [])
    .filter((row) => Number(row.price) > 0 || Number(row.future) > 0)
    .map((row) => ({
      symbol: row.symbol,
      price: row.price,
      future: row.future,
      change: row.change,
      changePct: row.changePct,
      prevClose: row.prevClose,
      spark: row.spark,
      futureExpiry: row.futureExpiry,
      vwap: row.vwap,
      futureVwap: row.futureVwap,
    }));
  if (!indices.length) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ at: Date.now(), indices }, null, 2)}\n`);
    return true;
  } catch (error) {
    console.log(`Could not save last NSE/MCX quotes: ${error.message || error}`);
    return false;
  }
}

export function restoreLastIndexQuotes(file = LAST_QUOTES_FILE) {
  try {
    const row = JSON.parse(fs.readFileSync(file, "utf8"));
    const indices = Array.isArray(row?.indices) ? row.indices : [];
    let restored = 0;
    for (const saved of indices) {
      const index = state.indices.find((item) => item.symbol === saved.symbol);
      if (!index) continue;
      const price = Number(saved.price);
      const future = Number(saved.future);
      if (!(price > 0) && !(future > 0)) continue;
      if (price > 0) {
        index.price = round2(price);
        index.change = round2(Number(saved.change) || index.change || 0);
        index.changePct = round2(Number(saved.changePct) || index.changePct || 0);
        if (Number(saved.prevClose) > 0) index.prevClose = round2(saved.prevClose);
        if (Array.isArray(saved.spark) && saved.spark.length) index.spark = saved.spark;
        if (Number(saved.vwap) > 0) index.vwap = round2(saved.vwap);
      }
      if (future > 0) {
        index.future = round2(future);
        if (saved.futureExpiry) index.futureExpiry = saved.futureExpiry;
        if (Number(saved.futureVwap) > 0) index.futureVwap = round2(saved.futureVwap);
      }
      restored += 1;
    }
    if (restored && Number(row.at) > 0 && !state.dhanFeed.lastTickAt) {
      setDhanFeed({
        source: state.dhanFeed.source === "idle" ? "last" : state.dhanFeed.source,
        lastTickAt: Number(row.at),
      });
    }
    return restored;
  } catch {
    return 0;
  }
}

let saveQuotesTimer = null;
function schedulePersistLastQuotes() {
  if (underNodeTest()) return;
  if (saveQuotesTimer) return;
  saveQuotesTimer = setTimeout(() => {
    saveQuotesTimer = null;
    persistLastIndexQuotes();
  }, 400);
}

export function isDhanFeedLive() {
  return Boolean(state.dhanFeed.live);
}

export function hasLastLiveBook() {
  if (state.dhanFeed.live) return true;
  if (state.optionMeta?.source === "dhan") return true;
  if (state.dhanFeed.lastTickAt) return true;
  const source = String(state.dhanFeed.source || "");
  if (source === "rest" || source === "websocket" || source === "last") return true;
  for (const pack of optionChainCache.values()) {
    if (pack?.meta?.source === "dhan") return true;
  }
  return false;
}

function dhanTapeReady() {
  return Boolean(state.dhanFeed.live) || hasLastLiveBook();
}

function publicDhanFeed() {
  const feed = clone(state.dhanFeed);
  let saved = null;
  try {
    saved = dhanTokenStatus();
  } catch {
    saved = null;
  }
  return {
    ...feed,
    tokenHint: feed.tokenHint || saved?.tokenHint || null,
    clientId: feed.clientId || saved?.clientId || null,
    autoRenew: feed.autoRenew || Boolean(saved?.autoRenew),
    autoMode: feed.autoMode && feed.autoMode !== "off" ? feed.autoMode : saved?.autoMode || feed.autoMode,
    tokenExpiry: feed.tokenExpiry || saved?.tokenExpiry || null,
    nextRenewAt: feed.nextRenewAt || saved?.nextRenewAt || null,
    autoStart: saved?.autoStart !== undefined ? saved.autoStart : feed.autoStart,
    needsFresh: saved?.needsFresh !== undefined ? saved.needsFresh : feed.needsFresh,
    renewalBlockedUntil: feed.renewalBlockedUntil || saved?.renewalBlockedUntil || null,
    hasQuotes: hasLastLiveBook(),
  };
}

function isSimRow(row) {
  return Boolean(row?.sim) || row?.live === false;
}

function isPaperRow(row) {
  return Boolean(row?.paper) || row?.brokerId === "paper";
}

function liveDesk() {
  const live = isDhanFeedLive();
  const keep = (row) => isPaperRow(row) || (!isSimRow(row) && row?.live !== false);
  const algos = state.algos || [];
  const withActualName = (row) => ({ ...row, strategy: canonicalStrategyName(row.strategy, algos) });
  const orders = (state.orders || []).filter(keep).map(withActualName);
  const positions = (state.positions || []).filter(keep).map(withActualName);
  const closedTrades = (state.closedTrades || []).filter(keep).map(withActualName);
  return { live, orders, positions, closedTrades };
}

export function clearSimulatedDesk() {
  state.orders = state.orders.filter((row) => row.paper || row.brokerId === "paper");
  state.positions = state.positions.filter((row) => row.paper || row.brokerId === "paper");
  state.closedTrades = (state.closedTrades || []).filter((row) => row.paper || row.brokerId === "paper");
  state.algos = (state.algos || []).map((algo) =>
    algo.runMode === "paper" ? algo : { ...algo, pnl: algo.runMode === "backtest" ? algo.pnl : 0 },
  );
  state.notifications = ["Dhan LIVE · live quotes. Paper fills stay virtual. No simulated Dhan book."];
}

export function restoreSimulatedDesk() {
  state.algos = (state.algos || []).map((algo) =>
    algo.runMode === "paper" && algo.enabled ? { ...algo, enabled: false, status: "PAUSED" } : algo,
  );
  state.orders = (state.orders || []).filter(isPaperRow);
  state.positions = (state.positions || []).filter(isPaperRow);
  state.closedTrades = (state.closedTrades || []).filter(isPaperRow);
  state.signals = [];
  state.notifications = [];
  syncPaperLedger();
}

let tickBusy = false;

function skipLiveAlgoTicks() {
  return /^(1|true|yes)$/i.test(String(process.env.T2S_SKIP_LIVE_ALGOS || ""));
}

export function tickMarket() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    if (dhanTapeReady() && !skipLiveAlgoTicks()) runLiveAlgos();
    runPaperAlgos();
    markPaperToMarket();
  } catch (error) {
    console.error(`tickMarket failed: ${error.message || error}`);
  } finally {
    tickBusy = false;
  }
}

export function quoteSymbol(symbol) {
  return liveLtpForSymbol(symbol);
}

function liveLtpForSymbol(symbol) {
  const raw = String(symbol || "").toUpperCase().replace(/,/g, "");
  const named = raw.match(/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|CRUDEOIL)(?:\s+\d{1,2}\s+[A-Z]{3})?\s+(\d{3,6})\s*(CE|PE)\b/);
  const option = named || raw.match(/(\d{3,6})\s*(CE|PE)\b/);
  if (option) {
    const strike = Number(named ? named[2] : option[1]);
    const opt = named ? named[3] : option[2];
    const rows = named ? chainForSymbol(named[1])?.rows || [] : state.optionChain || [];
    const row = rows.find((item) => Number(item.strike) === strike);
    if (row) {
      const ltp = opt === "PE" ? Number(row.putLtp) : Number(row.callLtp);
      if (isSaneOptionLtp(ltp)) return round2(ltp);
    }
    return 0;
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
  state.positions = (state.positions || []).map((row) =>
    markContractToMarket(row, preferMarkLtp(row, liveLtpForSymbol(row.symbol))),
  );
  syncPaperLedger();
}

export function deskMtm() {
  markPaperToMarket();
  const { positions } = liveDesk();
  return {
    positions: (positions || []).map((row) => ({
      id: row.id,
      symbol: row.symbol,
      ltp: Number(row.ltp) || 0,
      pnl: Number(row.pnl) || 0,
      strategy: row.strategy || "",
    })),
    serverTime: new Date().toISOString(),
  };
}

let onLiveBookChange = null;
export function onDhanBookChanged(fn) {
  onLiveBookChange = typeof fn === "function" ? fn : null;
}

export function livePositionQuoteTargets() {
  return (state.positions || [])
    .filter((row) => row.securityId && (row.live || row.brokerId === "dhan") && !isPaperRow(row))
    .map((row) => ({
      symbol: row.symbol,
      segment: exchangeSegmentFor(row.symbol),
      securityId: Number(row.securityId) || row.securityId,
      kind: isOptionContract(row.symbol, row.option) ? "option" : "future",
    }));
}

export function snapshot() {
  syncAlgoClientMaps();
  markPaperToMarket();
  const brokers = publicBrokers();
  const active = getActiveBroker();
  const { orders, positions, closedTrades } = liveDesk();
  const { totalPnl, pnlByBroker: byBroker } = bookPnl(positions, closedTrades);
  const { liveCandles: _liveCandles, closedTrades: _closedTrades, ...publicState } = clone(state);
  const liveState = { ...publicState, orders, positions, closedTrades };
  liveState.algos = (liveState.algos || []).map((algo) => ({ ...algo, trade: resolveAlgoTrade(algo) }));
  const dnaScores = buildLiveDna({ indices: publicState.indices, optionChain: publicState.optionChain });
  const signals = buildLiveSignals({ algos: liveState.algos, orders });
  const watch = indexWatchRows(publicState.indices);
  return {
    ...liveState,
    signals,
    featuredSignal: buildFeaturedSignal(signals, publicState.optionMeta, dnaScores),
    dnaScores,
    fiiDii: emptyFiiDii(),
    sentiment: liveSentiment(dnaScores),
    notifications: (state.notifications || []).slice(0, 40),
    watchlist: watch.map(({ volume: _volume, ...row }) => row),
    marketWatch: watch,
    totalPnl: Number(totalPnl.toFixed(2)),
    pnlByBroker: byBroker,
    report: buildReport(liveState),
    brokers: brokers.brokers,
    activeBrokerId: brokers.activeBrokerId,
    mainBrokerId: brokers.mainBrokerId,
    dhanFeed: publicDhanFeed(),
    futures: publicFutures(),
    contracts: {
      indices: listIndexContracts().map(({ securityId, ...row }) => row),
      futures: publicFutures(),
      optionCount: optionCount(),
    },
    indices: publicIndices(publicState.indices.map(withDeskQuotes)),
    optionChain: publicOptionRows(publicState.optionChain),
    settings: { ...state.settings, broker: active.name },
    marketStatus: nseMarketSession().status,
    marketSession: nseMarketSession(),
    mcxSession: mcxMarketSession(),
    serverTime: new Date().toISOString(),
  };
}

export function deskFeed() {
  syncAlgoClientMaps();
  markPaperToMarket();
  const { orders, positions, closedTrades } = liveDesk();
  const { totalPnl, pnlByBroker: byBroker } = bookPnl(positions, closedTrades);
  const dnaScores = buildLiveDna({ indices: state.indices, optionChain: state.optionChain });
  const algos = (state.algos || []).map((algo) => ({
    id: algo.id,
    enabled: algo.enabled,
    status: algo.status,
    pnl: algo.pnl,
    winRate: algo.winRate,
    lastSignal: algo.lastSignal,
    mappedClientIds: algo.mappedClientIds || [],
    trade: resolveAlgoTrade(algo),
  }));
  const signalAlgos = (state.algos || []).map((algo, index) => ({ ...algo, ...algos[index] }));
  const signals = buildLiveSignals({ algos: signalAlgos, orders });
  const watch = indexWatchRows(state.indices);
  return {
    indices: publicIndices(state.indices.map(withDeskQuotes)),
    ohlc: state.ohlc,
    optionChain: publicOptionRows(state.optionChain),
    optionMeta: clone(state.optionMeta),
    futures: publicFutures(),
    dhanFeed: publicDhanFeed(),
    positions,
    orders,
    closedTrades,
    algos,
    signals,
    featuredSignal: buildFeaturedSignal(signals, state.optionMeta, dnaScores),
    dnaScores,
    sentiment: liveSentiment(dnaScores),
    totalPnl: Number(totalPnl.toFixed(2)),
    pnlByBroker: byBroker,
    marketWatch: watch,
    watchlist: watch.map(({ volume: _volume, ...row }) => row),
    marketStatus: nseMarketSession().status,
    marketSession: nseMarketSession(),
    mcxSession: mcxMarketSession(),
    serverTime: new Date().toISOString(),
  };
}

export function memberIndexQuote(row) {
  if (!row?.symbol) return null;
  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    price: Number(row.price) || 0,
    change: Number(row.change) || 0,
    changePct: Number(row.changePct) || 0,
    prevClose: Number(row.prevClose) > 0 ? Number(row.prevClose) : 0,
    spark: Array.isArray(row.spark) ? row.spark.slice(-8) : [],
    future: Number(row.future) > 0 ? Number(row.future) : Number(row.price) || 0,
    futureExpiry: row.futureExpiry || "",
    lot: Number(row.lot) || 0,
  };
}

export function memberQuotes() {
  return {
    indices: publicIndices(state.indices).map(memberIndexQuote).filter(Boolean),
  };
}

export function armNiftyVwapHedgeDailyLive(now = new Date()) {
  const lastArmedYmd = loadHedgeDailyLiveArmedYmd();
  const result = applyHedgeDailyLive(state.algos, {
    now,
    feedLive: isDhanFeedLive(),
    lastArmedYmd,
  });
  if (result.reason === "dhan-not-live") {
    console.log("NIFTY 15m VWAP daily LIVE 09:20 arm skipped — Dhan is not LIVE");
    return result;
  }
  if (result.lastArmedYmd && result.lastArmedYmd !== lastArmedYmd) {
    saveHedgeDailyLiveArmedYmd(result.lastArmedYmd);
  }
  if (!result.armedIds.length) return result;
  state.algos = result.algos;
  for (const id of result.armedIds) {
    const algo = state.algos.find((row) => row.id === id);
    if (!algo) continue;
    algo.lastPaperAt = 0;
    algo.lastLiveAt = 0;
    algo.lastLiveSide = "";
    algo.lastSignal = "WAIT";
    if (isNiftyVwapHedgeAlgo(algo)) {
      const hs = hedgeState(algo);
      hs.inFlight = false;
      hs.pendingRole = "";
    }
  }
  persistAlgos();
  state.notifications.unshift(`NIFTY 15m VWAP hedge + reversal · daily LIVE 09:20 IST · ${result.armedIds.join(",")}`);
  console.log(`NIFTY 15m VWAP hedge + reversal armed LIVE at 09:20 IST · ${result.armedIds.join(",")}`);
  return result;
}

export function armNiftyFirstCandleDailyLive(now = new Date()) {
  const lastArmedYmd = loadFirstCandleDailyLiveArmedYmd();
  const result = applyFirstCandleDailyLive(state.algos, {
    now,
    feedLive: isDhanFeedLive(),
    lastArmedYmd,
  });
  if (result.reason === "dhan-not-live") {
    console.log("NIFTY 5m first candle daily LIVE 09:00 arm skipped — Dhan is not LIVE");
    return result;
  }
  if (result.lastArmedYmd && result.lastArmedYmd !== lastArmedYmd) {
    saveFirstCandleDailyLiveArmedYmd(result.lastArmedYmd);
  }
  if (!result.armedIds.length) return result;
  state.algos = result.algos;
  for (const id of result.armedIds) {
    const algo = state.algos.find((row) => row.id === id);
    if (!algo) continue;
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
  persistAlgos();
  state.notifications.unshift(`NIFTY 5m first candle · daily LIVE 09:00 IST · ${result.armedIds.join(",")}`);
  console.log(`NIFTY 5m first candle armed LIVE at 09:00 IST · ${result.armedIds.join(",")}`);
  return result;
}

export function toggleAlgo(id, patch = {}) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return null;
  if (algo.runMode === "backtest") {
    algo.enabled = false;
    algo.status = "BACKTEST";
    return { error: "Backtest strategies do not go live. Use Run backtest." };
  }
  const wantEnabled =
    patch.enabled === true ? true : patch.enabled === false ? false : !algo.enabled;
  const starting = wantEnabled && !algo.enabled;
  const stopping = !wantEnabled && algo.enabled;
  if (!starting && !stopping) {
    if (algo.runMode === "paper") {
      algo.brokerId = "paper";
      algo.status = algo.enabled ? "PAPER" : "PAUSED";
    } else {
      algo.status = algo.enabled ? "LIVE" : "PAUSED";
    }
    return clone(algo);
  }
  if (starting && algo.runMode === "paper" && !isDhanFeedLive()) {
    return { error: "Paper trading uses the live Dhan feed. Connect Access Token on Brokers first." };
  }
  if (starting && algo.runMode === "live") {
    const brokerId = algo.brokerId && algo.brokerId !== "paper" ? algo.brokerId : "dhan";
    const ready = brokerId === "dhan" ? isDhanFeedLive() : isLiveBrokerReady(brokerId);
    if (!ready) {
      const name = publicBrokers().brokers.find((row) => row.id === brokerId)?.name || brokerId;
      return { error: `Start live needs ${name} LIVE — connect that broker on Brokers first.` };
    }
  }
  algo.enabled = wantEnabled;
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
    if (isNiftyVwapHedgeAlgo(algo)) {
      const hs = hedgeState(algo);
      hs.inFlight = false;
      hs.pendingRole = "";
    }
  }
  if (algo.runMode === "paper") {
    algo.brokerId = "paper";
    algo.status = algo.enabled ? "PAPER" : "PAUSED";
  } else {
    algo.status = algo.enabled ? "LIVE" : "PAUSED";
  }
  persistAlgos();
  return clone(algo);
}

export function createAlgo(payload) {
  const algo = normalizeAlgo(payload || {});
  algo.enabled = false;
  algo.status = algo.runMode === "backtest" ? "BACKTEST" : "PAUSED";
  algo.pnl = 0;
  algo.winRate = 0;
  if (algo.runMode === "paper" || algo.runMode === "backtest") algo.brokerId = "paper";
  removedAlgoIds = removedAlgoIds.filter((item) => item !== String(algo.id));
  state.algos.unshift(algo);
  state.notifications.unshift(`Strategy added: ${algo.name} · ${algo.runMode || "live"}`);
  persistAlgos();
  return clone(algo);
}

function memberIds() {
  return new Set(
    listPublicUsers()
      .filter((row) => row?.id && row.role !== "admin" && row.id !== "admin")
      .map((row) => row.id),
  );
}

export function syncAlgoClientMaps() {
  const allow = memberIds();
  let changed = false;
  for (const algo of state.algos || []) {
    const prev = Array.isArray(algo.mappedClientIds) ? algo.mappedClientIds : [];
    const next = mappedClientIdsForMembers(prev, allow);
    if (next.length !== prev.length || next.some((id, index) => id !== prev[index])) {
      algo.mappedClientIds = next;
      changed = true;
    }
  }
  if (changed) persistAlgos();
  return changed;
}

export function dropClientFromStrategies(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  let changed = false;
  for (const algo of state.algos || []) {
    const prev = Array.isArray(algo.mappedClientIds) ? algo.mappedClientIds : [];
    const next = prev.filter((item) => String(item || "").trim() !== id);
    if (next.length !== prev.length) {
      algo.mappedClientIds = next;
      changed = true;
    }
  }
  if (changed) persistAlgos();
  return changed;
}

export function updateAlgo(id, payload) {
  const index = state.algos.findIndex((item) => item.id === id);
  if (index < 0) return { error: "Strategy not found" };
  const next = normalizeAlgo(payload || {}, state.algos[index]);
  next.mappedClientIds = mappedClientIdsForMembers(next.mappedClientIds, memberIds());
  next.id = id;
  state.algos[index] = next;
  state.notifications.unshift(`Strategy updated: ${next.name}`);
  persistAlgos();
  return clone(next);
}

function rowBelongsToStrategy(row, strategyId, strategyName) {
  if (!row || typeof row !== "object") return false;
  if (strategyId && String(row.strategyId || "").trim() === strategyId) return true;
  const label = String(row.strategy || row.strategyName || "").trim().toLowerCase();
  return Boolean(strategyName && label === strategyName);
}

export function withoutStrategyRows(rows, { id, name } = {}) {
  const strategyId = String(id || "").trim();
  const strategyName = String(name || "").trim().toLowerCase();
  return (rows || []).filter((row) => !rowBelongsToStrategy(row, strategyId, strategyName));
}

export function deleteAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Strategy not found" };
  const strategyId = String(id);
  const strategyName = String(algo.name || "").trim().toLowerCase();
  if (strategyName) cancelPendingForStrategy(algo.name);
  state.positions = withoutStrategyRows(state.positions, { id: strategyId, name: algo.name });
  state.orders = withoutStrategyRows(state.orders, { id: strategyId, name: algo.name });
  state.closedTrades = withoutStrategyRows(state.closedTrades, { id: strategyId, name: algo.name });
  state.notifications = (state.notifications || []).filter((row) => {
    const text = typeof row === "string" ? row : String(row?.text || "");
    return !strategyName || !text.toLowerCase().includes(strategyName);
  });
  state.algos = state.algos.filter((item) => item.id !== id);
  removedAlgoIds = [...new Set([...removedAlgoIds, strategyId])];
  state.notifications.unshift(`Strategy deleted: ${algo.name}`);
  persistAlgos();
  deleteStrategyEnrollments(strategyId, algo.name);
  dropStrategyFromMemberDesks({ strategyId, strategyName: algo.name });
  return { ok: true, id };
}

function candlesForBacktest(tf, allowSample = true, symbol = "NIFTY") {
  const live = getCandles(tf || "5m", symbol);
  if (live.length >= 40) return { candles: live, sample: false };
  if (!allowSample) return { candles: live, sample: false };
  const key = candleSymbol(symbol);
  const index =
    state.indices.find((item) => candleSymbol(item.symbol) === key || candleSymbol(item.name) === key) || state.indices[0];
  const price = Number(index?.price || (key === "CRUDEOIL" ? 6124 : 24580));
  const count = tf === "1m" ? 180 : tf === "15m" ? 96 : tf === "1H" ? 80 : 120;
  return { candles: generateCandles(count, price, key === "CRUDEOIL" ? 73 : 91), sample: true };
}

export function getAlgo(id) {
  const algo = state.algos.find((item) => item.id === id);
  return algo ? clone(algo) : null;
}

export function listAlgos() {
  return (state.algos || []).map((row) => clone(row));
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

export async function backtestAlgo(id, options = {}) {
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Strategy not found" };
  const window = resolveBacktestWindow(options);
  if (window.error) return { error: window.error };
  const hedge = isNiftyVwapHedgeAlgo(algo);
  const niftyVwap = isNiftyOptionEngineAlgo(algo) || hedge;
  const cfg = hedge ? niftyVwapHedgeConfig(algo) : niftyVwap ? optionEngineConfig(algo) : null;
  const hist = optionBacktestWindow(algo, window);
  const vwapFrom = hist.option ? hist.from : window.from;
  const vwapFromMs = Date.parse(`${vwapFrom}T09:15:00+05:30`);
  const wantedTf = niftyVwap ? cfg.timeframe : pickBacktestTimeframe(algo.timeframe, window.days);
  let candles = usableCandles(options.candles, niftyVwap ? vwapFromMs : window.fromMs, window.toMs);
  if (!niftyVwap && candles.length) {
    candles = usableCandles(aggregateIndexBars(candles, wantedTf), niftyVwap ? vwapFromMs : window.fromMs, window.toMs);
  }
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
  const usedTf = niftyVwap ? cfg.timeframe : wantedTf;
  const kind = hedge ? "hedge" : niftyVwap ? "vwap" : "indicator";
  const replayAlgo = hedge
    ? { ...algo, hedgeState: undefined, timeframe: usedTf }
    : niftyVwap
      ? { ...algo, vwapState: undefined, timeframe: usedTf }
      : { ...algo, timeframe: usedTf };
  const replay = await runReplayInWorker({ kind, algo: replayAlgo, candles });
  const result = {
    ...replay,
    sample,
    source: options.candleSource || source,
    reused: Boolean(options.reused),
    range: window.range,
    from: niftyVwap ? vwapFrom : window.from,
    to: window.to,
    truncated: niftyVwap && window.from !== vwapFrom ? `${cfg.timeframe} replay last ${cfg.barMinutes >= 15 ? 60 : 25} days` : "",
    optionHistory: options.optionHistory || undefined,
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

function conditionSources(algo, side) {
  const group = side === "sell" ? algo?.sellConditions : algo?.buyConditions;
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  if (rows.length) return rows.flatMap((row) => [row?.left, row?.right]);
  if (side === "sell") return [algo?.sellLeft, algo?.sellRight];
  return [algo?.buyLeft, algo?.buyRight];
}

export function minLiveBars(algo = {}) {
  const side = String(algo.side || "BOTH").toUpperCase();
  const sources = [];
  if (side !== "SELL") sources.push(...conditionSources(algo, "buy"));
  if (side !== "BUY") sources.push(...conditionSources(algo, "sell"));
  if (sources.includes("macd")) return 40;
  if (sources.includes("ema_slow") || sources.includes("ema_fast")) return Math.max(8, Number(algo.slow) || 21);
  if (sources.includes("supertrend") || sources.includes("rsi")) return Math.max(8, (Number(algo.period) || 14) + 2);
  return 3;
}

export function liveIndicatorSide(algo, candles, now = Date.now()) {
  const need = minLiveBars(algo);
  if (!Array.isArray(candles) || candles.length < need) {
    return { side: "", lastSignal: "WAIT CANDLES", reason: "candles" };
  }
  const signal = evaluateSignals(candles, candles.length - 1, algo, undefined, now);
  const wantBuy = Boolean(signal.buy) && (algo.side === "BUY" || algo.side === "BOTH");
  const wantSell = Boolean(signal.sell) && (algo.side === "SELL" || algo.side === "BOTH");
  if (!wantBuy && !wantSell) return { side: "", lastSignal: "HOLD", reason: "flat" };
  const side = wantBuy ? "BUY" : "SELL";
  return { side, lastSignal: side, reason: "signal" };
}

function runPaperAlgos() {
  const feedLive = dhanTapeReady();
  noteNiftyVwapFeed(feedLive);
  const now = Date.now();
  for (const algo of state.algos) {
    if (!algo.enabled || algo.runMode !== "paper") continue;
    if (isNiftyVwapHedgeAlgo(algo)) {
      tickNiftyVwapHedgeAlgo(algo, "paper", feedLive);
      continue;
    }
    if (isNiftyOptionEngineAlgo(algo)) {
      tickNiftyVwapAlgo(algo, "paper", feedLive);
      continue;
    }
    if (!feedLive) continue;
    if (algo.lastPaperAt && now - algo.lastPaperAt < 60_000) continue;
    const pack = candlesForBacktest(algo.timeframe, false, algo.symbol);
    const decision = liveIndicatorSide(algo, pack.candles, now);
    if (!decision.side) {
      if (decision.reason === "flat") algo.lastSignal = "";
      continue;
    }
    const signal = { buy: decision.side === "BUY", sell: decision.side === "SELL" };
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
      algo.lastSignal = "";
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
  const feedLive = dhanTapeReady();
  const now = Date.now();
  for (const algo of state.algos) {
    if (!algo.enabled || algo.runMode !== "live") continue;
    if (isNiftyVwapHedgeAlgo(algo)) {
      tickNiftyVwapHedgeAlgo(algo, "live", feedLive);
      continue;
    }
    if (isNiftyOptionEngineAlgo(algo)) {
      tickNiftyVwapAlgo(algo, "live", feedLive);
      continue;
    }
    if (!feedLive) {
      algo.lastSignal = "FEED DOWN";
      continue;
    }
    if (!sessionOpenForAlgo(algo)) {
      algo.lastSignal = "WAIT SESSION";
      continue;
    }
    if (algo.lastLiveAt && now - algo.lastLiveAt < 60_000) continue;
    const pack = candlesForBacktest(algo.timeframe, false, algo.symbol);
    const decision = liveIndicatorSide(algo, pack.candles, now);
    if (!decision.side) {
      algo.lastSignal = decision.lastSignal;
      continue;
    }
    const side = decision.side;
    const openLive = (state.positions || []).find(
      (row) => !isPaperRow(row) && realStrategyName(row.strategy) === algo.name && Number(row.qty) > 0,
    );
    if (openLive) continue;
    const trade = resolveAlgoTrade(algo);
    if (!trade) continue;
    if (trade.kind === "option" && !(trade.strike && trade.expiry && trade.ltp > 0)) {
      algo.lastSignal = "WAIT";
      continue;
    }
    if (trade.kind === "future" && !(trade.ltp > 0)) {
      algo.lastSignal = "WAIT";
      continue;
    }
    const queued = queueLiveAlgoOrder({
      ...algoOrderFields(algo, side, trade),
      brokerId: algo.brokerId && algo.brokerId !== "paper" ? algo.brokerId : "dhan",
    });
    if (!queued?.queued) {
      algo.lastSignal = "";
      continue;
    }
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

function liveRejectReason(live, fallback) {
  const raw = live?.raw && typeof live.raw === "object" ? live.raw : {};
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : {};
  const remarks = typeof raw.remarks === "string" ? raw.remarks : raw.remarks?.error_message || "";
  const text =
    live?.reason ||
    raw.omsErrorDescription ||
    raw.errorMessage ||
    raw.error_message ||
    data.errorMessage ||
    data.error_message ||
    remarks;
  const clean = String(text || "").trim();
  return clean || fallback;
}

export function bookRejectedLiveOrder(payload, error) {
  if (!isDhanBrokerReject(error)) return null;
  const live = error?.live && typeof error.live === "object" ? error.live : {};
  const orderId = String(live.orderId || error.correlationId || payload.correlationId || `rej${Date.now()}`);
  return placeOrder({
    ...payload,
    brokerId: payload.brokerId || "dhan",
    live: {
      ...live,
      orderId,
      status: live.status || "REJECTED",
      reason: live.reason || error?.message,
    },
  });
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
  const stampedStrategy = strategyForPlacedOrder(payload, state.algos || []);
  const correlationId = String(payload.correlationId || live?.correlationId || "").trim();
  if (live?.orderId) {
    const existing = state.orders.find((row) => String(row.id) === String(live.orderId));
    if (existing) {
      const name = resolveOrderStrategy(
        {
          ...existing,
          ...payload,
          id: existing.id,
          strategy: stampedStrategy || payload.strategy || existing.strategy,
          correlationId: correlationId || existing.correlationId,
        },
        { previous: state.orders || [], algos: state.algos || [], positions: state.positions || [] },
      );
      if (name) {
        existing.strategy = name;
        rememberOrderStrategy({ ...existing, correlationId: correlationId || existing.correlationId }, name);
      }
      if (correlationId) existing.correlationId = correlationId;
      const status = mapLiveStatus(live.status);
      if (status) existing.status = status;
      const fill = dhanOrderFillPrice(live);
      if (fill > 0) existing.price = fill;
      const filledQty = Number(live.filledQty || 0);
      if (filledQty > 0) existing.filledQty = filledQty;
      if (live.reason || live.raw) existing.reason = liveRejectReason(live, existing.reason);
      if (isPaper || live) fanOutAdminOrderCopies({ ...payload, strategy: existing.strategy }, existing);
      return existing;
    }
  }
  const type = String(payload.type || "MARKET").toUpperCase();
  const qty = Number(payload.qty) || 65;
  const demoDhan = brokerId === "dhan" && !live;
  const ltp = liveLtpForSymbol(payload.symbol);
  const price = resolveLiveBookPrice({
    type,
    payloadPrice: payload.price,
    livePrice: dhanOrderFillPrice(live || {}),
    isPaper,
    isLive: Boolean(live),
    ltp,
  });
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
    price,
    strategy:
      resolveOrderStrategy(
        {
          ...payload,
          id: live?.orderId,
          strategy: stampedStrategy || payload.strategy,
          securityId: payload.securityId || live?.securityId,
          symbol: payload.symbol,
          side: payload.side,
          correlationId,
        },
        { previous: state.orders || [], algos: state.algos || [], positions: state.positions || [] },
      ) || stampedStrategy || realStrategyName(payload.strategy),
    correlationId,
    brokerId,
    brokerName: live ? "Dhan" : demoDhan ? "Dhan (demo)" : account.name,
    live: Boolean(live),
    sim: !live && !isPaper,
    paper: isPaper,
    securityId: payload.securityId != null ? String(payload.securityId) : live?.securityId || "",
    reason: live
      ? liveRejectReason(live, `Sent to Dhan (${live.status || "submitted"}). Order ${live.orderId}`)
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
      option: payload.option || PositionManager.niftyOptionLeg(payload)?.option || "",
      strike: payload.strike || PositionManager.niftyOptionLeg(payload)?.strike || 0,
      expiry: payload.expiry || "",
      role: payload.role || "",
      brokerId,
      openedAt: order.createdAt,
      sim: !isPaper,
      live: false,
      paper: isPaper,
    });
  }
  if (order.strategy) rememberOrderStrategy(order, order.strategy);
  const strategyNote = order.strategy ? ` · ${order.strategy}` : "";
  state.notifications.unshift(
    live
      ? `Dhan ${order.status}: ${order.side} ${order.symbol}${strategyNote}`
      : demoDhan
        ? `Desk demo ${order.status}: ${order.side} ${order.symbol}${strategyNote} (not sent to Dhan)`
        : `${account.name} ${order.status}: ${order.side} ${order.symbol}${strategyNote}`,
  );
  if (isPaper) markPaperToMarket();
  if (isPaper || live || demoDhan) {
    fanOutAdminOrderCopies({ ...payload, strategy: order.strategy }, order);
  }
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

function bookPnl(positions = [], closedTrades = []) {
  const byBroker = {};
  let unrealized = 0;
  let realized = 0;
  for (const row of positions || []) {
    const pnl = Number(row.pnl || 0);
    unrealized += pnl;
    const key = row.brokerId || "dhan";
    byBroker[key] = Number(((byBroker[key] || 0) + pnl).toFixed(2));
  }
  for (const row of closedTrades || []) {
    const pnl = Number(row.pnl || 0);
    realized += pnl;
    const key = row.brokerId || "dhan";
    byBroker[key] = Number(((byBroker[key] || 0) + pnl).toFixed(2));
  }
  return { totalPnl: Number((unrealized + realized).toFixed(2)), pnlByBroker: byBroker };
}

function rememberClosedFromPosition(pos, extra = {}) {
  if (!pos) return null;
  if (!Array.isArray(state.closedTrades)) state.closedTrades = [];
  const sourceId = String(extra.sourcePositionId || pos.id || "");
  if (sourceId && state.closedTrades.some((row) => String(row.sourcePositionId || "") === sourceId)) {
    return state.closedTrades.find((row) => String(row.sourcePositionId || "") === sourceId);
  }
  const paper = isPaperRow(pos);
  const dir = String(pos.type || "BUY").toUpperCase() === "SELL" ? -1 : 1;
  const qty = Math.abs(Number(extra.qty || pos.qty) || 0);
  const entry = Number(pos.avg || 0);
  const exit = Number(extra.exit || pos.ltp || entry);
  const marked = Number(extra.pnl);
  const pnl = Number.isFinite(marked) ? Number(marked.toFixed(2)) : Number(((exit - entry) * qty * dir).toFixed(2));
  const closed = {
    id: extra.id || `t${Date.now()}`,
    sourcePositionId: sourceId,
    symbol: pos.symbol,
    side: pos.type,
    type: pos.type,
    qty,
    entry,
    exit,
    pnl,
    product: pos.product || "MIS",
    strategy: extra.strategy || pos.strategy || "",
    brokerId: extra.brokerId || pos.brokerId || "dhan",
    closedAt: extra.closedAt || new Date().toISOString(),
    sim: !paper && Boolean(pos.sim),
    live: !paper && pos.live !== false,
    paper,
  };
  state.closedTrades.unshift(closed);
  return closed;
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
    strategy:
      resolveOrderStrategy(pos, {
        previous: state.orders || [],
        algos: state.algos || [],
        positions: state.positions || [],
      }) || realStrategyName(pos.strategy),
    brokerId: account.id,
    brokerName: account.name,
    sim: !pos.paper,
    live: false,
    paper: Boolean(pos.paper || pos.brokerId === "paper"),
    createdAt: new Date().toISOString(),
  };
  state.orders.unshift(order);
  if (order.strategy) rememberOrderStrategy(order, order.strategy);
  rememberClosedFromPosition(pos, {
    id: `t${Date.now()}`,
    exit,
    pnl,
    strategy: order.strategy,
    brokerId: account.id,
    closedAt: order.createdAt,
  });
  state.positions.splice(index, 1);
  state.notifications.unshift(`Squared off ${pos.symbol} · ${pnl >= 0 ? "+" : ""}₹${Math.abs(pnl).toFixed(2)}`);
  if (isPaperRow(pos)) markPaperToMarket();
  if (order.strategy) {
    const algo = (state.algos || []).find((row) => String(row.name || "") === String(order.strategy || ""));
    dispatchMemberExitCopies({ ...pos, strategy: order.strategy, qty: pos.qty }, algo || {}, {
      enqueueLiveOrder: enqueueLiveAlgoOrder,
    });
  }
  return { ok: true, order, pnl };
}

export function replaceDhanOrders(rows) {
  const incoming = Array.isArray(rows) ? rows : [];
  const previous = state.orders || [];
  const previousDhan = new Map(
    previous.filter((row) => row.brokerId === "dhan").map((row) => [String(row.id), row]),
  );
  const tagged = incoming.map((row) => {
    const existing = previousDhan.get(String(row.id));
    return {
      ...row,
      price: mergeDhanOrderPrice(row, existing),
      filledQty: Number(row.filledQty || existing?.filledQty || 0),
      strategy: resolveOrderStrategy(row, {
        previous,
        algos: state.algos || [],
        positions: state.positions || [],
      }),
    };
  });
  const others = previous.filter((row) => row.brokerId !== "dhan");
  state.orders = [...tagged, ...others];
  for (const row of tagged) {
    const id = String(row.id || "");
    if (!id || previousDhan.has(id) || row.copyUserId || row.copiedToMembers) continue;
    fanOutAdminOrderCopies(
      {
        symbol: row.symbol,
        side: row.side,
        qty: row.qty,
        price: row.price,
        strategy: row.strategy,
        brokerId: "dhan",
        securityId: row.securityId,
        product: row.product,
        type: row.type || "MARKET",
      },
      row,
    );
  }
}

export function assignAlgoBroker(id, brokerId) {
  const wanted = String(brokerId || "").trim();
  if (wanted !== "paper" && !isKnownLiveBroker(wanted)) return { error: "Unknown live broker" };
  const algo = state.algos.find((item) => item.id === id);
  if (!algo) return { error: "Algo not found" };
  if (algo.runMode === "paper" || algo.runMode === "backtest") {
    algo.brokerId = "paper";
    persistAlgos();
    return clone(algo);
  }
  algo.brokerId = wanted || "dhan";
  persistAlgos();
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
  persistAlgos();
}

export function replaceDhanBook(rows) {
  const incoming = (Array.isArray(rows) ? rows : []).map((row) => {
    const leg = PositionManager.niftyOptionLeg(row);
    const next = {
      ...row,
      option: row.option || leg?.option || "",
      strike: row.strike || leg?.strike || 0,
    };
    next.strategy = resolveOrderStrategy(next, {
      previous: state.positions || [],
      algos: state.algos || [],
      positions: state.positions || [],
      orders: state.orders || [],
      forPosition: true,
    });
    for (const algo of state.algos || []) {
      if (!isNiftyVwapHedgeAlgo(algo) || next.strategy !== algo.name) continue;
      const hs = algo.hedgeState || {};
      if (next.role) break;
      if (hs.pendingRole) next.role = hs.pendingRole;
      else if (hs.hedgeSide && next.option === hs.hedgeSide) next.role = "hedge";
      else if (hs.primarySide && next.option === hs.primarySide) next.role = "primary";
      break;
    }
    return next;
  });
  const others = state.positions.filter((row) => row.brokerId !== "dhan");
  const previousDhan = new Map(state.positions.filter((row) => row.brokerId === "dhan").map((row) => [String(row.id), row]));
  const incomingIds = new Set(incoming.map((row) => String(row.id)));
  if (!Array.isArray(state.closedTrades)) state.closedTrades = [];
  state.closedTrades = state.closedTrades.filter((row) => {
    const source = String(row.sourcePositionId || "");
    return !source || !incomingIds.has(source);
  });
  for (const [id, prev] of previousDhan) {
    if (incomingIds.has(id)) continue;
    rememberClosedFromPosition(prev);
  }
  state.positions = [
    ...incoming.map((row) => {
      const prev = previousDhan.get(String(row.id));
      if (prev?.ticked && isSaneOptionLtp(prev.ltp, row.avg)) {
        return { ...row, ltp: prev.ltp, pnl: prev.pnl, ticked: true };
      }
      return row;
    }),
    ...others,
  ];
  if (typeof onLiveBookChange === "function") onLiveBookChange();
}

export function setLiveCandles(candles, symbol = "NIFTY") {
  if (!Array.isArray(candles) || !candles.length) return;
  const key = candleSymbol(symbol);
  liveCandleCache.set(key, candles);
  if (key !== "NIFTY") return;
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
  if (Number(index?.price) > 0) return Number(index.price);
  if (Number(index?.future) > 0) return Number(index.future);
  const pack = chainForSymbol(meta.id);
  if (Number(pack?.meta?.spot) > 0) return Number(pack.meta.spot);
  if (String(state.optionMeta?.symbol || "").toUpperCase() === meta.id && Number(state.optionMeta.spot) > 0) {
    return Number(state.optionMeta.spot);
  }
  return 0;
}

export function applySyntheticOptionChain(symbol = state.optionMeta.symbol, expiry = state.optionMeta.expiry) {
  const meta = getUnderlying(symbol);
  const wanted = normalizeExpiry(expiry);
  let expiries = upcomingExpiries(meta.id);
  if (wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && !expiries.includes(wanted)) {
    expiries = [...expiries, wanted].sort();
  }
  const chosen = wanted && expiries.includes(wanted) ? wanted : expiries[0];
  const liveSpot = getChainSpot(meta.id);
  const spot = liveSpot > 0 ? liveSpot : meta.id === "CRUDEOIL" ? 6100 : 24500;
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
  const sameSymbol = String(state.optionMeta?.symbol || "").toUpperCase() === meta.id;
  const cached = optionChainCache.get(meta.id);
  const nextExpiry = expiry || cached?.meta?.expiry || (sameSymbol ? state.optionMeta.expiry : upcomingExpiries(meta.id)[0] || "");
  const sameExpiry = normalizeExpiry(nextExpiry) === normalizeExpiry(state.optionMeta.expiry);
  let nextRows = Array.isArray(rows) && rows.length
    ? rows
    : sameSymbol
      ? state.optionChain
      : cached?.rows?.length
        ? cached.rows
        : [];
  if (sameSymbol && sameExpiry) nextRows = keepStrikeWindow(state.optionChain, nextRows);
  const nextSpot = Number(spot) || Number(cached?.meta?.spot) || getChainSpot(meta.id);
  const stats = chainStats(nextRows, nextSpot);
  state.optionChain = nextRows;
  state.optionMeta = withExpiryLabels({
    ...state.optionMeta,
    ...(cached?.meta || {}),
    symbol: meta.id,
    expiry: nextExpiry,
    expiries: expiries?.length ? expiries : cached?.meta?.expiries || (sameSymbol ? state.optionMeta.expiries : upcomingExpiries(meta.id)),
    ...stats,
    source: source || cached?.meta?.source || state.optionMeta.source,
    lastAt: Date.now(),
    contractIds: nextRows.filter((row) => row.callId || row.putId).length,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  });
  if (nextRows.length) rememberOptionChain(meta.id, nextRows, state.optionMeta);
  return clone(state.optionMeta);
}

export function cacheOptionDesk({ symbol, expiry, expiries, rows, spot, source } = {}) {
  const meta = getUnderlying(symbol || "CRUDEOIL");
  const nextRows = Array.isArray(rows) && rows.length ? rows : [];
  const nextSpot = Number(spot) || getChainSpot(meta.id);
  const stats = chainStats(nextRows, nextSpot);
  const nextMeta = withExpiryLabels({
    symbol: meta.id,
    expiry: expiry || upcomingExpiries(meta.id)[0] || "",
    expiries: expiries?.length ? expiries : upcomingExpiries(meta.id),
    ...stats,
    source: source || "dhan",
    lastAt: Date.now(),
    contractIds: nextRows.filter((row) => row.callId || row.putId).length,
    underlyings: UNDERLYINGS.map((row) => ({ id: row.id, label: row.label, lot: row.lot })),
  });
  rememberOptionChain(meta.id, nextRows, nextMeta);
  return clone(nextMeta);
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
  if (upper.includes("CRUDEOIL")) return "CRUDEOIL";
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
  const candles = [
    {
      time: now,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    },
  ];
  state.liveCandles = candles;
  liveCandleCache.set("NIFTY", candles);
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
  const storedPrev = Number(index.prevClose) > 0 ? Number(index.prevClose) : 0;
  const day = dayChangeFromQuote(ltp, quote, storedPrev);
  if (day.prevClose > 0) return day;
  return {
    change: Number(index.change) || 0,
    changePct: Number(index.changePct) || 0,
    prevClose: storedPrev,
  };
}

export function applyLiveQuotes(quotes) {
  for (const quote of quotes) {
    const indexSymbol =
      INDEX_ALIASES[quote.parent] ||
      INDEX_ALIASES[quote.symbol] ||
      relatedIndex(quote.parent || quote.symbol);
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
      if (index.symbol === "CRUDEOIL") {
        const day = dayChange(index, quote, ltp);
        index.price = round2(ltp);
        index.change = day.change;
        index.changePct = day.changePct;
        index.prevClose = day.prevClose;
        index.spark = pushSpark(index.spark, ltp);
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
    if (quote.kind === "option") {
      const parsed = parseOptionContract(quote.symbol);
      const chainRow = parsed
        ? (state.optionChain || []).find((item) => Number(item.strike) === parsed.strike)
        : null;
      if (chainRow) {
        if (parsed.option === "PE") chainRow.putLtp = round2(ltp);
        else chainRow.callLtp = round2(ltp);
      }
    } else if (index) {
      const day = dayChange(index, quote, ltp);
      const vwap = Number(quote.vwap);
      index.price = round2(ltp);
      index.change = day.change;
      index.changePct = day.changePct;
      index.prevClose = day.prevClose;
      if (vwap > 0 && !(index.futureVwap > 0)) index.vwap = round2(vwap);
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

  state.positions = state.positions.map((row) => {
    const match = quotes.find(
      (quote) =>
        (quote.symbol && quote.symbol === row.symbol) ||
        (quote.securityId && row.securityId && String(quote.securityId) === String(row.securityId)),
    );
    if (match && Number(match.ltp) > 0) {
      const ltp = round2(match.ltp);
      if (isOptionContract(row.symbol, row.option) && !isSaneOptionLtp(ltp, row.avg)) return row;
      const dir = row.type === "BUY" ? 1 : -1;
      return { ...row, ltp, pnl: round2((ltp - row.avg) * row.qty * dir), ticked: true };
    }
    return row;
  });

  runPaperAlgos();
  runLiveAlgos();
  markPaperToMarket();
  schedulePersistLastQuotes();
}

export function getCandles(tf = "5m", symbol = "NIFTY") {
  const key = candleSymbol(symbol);
  const liveRows =
    key === "NIFTY"
      ? state.liveCandles.length
        ? state.liveCandles
        : liveCandleCache.get("NIFTY") || []
      : liveCandleCache.get(key) || [];
  if (!liveRows.length) return [];
  const minutes = tf === "1m" ? 1 : tf === "5m" ? 5 : tf === "15m" ? 15 : tf === "1H" || tf === "1h" ? 60 : 5;
  if (minutes <= 1) return clone(liveRows);
  return VwapSignalEngine.aggregateSessionBars(liveRows, minutes);
}

if (!underNodeTest()) restoreLastIndexQuotes();
