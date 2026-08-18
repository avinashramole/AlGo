export type StrategyKind = "indicator" | "price-action";

export type AlgoStrategy = {
  id: string;
  name: string;
  tag: string;
  kind?: StrategyKind;
  symbol?: string;
  side?: "BUY" | "SELL" | "BOTH";
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
  summary?: string;
  status: "LIVE" | "PAUSED";
  pnl: number;
  winRate: number;
  enabled: boolean;
  brokerId?: string;
};

export const STRATEGY_SYMBOLS = [
  { id: "NIFTY", lot: 75 },
  { id: "BANKNIFTY", lot: 15 },
  { id: "FINNIFTY", lot: 25 },
  { id: "SENSEX", lot: 10 },
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

export const emptyStrategy = (kind: StrategyKind = "indicator"): Partial<AlgoStrategy> => ({
  name: "",
  kind,
  tag: kind === "indicator" ? "Indicator" : "Price action",
  symbol: "NIFTY",
  side: "BUY",
  qty: 75,
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
  brokerId: "dhan",
  enabled: false,
  status: "PAUSED",
});

export function lotForSymbol(symbol?: string) {
  return STRATEGY_SYMBOLS.find((row) => row.id === symbol)?.lot || 75;
}
