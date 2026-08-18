const SYMBOLS = [
  { id: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", lot: 60 },
  { id: "SENSEX", lot: 20 },
];

const INDICATORS = ["RSI", "EMA", "VWAP", "MACD", "SUPERTREND"];
const PATTERNS = ["ORB", "BREAKOUT", "PINBAR", "ENGULFING", "SR_BOUNCE"];
const TIMEFRAMES = ["1m", "5m", "15m", "1H"];
const OPERATORS = ["crosses_above", "crosses_below", "above", "below", "gt", "lt", "gte", "lte", "eq"];
const SOURCES = [
  "price",
  "vwap",
  "ema_fast",
  "ema_slow",
  "rsi",
  "macd",
  "supertrend",
  "or_high",
  "or_low",
  "lookback_high",
  "lookback_low",
  "value",
];

const OP_LABEL = {
  crosses_above: "crosses above",
  crosses_below: "crosses below",
  above: "is above",
  below: "is below",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  eq: "=",
};

const SRC_LABEL = {
  price: "Price",
  vwap: "VWAP",
  ema_fast: "EMA fast",
  ema_slow: "EMA slow",
  rsi: "RSI",
  macd: "MACD",
  supertrend: "Supertrend",
  or_high: "OR high",
  or_low: "OR low",
  lookback_high: "Lookback high",
  lookback_low: "Lookback low",
  value: "value",
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function lotFor(symbol) {
  return SYMBOLS.find((row) => row.id === symbol)?.lot || 65;
}

function pick(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}

export function defaultConditions(kind, indicator, pattern) {
  if (kind === "price-action") {
    if (pattern === "BREAKOUT") {
      return {
        buyLeft: "price",
        buyOp: "crosses_above",
        buyRight: "lookback_high",
        buyValue: 0,
        sellLeft: "price",
        sellOp: "crosses_below",
        sellRight: "lookback_low",
        sellValue: 0,
      };
    }
    if (pattern === "SR_BOUNCE") {
      return {
        buyLeft: "price",
        buyOp: "above",
        buyRight: "lookback_low",
        buyValue: 0,
        sellLeft: "price",
        sellOp: "below",
        sellRight: "lookback_high",
        sellValue: 0,
      };
    }
    return {
      buyLeft: "price",
      buyOp: "crosses_above",
      buyRight: "or_high",
      buyValue: 0,
      sellLeft: "price",
      sellOp: "crosses_below",
      sellRight: "or_low",
      sellValue: 0,
    };
  }
  if (indicator === "RSI") {
    return {
      buyLeft: "rsi",
      buyOp: "lt",
      buyRight: "value",
      buyValue: 30,
      sellLeft: "rsi",
      sellOp: "gt",
      sellRight: "value",
      sellValue: 70,
    };
  }
  if (indicator === "EMA") {
    return {
      buyLeft: "ema_fast",
      buyOp: "crosses_above",
      buyRight: "ema_slow",
      buyValue: 0,
      sellLeft: "ema_fast",
      sellOp: "crosses_below",
      sellRight: "ema_slow",
      sellValue: 0,
    };
  }
  if (indicator === "MACD") {
    return {
      buyLeft: "macd",
      buyOp: "crosses_above",
      buyRight: "value",
      buyValue: 0,
      sellLeft: "macd",
      sellOp: "crosses_below",
      sellRight: "value",
      sellValue: 0,
    };
  }
  if (indicator === "SUPERTREND") {
    return {
      buyLeft: "price",
      buyOp: "crosses_above",
      buyRight: "supertrend",
      buyValue: 0,
      sellLeft: "price",
      sellOp: "crosses_below",
      sellRight: "supertrend",
      sellValue: 0,
    };
  }
  return {
    buyLeft: "price",
    buyOp: "crosses_above",
    buyRight: "vwap",
    buyValue: 0,
    sellLeft: "price",
    sellOp: "crosses_below",
    sellRight: "vwap",
    sellValue: 0,
  };
}

export function formatCondition(left, op, right, value) {
  const leftLabel = SRC_LABEL[left] || left || "Price";
  const opLabel = OP_LABEL[op] || op || ">";
  const rightLabel = right === "value" ? String(value ?? 0) : SRC_LABEL[right] || right || "value";
  return `${leftLabel} ${opLabel} ${rightLabel}`;
}

export function strikeOffsetLabel(offset) {
  const n = Math.max(-2, Math.min(2, Math.round(Number(offset) || 0)));
  if (n === 0) return "ATM";
  return n > 0 ? `ATM+${n}` : `ATM${n}`;
}

export function contractLabel(algo) {
  const symbol = algo.symbol || "NIFTY";
  if (algo.instrument === "option") {
    return `${symbol} ${algo.optionType === "PE" ? "PE" : "CE"} ${strikeOffsetLabel(algo.strikeOffset)}`;
  }
  return `${symbol} FUT`;
}

export function summarizeAlgo(algo) {
  const symbol = algo.symbol || "NIFTY";
  const tf = algo.timeframe || "5m";
  const lot = lotFor(symbol);
  const lots = algo.lots || 1;
  const size = `${lots} lot × ${lot} = ${lots * lot} qty`;
  const contract = contractLabel(algo);
  if (algo.kind === "price-action") {
    const pattern = algo.pattern || "ORB";
    return `Price action · ${contract} · Buy when ${formatCondition(algo.buyLeft, algo.buyOp, algo.buyRight, algo.buyValue)} · ${pattern} · ${tf} · ${size}`;
  }
  return `Indicator · ${contract} · Buy when ${formatCondition(algo.buyLeft, algo.buyOp, algo.buyRight, algo.buyValue)} · Sell when ${formatCondition(algo.sellLeft, algo.sellOp, algo.sellRight, algo.sellValue)} · ${tf} · ${size}`;
}

export function normalizeAlgo(input = {}, existing = {}) {
  const kind = input.kind === "price-action" ? "price-action" : "indicator";
  const symbol = SYMBOLS.some((row) => row.id === input.symbol) ? input.symbol : existing.symbol || "NIFTY";
  const indicator = INDICATORS.includes(input.indicator) ? input.indicator : existing.indicator || "VWAP";
  const pattern = PATTERNS.includes(input.pattern) ? input.pattern : existing.pattern || "ORB";
  const side = ["BUY", "SELL", "BOTH"].includes(input.side) ? input.side : existing.side || "BUY";
  const timeframe = TIMEFRAMES.includes(input.timeframe) ? input.timeframe : existing.timeframe || "5m";
  const defaults = defaultConditions(kind, indicator, pattern);
  const hasBuy = Boolean(input.buyOp || existing.buyOp);
  const conditions = hasBuy
    ? {
        buyLeft: pick(SOURCES, input.buyLeft || existing.buyLeft, defaults.buyLeft),
        buyOp: pick(OPERATORS, input.buyOp || existing.buyOp, defaults.buyOp),
        buyRight: pick(SOURCES, input.buyRight || existing.buyRight, defaults.buyRight),
        buyValue: num(input.buyValue, existing.buyValue ?? defaults.buyValue),
        sellLeft: pick(SOURCES, input.sellLeft || existing.sellLeft, defaults.sellLeft),
        sellOp: pick(OPERATORS, input.sellOp || existing.sellOp, defaults.sellOp),
        sellRight: pick(SOURCES, input.sellRight || existing.sellRight, defaults.sellRight),
        sellValue: num(input.sellValue, existing.sellValue ?? defaults.sellValue),
      }
    : defaults;
  const lots = Math.max(1, Math.round(num(input.lots, existing.lots || 1)));
  const lotSize = lotFor(symbol);
  const name = String(input.name || existing.name || "").trim() || (kind === "indicator" ? `${indicator} ${symbol}` : `${pattern} ${symbol}`);
  const runMode = ["live", "paper", "backtest"].includes(input.runMode)
    ? input.runMode
    : ["live", "paper", "backtest"].includes(existing.runMode)
      ? existing.runMode
      : "paper";
  const instrument = (input.instrument || existing.instrument) === "option" ? "option" : "future";
  const optionType = (input.optionType || existing.optionType) === "PE" ? "PE" : "CE";
  const strikeOffset = Math.max(-2, Math.min(2, Math.round(num(input.strikeOffset, existing.strikeOffset || 0))));
  const next = {
    ...existing,
    id: existing.id || `a${Date.now()}`,
    name,
    kind,
    tag: kind === "indicator" ? "Indicator" : "Price action",
    symbol,
    instrument,
    optionType,
    strikeOffset,
    side,
    lots,
    lotSize,
    qty: lots * lotSize,
    timeframe,
    slPct: Math.max(0.05, num(input.slPct, existing.slPct || 0.4)),
    targetPct: Math.max(0.1, num(input.targetPct, existing.targetPct || 0.8)),
    indicator,
    period: Math.max(2, Math.round(num(input.period, existing.period || (indicator === "SUPERTREND" ? 10 : 14)))),
    fast: Math.max(2, Math.round(num(input.fast, existing.fast || 9))),
    slow: Math.max(3, Math.round(num(input.slow, existing.slow || 21))),
    rsiBuy: Math.max(5, Math.min(50, num(input.rsiBuy, conditions.buyRight === "value" ? conditions.buyValue : existing.rsiBuy || 30))),
    rsiSell: Math.max(50, Math.min(95, num(input.rsiSell, conditions.sellRight === "value" ? conditions.sellValue : existing.rsiSell || 70))),
    multiplier: Math.max(1, num(input.multiplier, existing.multiplier || 3)),
    pattern,
    rangeMinutes: [15, 30, 60].includes(Number(input.rangeMinutes)) ? Number(input.rangeMinutes) : existing.rangeMinutes || 15,
    lookback: Math.max(5, Math.round(num(input.lookback, existing.lookback || 20))),
    ...conditions,
    runMode,
    brokerId: runMode === "live" ? String(input.brokerId || existing.brokerId || "dhan") : "paper",
    lastBacktest: existing.lastBacktest || null,
    pnl: Number.isFinite(Number(existing.pnl)) ? Number(existing.pnl) : 0,
    winRate: Number.isFinite(Number(existing.winRate)) ? Number(existing.winRate) : 50,
    enabled: existing.enabled ?? false,
    status: existing.status || "PAUSED",
  };
  delete next.trade;
  next.summary = summarizeAlgo(next);
  return next;
}

export function seedAlgos() {
  return [
    normalizeAlgo(
      {
        name: "VWAP Depth",
        kind: "indicator",
        symbol: "NIFTY",
        indicator: "VWAP",
        timeframe: "5m",
        side: "BUY",
        lots: 1,
        slPct: 0.35,
        targetPct: 0.8,
        buyLeft: "price",
        buyOp: "crosses_above",
        buyRight: "vwap",
        sellLeft: "price",
        sellOp: "crosses_below",
        sellRight: "vwap",
      },
      { id: "a1", pnl: 0, winRate: 0, enabled: false, status: "PAUSED", brokerId: "paper", runMode: "paper" },
    ),
    normalizeAlgo(
      {
        name: "Momentum Rider",
        kind: "indicator",
        symbol: "FINNIFTY",
        indicator: "RSI",
        period: 14,
        timeframe: "5m",
        side: "BOTH",
        lots: 1,
        buyLeft: "rsi",
        buyOp: "lt",
        buyRight: "value",
        buyValue: 32,
        sellLeft: "rsi",
        sellOp: "gt",
        sellRight: "value",
        sellValue: 68,
      },
      { id: "a2", pnl: 0, winRate: 0, enabled: false, status: "PAUSED", brokerId: "paper", runMode: "paper" },
    ),
    normalizeAlgo(
      {
        name: "ORB Breakout",
        kind: "price-action",
        symbol: "NIFTY",
        pattern: "ORB",
        rangeMinutes: 15,
        timeframe: "5m",
        side: "BOTH",
        lots: 1,
      },
      { id: "a3", pnl: 0, winRate: 0, enabled: false, status: "PAUSED", brokerId: "paper", runMode: "paper" },
    ),
  ];
}

export const STRATEGY_META = { SYMBOLS, INDICATORS, PATTERNS, TIMEFRAMES, OPERATORS, SOURCES, OP_LABEL, SRC_LABEL };
