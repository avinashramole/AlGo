export type StrategyKind = "indicator" | "price-action";
export type ConditionOp = "crosses_above" | "crosses_below" | "above" | "below" | "gt" | "lt" | "gte" | "lte" | "eq";
export type ConditionSource =
  | "price"
  | "vwap"
  | "ema_fast"
  | "ema_slow"
  | "rsi"
  | "macd"
  | "supertrend"
  | "or_high"
  | "or_low"
  | "lookback_high"
  | "lookback_low"
  | "value";

export type AlgoStrategy = {
  id: string;
  name: string;
  tag: string;
  kind?: StrategyKind;
  symbol?: string;
  side?: "BUY" | "SELL" | "BOTH";
  lots?: number;
  lotSize?: number;
  qty?: number;
  timeframe?: string;
  slPct?: number;
  targetPct?: number;
  indicator?: string;
  period?: number;
  fast?: number;
  slow?: number;
  rsiBuy?: number;
  rsiSell?: number;
  multiplier?: number;
  pattern?: string;
  rangeMinutes?: number;
  lookback?: number;
  buyLeft?: ConditionSource;
  buyOp?: ConditionOp;
  buyRight?: ConditionSource;
  buyValue?: number;
  sellLeft?: ConditionSource;
  sellOp?: ConditionOp;
  sellRight?: ConditionSource;
  sellValue?: number;
  summary?: string;
  runMode?: "live" | "paper" | "backtest";
  lastBacktest?: {
    ranAt?: string;
    timeframe?: string;
    bars?: number;
    trades?: number;
    wins?: number;
    losses?: number;
    winRate?: number;
    pnl?: number;
    maxDrawdown?: number;
    sample?: boolean;
    book?: Array<{ side: string; entry: number; exit: number; qty: number; pnl: number; bars: number }>;
  };
  status: "LIVE" | "PAUSED" | "PAPER" | "BACKTEST";
  pnl: number;
  winRate: number;
  enabled: boolean;
  brokerId?: string;
};

export const STRATEGY_SYMBOLS = [
  { id: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", lot: 60 },
  { id: "SENSEX", lot: 20 },
];

export const INDICATORS = [
  { id: "VWAP", label: "VWAP" },
  { id: "RSI", label: "RSI" },
  { id: "EMA", label: "EMA crossover" },
  { id: "MACD", label: "MACD" },
  { id: "SUPERTREND", label: "Supertrend" },
];

export const PATTERNS = [
  { id: "ORB", label: "Opening range breakout" },
  { id: "BREAKOUT", label: "High / low breakout" },
  { id: "PINBAR", label: "Pin bar" },
  { id: "ENGULFING", label: "Engulfing candle" },
  { id: "SR_BOUNCE", label: "Support / resistance bounce" },
];

export const TIMEFRAMES = ["1m", "5m", "15m", "1H"];

export const RUN_MODES = [
  { id: "paper" as const, title: "Paper trading", text: "Fills stay on Paper Trading. Nothing is sent to Dhan." },
  { id: "backtest" as const, title: "Backtest", text: "Replay candles and see P&L, win rate, and trade book." },
  { id: "live" as const, title: "Live Dhan", text: "Start only when Dhan is LIVE. Real orders go to Dhan." },
];

export const OPERATORS: Array<{ id: ConditionOp; label: string }> = [
  { id: "crosses_above", label: "Crosses above" },
  { id: "crosses_below", label: "Crosses below" },
  { id: "above", label: "Above" },
  { id: "below", label: "Below" },
  { id: "gt", label: ">" },
  { id: "lt", label: "<" },
  { id: "gte", label: ">=" },
  { id: "lte", label: "<=" },
  { id: "eq", label: "=" },
];

export const SOURCES: Array<{ id: ConditionSource; label: string }> = [
  { id: "price", label: "Price" },
  { id: "vwap", label: "VWAP" },
  { id: "ema_fast", label: "EMA fast" },
  { id: "ema_slow", label: "EMA slow" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
  { id: "supertrend", label: "Supertrend" },
  { id: "or_high", label: "OR high" },
  { id: "or_low", label: "OR low" },
  { id: "lookback_high", label: "Lookback high" },
  { id: "lookback_low", label: "Lookback low" },
  { id: "value", label: "Number" },
];

export function lotForSymbol(symbol?: string) {
  return STRATEGY_SYMBOLS.find((row) => row.id === symbol)?.lot || 65;
}

export function defaultConditions(kind: StrategyKind, indicator?: string, pattern?: string): Pick<
  AlgoStrategy,
  "buyLeft" | "buyOp" | "buyRight" | "buyValue" | "sellLeft" | "sellOp" | "sellRight" | "sellValue"
> {
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

export const emptyStrategy = (kind: StrategyKind = "indicator"): Partial<AlgoStrategy> => ({
  name: "",
  kind,
  tag: kind === "indicator" ? "Indicator" : "Price action",
  symbol: "NIFTY",
  side: "BUY",
  lots: 1,
  lotSize: 65,
  qty: 65,
  timeframe: "5m",
  slPct: 0.4,
  targetPct: 0.8,
  indicator: "VWAP",
  period: 14,
  fast: 9,
  slow: 21,
  rsiBuy: 30,
  rsiSell: 70,
  multiplier: 3,
  pattern: "ORB",
  rangeMinutes: 15,
  lookback: 20,
  ...defaultConditions(kind, "VWAP", "ORB"),
  runMode: "paper",
  brokerId: "paper",
  enabled: false,
  status: "PAUSED",
});

export function formatCondition(left?: string, op?: string, right?: string, value?: number) {
  const leftLabel = SOURCES.find((row) => row.id === left)?.label || "Price";
  const opLabel = OPERATORS.find((row) => row.id === op)?.label || ">";
  const rightLabel = right === "value" ? String(value ?? 0) : SOURCES.find((row) => row.id === right)?.label || "value";
  return `${leftLabel} ${opLabel} ${rightLabel}`;
}
