export const NIFTY_VWAP_KIND = "nifty-vwap";
export const NIFTY_VWAP_TYPE = "NIFTY_VWAP_ATM";
export const NIFTY_VWAP_REVERSAL_KIND = "nifty-vwap-reversal";
export const NIFTY_VWAP_REVERSAL_TYPE = "NIFTY_VWAP_REVERSAL_15M";
export const NIFTY_FIRST_CANDLE_KIND = "nifty-first-candle";
export const NIFTY_FIRST_CANDLE_TYPE = "NIFTY_FIRST_CANDLE_5M";

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

export const DEFAULT_NIFTY_FIRST_CANDLE_CONFIG = {
  timeframe: "5m",
  initialSlPct: 20,
  targetPct: 40,
  trailingActivationPct: 10,
  trailingStepPct: 3,
  vwapExitCandles: 5,
  maxPositions: 1,
  maxTradesPerDay: 1,
  intradayOnly: true,
  eodSquareOffMinutes: 15,
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "first-candle",
  useTrail: false,
  useVwapExit: false,
  expiryKind: "weekly",
  strikeOffset: 0,
  dailyLiveIst: "09:00",
  firstBarStartIst: "09:00",
  entryEvaluationIst: "09:05",
  endTimeIst: "15:15",
};

const FIRST_CANDLE_TIMEFRAMES = { "1m": 1, "5m": 5, "15m": 15 };

export function parseIstHm(value, fallback = "09:00") {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function firstCandleBarMinutes(timeframe) {
  return FIRST_CANDLE_TIMEFRAMES[String(timeframe || "")] || 5;
}

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

export function isNiftyFirstCandleAlgo(algo = {}) {
  return (
    algo.kind === NIFTY_FIRST_CANDLE_KIND ||
    algo.strategyType === NIFTY_FIRST_CANDLE_TYPE ||
    algo.indicator === "NIFTY_FIRST_CANDLE"
  );
}

export function isNiftyOptionEngineAlgo(algo = {}) {
  return isNiftyVwapAlgo(algo) || isNiftyVwapReversalAlgo(algo) || isNiftyFirstCandleAlgo(algo);
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

export function niftyFirstCandleConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.lotSize)));
  const timeframe = FIRST_CANDLE_TIMEFRAMES[algo.timeframe] ? algo.timeframe : DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.timeframe;
  const barMinutes = firstCandleBarMinutes(timeframe);
  const expiryKind = String(algo.expiryKind || "").toLowerCase() === "monthly" ? "monthly" : "weekly";
  const strikeOffset = Math.max(-2, Math.min(2, Math.round(num(algo.strikeOffset, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.strikeOffset))));
  const rawFirst = String(algo.firstBarStartIst || "").trim();
  const firstBarStartIst = parseIstHm(
    !rawFirst || (rawFirst === "09:15" && !String(algo.entryEvaluationIst || "").trim())
      ? DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.firstBarStartIst
      : rawFirst,
    DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.firstBarStartIst,
  );
  const endTimeIst = parseIstHm(algo.endTimeIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.endTimeIst);
  const endParts = endTimeIst.split(":").map(Number);
  const eodFromEnd = Math.max(0, 15 * 60 + 30 - (endParts[0] * 60 + endParts[1]));
  const eodSquareOffMinutes = String(algo.endTimeIst || "").trim()
    ? eodFromEnd
    : Math.max(0, Math.round(num(algo.eodSquareOffMinutes, eodFromEnd)));
  return {
    timeframe,
    initialSlPct: Math.max(1, num(algo.initialSlPct ?? algo.slPct, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.initialSlPct)),
    targetPct: Math.max(1, num(algo.targetPct ?? algo.targetProfitPct, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.targetPct)),
    trailingActivationPct: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingActivationPct,
    trailingStepPct: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingStepPct,
    vwapExitCandles: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.vwapExitCandles,
    maxPositions: 1,
    maxTradesPerDay: Math.max(1, Math.round(num(algo.maxTradesPerDay, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.maxTradesPerDay))),
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes,
    barMinutes,
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "first-candle",
    useTrail: false,
    useVwapExit: false,
    expiryKind,
    strikeOffset,
    dailyLiveIst: parseIstHm(algo.dailyLiveIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.dailyLiveIst),
    firstBarStartIst,
    entryEvaluationIst: parseIstHm(algo.entryEvaluationIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.entryEvaluationIst),
    endTimeIst: parseIstHm(algo.endTimeIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.endTimeIst),
  };
}

export function optionEngineConfig(algo = {}) {
  if (isNiftyVwapReversalAlgo(algo)) return niftyVwapReversalConfig(algo);
  if (isNiftyFirstCandleAlgo(algo)) return niftyFirstCandleConfig(algo);
  return niftyVwapConfig(algo);
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
    dailyLiveIst: "09:20",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_VWAP_REVERSAL_KIND,
    strategyType: NIFTY_VWAP_REVERSAL_TYPE,
    enabled: false,
  };
}

export function defaultNiftyFirstCandleAlgo(patch = {}) {
  const cfg = niftyFirstCandleConfig(patch);
  return {
    name: patch.name || "NIFTY 5m first candle",
    kind: NIFTY_FIRST_CANDLE_KIND,
    strategyType: NIFTY_FIRST_CANDLE_TYPE,
    tag: "5m first",
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
    maxTradesPerDay: cfg.maxTradesPerDay,
    intradayOnly: true,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    expiryKind: cfg.expiryKind,
    strikeOffset: cfg.strikeOffset,
    firstBarStartIst: cfg.firstBarStartIst,
    entryEvaluationIst: cfg.entryEvaluationIst,
    endTimeIst: cfg.endTimeIst,
    indicator: "NIFTY_FIRST_CANDLE",
    buyLeft: "price",
    buyOp: "close_above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "close_below",
    sellRight: "vwap",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    dailyLiveIst: cfg.dailyLiveIst,
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_FIRST_CANDLE_KIND,
    strategyType: NIFTY_FIRST_CANDLE_TYPE,
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    slPct: cfg.initialSlPct,
    initialSlPct: cfg.initialSlPct,
    targetPct: cfg.targetPct,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    timeframe: cfg.timeframe,
    expiryKind: cfg.expiryKind,
    strikeOffset: cfg.strikeOffset,
    maxTradesPerDay: cfg.maxTradesPerDay,
    dailyLiveIst: cfg.dailyLiveIst,
    firstBarStartIst: cfg.firstBarStartIst,
    entryEvaluationIst: cfg.entryEvaluationIst,
    endTimeIst: cfg.endTimeIst,
    enabled: false,
  };
}
