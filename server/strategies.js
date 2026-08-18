const SYMBOLS = [
  { id: "NIFTY", lot: 75 },
  { id: "BANKNIFTY", lot: 15 },
  { id: "FINNIFTY", lot: 25 },
  { id: "SENSEX", lot: 10 },
];

const INDICATORS = ["RSI", "EMA", "VWAP", "MACD", "SUPERTREND"];
const PATTERNS = ["ORB", "BREAKOUT", "PINBAR", "ENGULFING", "SR_BOUNCE"];
const TIMEFRAMES = ["1m", "5m", "15m", "1H"];

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function lotFor(symbol) {
  return SYMBOLS.find((row) => row.id === symbol)?.lot || 75;
}

export function summarizeAlgo(algo) {
  const symbol = algo.symbol || "NIFTY";
  const tf = algo.timeframe || "5m";
  if (algo.kind === "price-action") {
    const pattern = algo.pattern || "ORB";
    if (pattern === "ORB") return `Price action · ${symbol} ${algo.rangeMinutes || 15}m opening-range breakout on ${tf}`;
    if (pattern === "BREAKOUT") return `Price action · ${symbol} ${algo.lookback || 20}-bar high/low breakout on ${tf}`;
    if (pattern === "PINBAR") return `Price action · ${symbol} pin-bar reversal on ${tf}`;
    if (pattern === "ENGULFING") return `Price action · ${symbol} engulfing candle on ${tf}`;
    return `Price action · ${symbol} support/resistance bounce on ${tf}`;
  }
  const indicator = algo.indicator || "VWAP";
  if (indicator === "RSI") return `Indicator · Buy ${symbol} RSI(${algo.period || 14}) < ${algo.rsiBuy || 30}; sell > ${algo.rsiSell || 70}`;
  if (indicator === "EMA") return `Indicator · ${symbol} EMA ${algo.fast || 9} / ${algo.slow || 21} crossover on ${tf}`;
  if (indicator === "MACD") return `Indicator · ${symbol} MACD histogram cross on ${tf}`;
  if (indicator === "SUPERTREND") return `Indicator · ${symbol} Supertrend ${algo.period || 10} x ${algo.multiplier || 3} on ${tf}`;
  return `Indicator · ${symbol} trade with VWAP on ${tf}`;
}

export function normalizeAlgo(input = {}, existing = {}) {
  const kind = input.kind === "price-action" ? "price-action" : "indicator";
  const symbol = SYMBOLS.some((row) => row.id === input.symbol) ? input.symbol : existing.symbol || "NIFTY";
  const indicator = INDICATORS.includes(input.indicator) ? input.indicator : existing.indicator || "VWAP";
  const pattern = PATTERNS.includes(input.pattern) ? input.pattern : existing.pattern || "ORB";
  const side = ["BUY", "SELL", "BOTH"].includes(input.side) ? input.side : existing.side || "BUY";
  const timeframe = TIMEFRAMES.includes(input.timeframe) ? input.timeframe : existing.timeframe || "5m";
  const name = String(input.name || existing.name || "").trim() || (kind === "indicator" ? `${indicator} ${symbol}` : `${pattern} ${symbol}`);
  const next = {
    ...existing,
    id: existing.id || `a${Date.now()}`,
    name,
    kind,
    tag: kind === "indicator" ? "Indicator" : "Price action",
    symbol,
    side,
    qty: Math.max(1, Math.round(num(input.qty, existing.qty || lotFor(symbol)))),
    timeframe,
    slPct: Math.max(0.05, num(input.slPct, existing.slPct || 0.4)),
    targetPct: Math.max(0.1, num(input.targetPct, existing.targetPct || 0.8)),
    indicator,
    period: Math.max(2, Math.round(num(input.period, existing.period || (indicator === "SUPERTREND" ? 10 : 14)))),
    fast: Math.max(2, Math.round(num(input.fast, existing.fast || 9))),
    slow: Math.max(3, Math.round(num(input.slow, existing.slow || 21))),
    rsiBuy: Math.max(5, Math.min(50, num(input.rsiBuy, existing.rsiBuy || 30))),
    rsiSell: Math.max(50, Math.min(95, num(input.rsiSell, existing.rsiSell || 70))),
    multiplier: Math.max(1, num(input.multiplier, existing.multiplier || 3)),
    pattern,
    rangeMinutes: [15, 30, 60].includes(Number(input.rangeMinutes)) ? Number(input.rangeMinutes) : existing.rangeMinutes || 15,
    lookback: Math.max(5, Math.round(num(input.lookback, existing.lookback || 20))),
    brokerId: String(input.brokerId || existing.brokerId || "dhan"),
    pnl: Number.isFinite(Number(existing.pnl)) ? Number(existing.pnl) : 0,
    winRate: Number.isFinite(Number(existing.winRate)) ? Number(existing.winRate) : 50,
    enabled: existing.enabled ?? false,
    status: existing.status || "PAUSED",
  };
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
        qty: 75,
        slPct: 0.35,
        targetPct: 0.8,
      },
      { id: "a1", pnl: 2840.5, winRate: 68, enabled: true, status: "LIVE", brokerId: "dhan" },
    ),
    normalizeAlgo(
      {
        name: "Momentum Rider",
        kind: "indicator",
        symbol: "FINNIFTY",
        indicator: "RSI",
        period: 14,
        rsiBuy: 32,
        rsiSell: 68,
        timeframe: "5m",
        side: "BOTH",
        qty: 25,
      },
      { id: "a2", pnl: 1960.25, winRate: 61, enabled: true, status: "LIVE", brokerId: "dhan" },
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
        qty: 75,
      },
      { id: "a3", pnl: -412.0, winRate: 54, enabled: false, status: "PAUSED", brokerId: "dhan" },
    ),
  ];
}

export const STRATEGY_META = { SYMBOLS, INDICATORS, PATTERNS, TIMEFRAMES };
