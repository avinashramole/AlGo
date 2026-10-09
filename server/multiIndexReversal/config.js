export const MULTI_INDEX_REVERSAL_KIND = "multi-index-reversal";
export const MULTI_INDEX_REVERSAL_TYPE = "MULTI_INDEX_REVERSAL";
export const MULTI_INDEX_REVERSAL_NAME = "Multi-Index";
export const MULTI_INDEX_REVERSAL_NAMES = [MULTI_INDEX_REVERSAL_NAME, "Multi-Index Reversal Strategy"];

export const MULTI_INDEX_SCRIPTS = [
  { id: "NIFTY", label: "NIFTY 50", exchange: "NSE", segment: "NSE_FNO" },
  { id: "BANKNIFTY", label: "BANK NIFTY", exchange: "NSE", segment: "NSE_FNO" },
  { id: "FINNIFTY", label: "FINNIFTY", exchange: "NSE", segment: "NSE_FNO" },
  { id: "SENSEX", label: "SENSEX", exchange: "BSE", segment: "BSE_FNO" },
];

export const MULTI_INDEX_TIMEFRAMES = {
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "1H": 60,
  "1h": 60,
};

export const DEFAULT_MULTI_INDEX_REVERSAL_CONFIG = {
  name: MULTI_INDEX_REVERSAL_NAME,
  symbol: "NIFTY",
  exchange: "NSE",
  timeframe: "15m",
  barMinutes: 15,
  strikeOffset: 0,
  initialTargetPct: 40,
  reversalLossPct: 20,
  reversalQtyMultiple: 2,
  combinedTargetPct: 20,
  combinedTargetBasis: "original",
  lots: 1,
  lotSize: 65,
  maxCycleLossPct: 0,
  maxOrderRetries: 3,
  brokeragePerLot: 40,
  expiryKind: "weekly",
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function multiIndexScript(symbol = "") {
  const raw = String(symbol || "").toUpperCase().replace(/\s+/g, "");
  if (!raw) return MULTI_INDEX_SCRIPTS[0];
  if (raw === "NIFTY50" || raw === "NIFTY") return MULTI_INDEX_SCRIPTS[0];
  if (raw === "BANKNIFTY" || raw === "BANKNIFTY50") return MULTI_INDEX_SCRIPTS[1];
  if (raw === "FINNIFTY") return MULTI_INDEX_SCRIPTS[2];
  if (raw === "SENSEX") return MULTI_INDEX_SCRIPTS[3];
  return null;
}

export function isMultiIndexReversalAlgo(algo = {}) {
  if (algo.kind === MULTI_INDEX_REVERSAL_KIND || algo.strategyType === MULTI_INDEX_REVERSAL_TYPE || algo.indicator === "MULTI_INDEX_REVERSAL") {
    return true;
  }
  return MULTI_INDEX_REVERSAL_NAMES.includes(String(algo.name || "").trim());
}

export function multiIndexReversalConfig(algo = {}) {
  const script = multiIndexScript(algo.symbol || algo.index || DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.symbol) || MULTI_INDEX_SCRIPTS[0];
  const tfKey = MULTI_INDEX_TIMEFRAMES[algo.timeframe] ? (algo.timeframe === "1h" ? "1H" : algo.timeframe) : DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.timeframe;
  const barMinutes = MULTI_INDEX_TIMEFRAMES[tfKey] || 15;
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, script.id === "NIFTY" ? 65 : script.id === "BANKNIFTY" ? 30 : script.id === "FINNIFTY" ? 60 : 20)));
  const basis = String(algo.combinedTargetBasis || DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.combinedTargetBasis) === "combined" ? "combined" : "original";
  return {
    name: MULTI_INDEX_REVERSAL_NAME,
    symbol: script.id,
    indexLabel: script.label,
    exchange: script.exchange,
    segment: script.segment,
    timeframe: tfKey === "1h" ? "1H" : tfKey,
    barMinutes,
    strikeOffset: Math.max(-4, Math.min(4, Math.round(num(algo.strikeOffset, 0)))),
    initialTargetPct: Math.min(200, Math.max(1, num(algo.initialTargetPct ?? algo.targetPct, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.initialTargetPct))),
    reversalLossPct: Math.min(90, Math.max(1, num(algo.reversalLossPct ?? algo.hedgeTriggerPct, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.reversalLossPct))),
    reversalQtyMultiple: Math.min(10, Math.max(1, num(algo.reversalQtyMultiple ?? algo.hedgeLots, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.reversalQtyMultiple))),
    combinedTargetPct: Math.min(200, Math.max(1, num(algo.combinedTargetPct ?? algo.accountProfitPct, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.combinedTargetPct))),
    combinedTargetBasis: basis,
    lots,
    lotSize,
    qty: lots * lotSize,
    maxCycleLossPct: Math.max(0, num(algo.maxCycleLossPct, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.maxCycleLossPct)),
    maxOrderRetries: Math.max(1, Math.round(num(algo.maxOrderRetries, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.maxOrderRetries))),
    brokeragePerLot: Math.max(0, num(algo.brokeragePerLot, DEFAULT_MULTI_INDEX_REVERSAL_CONFIG.brokeragePerLot)),
    expiryKind: String(algo.expiryKind || "weekly") === "monthly" ? "monthly" : "weekly",
  };
}

