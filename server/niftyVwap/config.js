export const NIFTY_VWAP_KIND = "nifty-vwap";
export const NIFTY_VWAP_TYPE = "NIFTY_VWAP_ATM";

export const DEFAULT_NIFTY_VWAP_CONFIG = {
  timeframe: "5m",
  initialSlPct: 20,
  targetPct: 40,
  trailingActivationPct: 10,
  trailingStepPct: 3,
  vwapExitCandles: 5,
  maxPositions: 1,
  intradayOnly: true,
  eodSquareOffMinutes: 10,
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
};

export function isNiftyVwapAlgo(algo = {}) {
  return (
    algo.kind === NIFTY_VWAP_KIND ||
    algo.strategyType === NIFTY_VWAP_TYPE ||
    algo.indicator === "NIFTY_VWAP_ATM"
  );
}

export function niftyVwapConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_VWAP_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_VWAP_CONFIG.lotSize)));
  return {
    timeframe: "5m",
    initialSlPct: Math.max(1, num(algo.initialSlPct, DEFAULT_NIFTY_VWAP_CONFIG.initialSlPct)),
    targetPct: Math.max(1, num(algo.targetPct ?? algo.targetProfitPct, DEFAULT_NIFTY_VWAP_CONFIG.targetPct)),
    trailingActivationPct: Math.max(1, num(algo.trailingActivationPct, DEFAULT_NIFTY_VWAP_CONFIG.trailingActivationPct)),
    trailingStepPct: Math.max(0.5, num(algo.trailingStepPct, DEFAULT_NIFTY_VWAP_CONFIG.trailingStepPct)),
    vwapExitCandles: Math.max(1, Math.round(num(algo.vwapExitCandles, DEFAULT_NIFTY_VWAP_CONFIG.vwapExitCandles))),
    maxPositions: 1,
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes: Math.max(0, Math.round(num(algo.eodSquareOffMinutes, DEFAULT_NIFTY_VWAP_CONFIG.eodSquareOffMinutes))),
    barMinutes: 5,
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
  };
}

export function defaultNiftyVwapAlgo(patch = {}) {
  const cfg = niftyVwapConfig(patch);
  return {
    name: patch.name || "NIFTY VWAP ATM",
    kind: NIFTY_VWAP_KIND,
    strategyType: NIFTY_VWAP_TYPE,
    tag: "NIFTY VWAP",
    symbol: "NIFTY",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "5m",
    slPct: cfg.initialSlPct,
    targetPct: cfg.targetPct,
    initialSlPct: cfg.initialSlPct,
    trailingActivationPct: cfg.trailingActivationPct,
    trailingStepPct: cfg.trailingStepPct,
    vwapExitCandles: cfg.vwapExitCandles,
    maxPositions: 1,
    intradayOnly: true,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    indicator: "VWAP",
    buyLeft: "price",
    buyOp: "above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "below",
    sellRight: "vwap",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_VWAP_KIND,
    strategyType: NIFTY_VWAP_TYPE,
    enabled: false,
  };
}
