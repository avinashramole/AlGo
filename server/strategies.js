import { defaultNiftyVwapAlgo, defaultNiftyVwapReversalAlgo, isNiftyVwapAlgo, isNiftyVwapReversalAlgo, niftyVwapConfig, niftyVwapReversalConfig, NIFTY_VWAP_KIND, NIFTY_VWAP_REVERSAL_KIND } from "./niftyVwap/config.js";

const SYMBOLS = [
  { id: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", lot: 60 },
  { id: "SENSEX", lot: 20 },
];

const INDICATORS = ["RSI", "EMA", "VWAP", "MACD", "SUPERTREND"];
const PATTERNS = ["ORB", "BREAKOUT", "PINBAR", "ENGULFING", "SR_BOUNCE"];
const TIMEFRAMES = ["1m", "5m", "15m", "1H"];
const OPERATORS = ["close_above", "close_below", "crosses_above", "crosses_below", "above", "below", "gt", "lt", "gte", "lte", "eq"];
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
  close_above: "close above",
  close_below: "close below",
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

const MAX_CONDITION_ROWS = 5;

export function conditionRowFrom(input = {}, fallback = {}) {
  return {
    left: pick(SOURCES, input.left, fallback.left || "price"),
    op: pick(OPERATORS, input.op, fallback.op || "close_above"),
    right: pick(SOURCES, input.right, fallback.right || "vwap"),
    value: num(input.value, fallback.value ?? 0),
  };
}

export function conditionGroupFrom(group, fallbackRow) {
  const join = group?.join === "or" ? "or" : "and";
  const raw = Array.isArray(group?.rows) ? group.rows : [];
  const fallback = conditionRowFrom(fallbackRow, { left: "price", op: "close_above", right: "vwap", value: 0 });
  const rows = (raw.length ? raw : [fallback]).slice(0, MAX_CONDITION_ROWS).map((row) => conditionRowFrom(row, fallback));
  return { join, rows: rows.length ? rows : [fallback] };
}

export function groupsFromFlat(flat = {}) {
  return {
    buyConditions: conditionGroupFrom(undefined, {
      left: flat.buyLeft || "price",
      op: flat.buyOp || "close_above",
      right: flat.buyRight || "vwap",
      value: flat.buyValue || 0,
    }),
    sellConditions: conditionGroupFrom(undefined, {
      left: flat.sellLeft || "price",
      op: flat.sellOp || "close_below",
      right: flat.sellRight || "vwap",
      value: flat.sellValue || 0,
    }),
  };
}

export function flatFromGroup(group, side) {
  const row = group?.rows?.[0] || {};
  if (side === "buy") {
    return {
      buyLeft: row.left || "price",
      buyOp: row.op || "close_above",
      buyRight: row.right || "vwap",
      buyValue: row.value || 0,
    };
  }
  return {
    sellLeft: row.left || "price",
    sellOp: row.op || "close_below",
    sellRight: row.right || "vwap",
    sellValue: row.value || 0,
  };
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
    buyOp: "close_above",
    buyRight: "vwap",
    buyValue: 0,
    sellLeft: "price",
    sellOp: "close_below",
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

export function formatConditionGroup(group, fallbackRow) {
  const next = conditionGroupFrom(group, fallbackRow);
  const parts = next.rows.map((row) => formatCondition(row.left, row.op, row.right, row.value));
  return parts.join(next.join === "or" ? " OR " : " AND ");
}

export function strikeOffsetLabel(offset) {
  const n = Math.max(-2, Math.min(2, Math.round(Number(offset) || 0)));
  if (n === 0) return "ATM";
  return n > 0 ? `ATM+${n}` : `ATM${n}`;
}

export function contractLabel(algo) {
  if (isNiftyVwapAlgo(algo) || isNiftyVwapReversalAlgo(algo)) return "NIFTY ATM CE/PE";
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
  if (isNiftyVwapReversalAlgo(algo)) {
    const sl = algo.initialSlPct || 15;
    const tgt = algo.targetPct || 30;
    return `NIFTY 15m VWAP reversal · ATM options · open below VWAP + close above → BUY CE · open above VWAP + close below → BUY PE · after 15m close · SL ${sl}% / TGT ${tgt}% · ${size}`;
  }
  if (isNiftyVwapAlgo(algo)) {
    const sl = algo.initialSlPct || 20;
    const tgt = algo.targetPct || 40;
    const trail = algo.trailingActivationPct || 10;
    const step = algo.trailingStepPct || 3;
    const exitN = algo.vwapExitCandles || 5;
    return `NIFTY VWAP ATM · 5m options · first futures close vs VWAP · ATM premium above option VWAP · SL ${sl}% / TGT ${tgt}% · trail ${trail}% / ${step}% · VWAP exit ${exitN} · ${size}`;
  }
  if (algo.kind === "price-action") {
    const pattern = algo.pattern || "ORB";
    return `Price action · ${contract} · Buy when ${formatConditionGroup(algo.buyConditions, {
      left: algo.buyLeft,
      op: algo.buyOp,
      right: algo.buyRight,
      value: algo.buyValue,
    })} · ${pattern} · ${tf} · ${size}`;
  }
  return `Indicator · ${contract} · Buy when ${formatConditionGroup(algo.buyConditions, {
    left: algo.buyLeft,
    op: algo.buyOp,
    right: algo.buyRight,
    value: algo.buyValue,
  })} · Sell when ${formatConditionGroup(algo.sellConditions, {
    left: algo.sellLeft,
    op: algo.sellOp,
    right: algo.sellRight,
    value: algo.sellValue,
  })} · ${tf} · ${size}`;
}

export function normalizeAlgo(input = {}, existing = {}) {
  const merged = { ...existing, ...input };
  const keepReversal =
    isNiftyVwapReversalAlgo(merged) &&
    input.kind !== "indicator" &&
    input.kind !== "price-action" &&
    input.kind !== "nifty-vwap";
  if (keepReversal) {
    const cfg = niftyVwapReversalConfig(merged);
    const runMode = ["live", "paper", "backtest"].includes(input.runMode)
      ? input.runMode
      : ["live", "paper", "backtest"].includes(existing.runMode)
        ? existing.runMode
        : "live";
    const creating = !existing.id;
    const next = {
      ...existing,
      ...defaultNiftyVwapReversalAlgo({
        ...merged,
        name: String(input.name || existing.name || "").trim() || "NIFTY 15m VWAP reversal",
        runMode,
        lots: cfg.lots,
        lotSize: cfg.lotSize,
      }),
      id: existing.id || `a${Date.now()}`,
      kind: NIFTY_VWAP_REVERSAL_KIND,
      slPct: cfg.initialSlPct,
      initialSlPct: cfg.initialSlPct,
      targetPct: cfg.targetPct,
      eodSquareOffMinutes: cfg.eodSquareOffMinutes,
      lastBacktest: existing.lastBacktest || null,
      pnl: Number.isFinite(Number(existing.pnl)) ? Number(existing.pnl) : 0,
      winRate: Number.isFinite(Number(existing.winRate)) ? Number(existing.winRate) : 0,
      vwapState: existing.vwapState,
      enabled: creating ? false : Boolean(existing.enabled),
      status: creating ? (runMode === "backtest" ? "BACKTEST" : "PAUSED") : existing.status || "PAUSED",
    };
    if (next.enabled && next.runMode === "live") next.status = "LIVE";
    else if (next.enabled && next.runMode === "paper") next.status = "PAPER";
    else if (next.runMode === "backtest") {
      next.enabled = false;
      next.status = "BACKTEST";
    } else if (!next.enabled) next.status = next.runMode === "backtest" ? "BACKTEST" : "PAUSED";
    delete next.trade;
    next.summary = summarizeAlgo(next);
    return next;
  }
  const keepNiftyVwap =
    isNiftyVwapAlgo(merged) &&
    input.kind !== "indicator" &&
    input.kind !== "price-action" &&
    input.kind !== "nifty-vwap-reversal";
  if (keepNiftyVwap) {
    const cfg = niftyVwapConfig(merged);
    const runMode = ["live", "paper", "backtest"].includes(input.runMode)
      ? input.runMode
      : ["live", "paper", "backtest"].includes(existing.runMode)
        ? existing.runMode
        : "live";
    const creating = !existing.id;
    const next = {
      ...existing,
      ...defaultNiftyVwapAlgo({
        ...merged,
        name: String(input.name || existing.name || "").trim() || "NIFTY VWAP ATM",
        runMode,
        lots: cfg.lots,
        lotSize: cfg.lotSize,
      }),
      id: existing.id || `a${Date.now()}`,
      kind: NIFTY_VWAP_KIND,
      slPct: cfg.initialSlPct,
      initialSlPct: cfg.initialSlPct,
      targetPct: cfg.targetPct,
      trailingActivationPct: cfg.trailingActivationPct,
      trailingStepPct: cfg.trailingStepPct,
      vwapExitCandles: cfg.vwapExitCandles,
      eodSquareOffMinutes: cfg.eodSquareOffMinutes,
      lastBacktest: existing.lastBacktest || null,
      pnl: Number.isFinite(Number(existing.pnl)) ? Number(existing.pnl) : 0,
      winRate: Number.isFinite(Number(existing.winRate)) ? Number(existing.winRate) : 0,
      vwapState: existing.vwapState,
      enabled: creating ? false : Boolean(existing.enabled),
      status: creating ? (runMode === "backtest" ? "BACKTEST" : "PAUSED") : existing.status || "PAUSED",
    };
    if (next.enabled && next.runMode === "live") next.status = "LIVE";
    else if (next.enabled && next.runMode === "paper") next.status = "PAPER";
    else if (next.runMode === "backtest") {
      next.enabled = false;
      next.status = "BACKTEST";
    } else if (!next.enabled) next.status = next.runMode === "backtest" ? "BACKTEST" : "PAUSED";
    delete next.trade;
    next.summary = summarizeAlgo(next);
    return next;
  }
  const kind = input.kind === "price-action" ? "price-action" : "indicator";
  const symbol = SYMBOLS.some((row) => row.id === input.symbol) ? input.symbol : existing.symbol || "NIFTY";
  const indicator = INDICATORS.includes(input.indicator) ? input.indicator : existing.indicator || "VWAP";
  const pattern = PATTERNS.includes(input.pattern) ? input.pattern : existing.pattern || "ORB";
  const side = ["BUY", "SELL", "BOTH"].includes(input.side) ? input.side : existing.side || "BUY";
  const timeframe = TIMEFRAMES.includes(input.timeframe) ? input.timeframe : existing.timeframe || "5m";
  const defaults = defaultConditions(kind, indicator, pattern);
  const hasBuy = Boolean(
    input.buyOp ||
      existing.buyOp ||
      input.buyConditions?.rows?.length ||
      existing.buyConditions?.rows?.length,
  );
  const hasSell = Boolean(
    input.sellOp ||
      existing.sellOp ||
      input.sellConditions?.rows?.length ||
      existing.sellConditions?.rows?.length,
  );
  const buyFallback = {
    left: pick(SOURCES, input.buyLeft || existing.buyLeft, defaults.buyLeft),
    op: pick(OPERATORS, input.buyOp || existing.buyOp, defaults.buyOp),
    right: pick(SOURCES, input.buyRight || existing.buyRight, defaults.buyRight),
    value: num(input.buyValue, existing.buyValue ?? defaults.buyValue),
  };
  const sellFallback = {
    left: pick(SOURCES, input.sellLeft || existing.sellLeft, defaults.sellLeft),
    op: pick(OPERATORS, input.sellOp || existing.sellOp, defaults.sellOp),
    right: pick(SOURCES, input.sellRight || existing.sellRight, defaults.sellRight),
    value: num(input.sellValue, existing.sellValue ?? defaults.sellValue),
  };
  const buyConditions = hasBuy
    ? conditionGroupFrom(input.buyConditions || existing.buyConditions, buyFallback)
    : conditionGroupFrom(undefined, {
        left: defaults.buyLeft,
        op: defaults.buyOp,
        right: defaults.buyRight,
        value: defaults.buyValue,
      });
  const sellConditions = hasSell
    ? conditionGroupFrom(input.sellConditions || existing.sellConditions, sellFallback)
    : conditionGroupFrom(undefined, {
        left: defaults.sellLeft,
        op: defaults.sellOp,
        right: defaults.sellRight,
        value: defaults.sellValue,
      });
  const conditions = {
    ...flatFromGroup(buyConditions, "buy"),
    ...flatFromGroup(sellConditions, "sell"),
    buyConditions,
    sellConditions,
  };
  const lots = Math.max(1, Math.round(num(input.lots, existing.lots || 1)));
  const lotSize = lotFor(symbol);
  const name = String(input.name || existing.name || "").trim() || (kind === "indicator" ? `${indicator} ${symbol}` : `${pattern} ${symbol}`);
  const runMode = ["live", "paper", "backtest"].includes(input.runMode)
    ? input.runMode
    : ["live", "paper", "backtest"].includes(existing.runMode)
      ? existing.runMode
        : "live";
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
      defaultNiftyVwapAlgo({
        name: "NIFTY VWAP ATM",
        runMode: "live",
      }),
      { id: "a4", pnl: 0, winRate: 0, enabled: false, status: "PAUSED", brokerId: "dhan", runMode: "live" },
    ),
    normalizeAlgo(
      defaultNiftyVwapReversalAlgo({
        name: "NIFTY 15m VWAP reversal",
        runMode: "live",
      }),
      { id: "a5", pnl: 0, winRate: 0, enabled: false, status: "PAUSED", brokerId: "dhan", runMode: "live" },
    ),
  ];
}

export const STRATEGY_META = { SYMBOLS, INDICATORS, PATTERNS, TIMEFRAMES, OPERATORS, SOURCES, OP_LABEL, SRC_LABEL };
