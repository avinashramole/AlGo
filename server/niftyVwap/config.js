export const NIFTY_VWAP_KIND = "nifty-vwap";
export const NIFTY_VWAP_TYPE = "NIFTY_VWAP_ATM";
export const NIFTY_VWAP_REVERSAL_KIND = "nifty-vwap-reversal";
export const NIFTY_VWAP_REVERSAL_TYPE = "NIFTY_VWAP_REVERSAL_15M";

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
  signalMode: "first-close",
  useTrail: true,
  useVwapExit: true,
};

export const DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG = {
  timeframe: "15m",
  initialSlPct: 15,
  targetPct: 30,
  trailingActivationPct: 10,
  trailingStepPct: 3,
  vwapExitCandles: 5,
  maxPositions: 1,
  intradayOnly: true,
  eodSquareOffMinutes: 10,
  barMinutes: 15,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "reversal",
  useTrail: false,
  useVwapExit: false,
  expiryKind: "weekly",
};

export function isNiftyVwapAlgo(algo = {}) {
  return (
    algo.kind === NIFTY_VWAP_KIND ||
    algo.strategyType === NIFTY_VWAP_TYPE ||
    algo.indicator === "NIFTY_VWAP_ATM"
  );
}

export function isNiftyVwapReversalAlgo(algo = {}) {
  return (
    algo.kind === NIFTY_VWAP_REVERSAL_KIND ||
    algo.strategyType === NIFTY_VWAP_REVERSAL_TYPE ||
    algo.indicator === "NIFTY_VWAP_REVERSAL"
  );
}

export function isNiftyOptionEngineAlgo(algo = {}) {
  return isNiftyVwapAlgo(algo) || isNiftyVwapReversalAlgo(algo);
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
    signalMode: "first-close",
    useTrail: true,
    useVwapExit: true,
  };
}

export function niftyVwapReversalConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.lotSize)));
  return {
    timeframe: "15m",
    initialSlPct: Math.max(1, num(algo.initialSlPct, DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.initialSlPct)),
    targetPct: Math.max(1, num(algo.targetPct ?? algo.targetProfitPct, DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.targetPct)),
    trailingActivationPct: DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.trailingActivationPct,
    trailingStepPct: DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.trailingStepPct,
    vwapExitCandles: DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.vwapExitCandles,
    maxPositions: 1,
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes: Math.max(0, Math.round(num(algo.eodSquareOffMinutes, DEFAULT_NIFTY_VWAP_REVERSAL_CONFIG.eodSquareOffMinutes))),
    barMinutes: 15,
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "reversal",
    useTrail: false,
    useVwapExit: false,
    expiryKind: "weekly",
  };
}

export function optionEngineConfig(algo = {}) {
  return isNiftyVwapReversalAlgo(algo) ? niftyVwapReversalConfig(algo) : niftyVwapConfig(algo);
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
    buyOp: "close_above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "close_below",
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

export function defaultNiftyVwapReversalAlgo(patch = {}) {
  const cfg = niftyVwapReversalConfig(patch);
  return {
    name: patch.name || "NIFTY 15m VWAP reversal",
    kind: NIFTY_VWAP_REVERSAL_KIND,
    strategyType: NIFTY_VWAP_REVERSAL_TYPE,
    tag: "15m VWAP",
    symbol: "NIFTY",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "15m",
    slPct: cfg.initialSlPct,
    targetPct: cfg.targetPct,
    initialSlPct: cfg.initialSlPct,
    trailingActivationPct: cfg.trailingActivationPct,
    trailingStepPct: cfg.trailingStepPct,
    vwapExitCandles: cfg.vwapExitCandles,
    maxPositions: 1,
    intradayOnly: true,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    expiryKind: "weekly",
    indicator: "NIFTY_VWAP_REVERSAL",
    buyLeft: "price",
    buyOp: "close_above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "close_below",
    sellRight: "vwap",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_VWAP_REVERSAL_KIND,
    strategyType: NIFTY_VWAP_REVERSAL_TYPE,
    enabled: false,
  };
}