export function validateMultiIndexReversal(algo = {}) {
  const raw = String(algo.symbol || algo.index || "").trim();
  if (raw && !multiIndexScript(raw)) return "Unsupported index. Pick NIFTY 50, BANK NIFTY, FINNIFTY, or SENSEX.";
  const cfg = multiIndexReversalConfig(algo);
  if (!MULTI_INDEX_SCRIPTS.some((row) => row.id === cfg.symbol)) return "Pick NIFTY 50, BANK NIFTY, FINNIFTY, or SENSEX.";
  const tfRaw = String(algo.timeframe || cfg.timeframe || "").trim();
  if (tfRaw && !MULTI_INDEX_TIMEFRAMES[tfRaw] && !MULTI_INDEX_TIMEFRAMES[tfRaw.toLowerCase()]) {
    return "Candle timeframe must be 5m, 10m, 15m, 30m, or 1h.";
  }
  if (cfg.strikeOffset < -4 || cfg.strikeOffset > 4) return "Strike offset must be between -4 and +4.";
  if (!(cfg.initialTargetPct > 0)) return "Initial target must be greater than 0.";
  if (!(cfg.reversalLossPct > 0)) return "Reversal loss trigger must be greater than 0.";
  if (!(cfg.reversalQtyMultiple >= 1)) return "Reversal quantity multiplier must be at least 1.";
  if (!(cfg.combinedTargetPct > 0)) return "Combined target must be greater than 0.";
  if (cfg.combinedTargetBasis !== "original" && cfg.combinedTargetBasis !== "combined") return "Combined target basis is invalid.";
  return "";
}

export function defaultMultiIndexReversalAlgo(patch = {}) {
  const cfg = multiIndexReversalConfig(patch);
  const runMode = ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "paper";
  return {
    name: MULTI_INDEX_REVERSAL_NAME,
    kind: MULTI_INDEX_REVERSAL_KIND,
    strategyType: MULTI_INDEX_REVERSAL_TYPE,
    tag: "multi-index",
    symbol: cfg.symbol,
    instrument: "option",
    optionType: "CE",
    strikeOffset: cfg.strikeOffset,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: cfg.timeframe,
    initialTargetPct: cfg.initialTargetPct,
    targetPct: cfg.initialTargetPct,
    reversalLossPct: cfg.reversalLossPct,
    hedgeTriggerPct: cfg.reversalLossPct,
    reversalQtyMultiple: cfg.reversalQtyMultiple,
    combinedTargetPct: cfg.combinedTargetPct,
    combinedTargetBasis: cfg.combinedTargetBasis,
    maxCycleLossPct: cfg.maxCycleLossPct,
    maxPositions: 2,
    intradayOnly: true,
    eodSquareOffMinutes: 15,
    expiryKind: cfg.expiryKind,
    indicator: "MULTI_INDEX_REVERSAL",
    runMode,
    brokerId: runMode === "live" ? patch.brokerId || "dhan" : "paper",
    enabled: false,
    status: runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    name: MULTI_INDEX_REVERSAL_NAME,
    kind: MULTI_INDEX_REVERSAL_KIND,
    strategyType: MULTI_INDEX_REVERSAL_TYPE,
    indicator: "MULTI_INDEX_REVERSAL",
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    strikeOffset: cfg.strikeOffset,
    enabled: false,
  };
}
