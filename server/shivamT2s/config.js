export const SHIVAM_T2S_KIND = "shivam-t2s";
export const SHIVAM_T2S_TYPE = "SHIVAM_T2S";
export const SHIVAM_T2S_NAME = "Shivam T2S Strategy";
export const SHIVAM_T2S_NAMES = [SHIVAM_T2S_NAME, "Shivam T2S", "SHIVAM T2S"];
export const SHIVAM_T2S_SEED_ID = "a16";

export const SHIVAM_T2S_SCRIPTS = [
  { id: "NIFTY", label: "NIFTY 50", exchange: "NSE", segment: "NSE_FNO", futures: "NIFTY FUT" },
  { id: "BANKNIFTY", label: "BANK NIFTY", exchange: "NSE", segment: "NSE_FNO", futures: "BANKNIFTY FUT" },
  { id: "FINNIFTY", label: "FINNIFTY", exchange: "NSE", segment: "NSE_FNO", futures: "FINNIFTY FUT" },
  { id: "MIDCPNIFTY", label: "MIDCPNIFTY", exchange: "NSE", segment: "NSE_FNO", futures: "MIDCPNIFTY FUT" },
  { id: "SENSEX", label: "SENSEX", exchange: "BSE", segment: "BSE_FNO", futures: "SENSEX FUT" },
];

export const SHIVAM_T2S_TIMEFRAMES = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "10m": 10,
  "15m": 15,
};

export const SHIVAM_STRIKE_POLICIES = ["ATM", "ITM", "OTM"];
export const SHIVAM_VALUE_MODES = ["percentage", "points"];
export const SHIVAM_CAPITAL_MODES = ["amount", "percent"];
export const SHIVAM_CE_CONFIRM_COLOR = "GREEN";
export const SHIVAM_PE_CONFIRM_COLOR = "GREEN";
export const SHIVAM_MIN_DAILY_TRADES = 1;
export const SHIVAM_MAX_DAILY_TRADES = 100;

export const DEFAULT_SHIVAM_T2S_CONFIG = {
  name: SHIVAM_T2S_NAME,
  symbol: "NIFTY",
  futuresInstrument: "NIFTY FUT",
  ceTimeframe: "5m",
  peTimeframe: "5m",
  indexTimeframe: "5m",
  ceConfirmColor: SHIVAM_CE_CONFIRM_COLOR,
  peConfirmColor: SHIVAM_PE_CONFIRM_COLOR,
  slMode: "percentage",
  slValue: 20,
  targetMode: "percentage",
  targetValue: 40,
  maxTradesPerDay: 5,
  lots: 1,
  capitalMode: "amount",
  capitalValue: 50000,
  autoSizeLots: false,
  strikePolicy: "ATM",
  strikeOffset: 0,
  tickSize: 0.05,
  brokeragePerLot: 40,
  expiryKind: "weekly",
  protectivePolicy: "block-until-confirmed",
  liveAuthorized: false,
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function shivamScript(symbol = "") {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw || raw === "NIFTY50" || raw === "NIFTY") return SHIVAM_T2S_SCRIPTS[0];
  if (raw === "BANKNIFTY" || raw === "BANKNIFTY50") return SHIVAM_T2S_SCRIPTS[1];
  if (raw === "FINNIFTY") return SHIVAM_T2S_SCRIPTS[2];
  if (raw === "MIDCPNIFTY" || raw === "MIDCAPNIFTY") return SHIVAM_T2S_SCRIPTS[3];
  if (raw === "SENSEX") return SHIVAM_T2S_SCRIPTS[4];
  return null;
}

export function isShivamT2sAlgo(algo = {}) {
  if (algo.kind === SHIVAM_T2S_KIND || algo.strategyType === SHIVAM_T2S_TYPE || algo.indicator === "SHIVAM_T2S") {
    return true;
  }
  return SHIVAM_T2S_NAMES.includes(String(algo.name || "").trim());
}

export function resolveShivamTimeframe(value, fallback = "5m") {
  const raw = String(value || "").trim();
  if (SHIVAM_T2S_TIMEFRAMES[raw]) return raw;
  const match = raw.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/i) || raw.match(/^(\d+)$/);
  const minutes = match ? Number(match[1]) : NaN;
  if (SHIVAM_T2S_TIMEFRAMES[`${minutes}m`]) return `${minutes}m`;
  return fallback;
}

export function clampShivamDailyTradeLimit(value, fallback = DEFAULT_SHIVAM_T2S_CONFIG.maxTradesPerDay) {
  const n = Number(value);
  const base = Number.isFinite(n) ? n : Number(fallback);
  return Math.max(
    SHIVAM_MIN_DAILY_TRADES,
    Math.min(SHIVAM_MAX_DAILY_TRADES, Math.round(Number.isFinite(base) ? base : DEFAULT_SHIVAM_T2S_CONFIG.maxTradesPerDay)),
  );
}

function modeOf(value, allowed, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

function strikePolicyOf(value) {
  const raw = String(value || "ATM").trim().toUpperCase();
  return SHIVAM_STRIKE_POLICIES.includes(raw) ? raw : "ATM";
}

export function shivamT2sConfig(algo = {}) {
  const script = shivamScript(algo.symbol || algo.index || DEFAULT_SHIVAM_T2S_CONFIG.symbol) || SHIVAM_T2S_SCRIPTS[0];
  const ceTimeframe = resolveShivamTimeframe(algo.ceTimeframe || algo.timeframe, DEFAULT_SHIVAM_T2S_CONFIG.ceTimeframe);
  const peTimeframe = resolveShivamTimeframe(algo.peTimeframe || algo.timeframe, DEFAULT_SHIVAM_T2S_CONFIG.peTimeframe);
  const indexTimeframe = resolveShivamTimeframe(
    algo.indexTimeframe || algo.confirmationTimeframe || algo.timeframe,
    DEFAULT_SHIVAM_T2S_CONFIG.indexTimeframe,
  );
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_SHIVAM_T2S_CONFIG.lots)));
  const liveAuthorized = false;
  const runMode = String(algo.runMode) === "backtest" ? "backtest" : "paper";
  return {
    name: SHIVAM_T2S_NAME,
    symbol: script.id,
    indexLabel: script.label,
    futuresInstrument: script.futures,
    exchange: script.exchange,
    segment: script.segment,
    ceTimeframe,
    peTimeframe,
    indexTimeframe,
    timeframe: indexTimeframe,
    ceBarMinutes: SHIVAM_T2S_TIMEFRAMES[ceTimeframe],
    peBarMinutes: SHIVAM_T2S_TIMEFRAMES[peTimeframe],
    indexBarMinutes: SHIVAM_T2S_TIMEFRAMES[indexTimeframe],
    ceConfirmColor: SHIVAM_CE_CONFIRM_COLOR,
    peConfirmColor: SHIVAM_PE_CONFIRM_COLOR,
    slMode: modeOf(algo.slMode, SHIVAM_VALUE_MODES, DEFAULT_SHIVAM_T2S_CONFIG.slMode),
    slValue: Math.max(0.01, num(algo.slValue ?? algo.initialSlPct ?? algo.slPct, DEFAULT_SHIVAM_T2S_CONFIG.slValue)),
    targetMode: modeOf(algo.targetMode, SHIVAM_VALUE_MODES, DEFAULT_SHIVAM_T2S_CONFIG.targetMode),
    targetValue: Math.max(0.01, num(algo.targetValue ?? algo.targetPct, DEFAULT_SHIVAM_T2S_CONFIG.targetValue)),
    maxTradesPerDay: clampShivamDailyTradeLimit(algo.maxTradesPerDay),
    lots,
    capitalMode: modeOf(algo.capitalMode, SHIVAM_CAPITAL_MODES, DEFAULT_SHIVAM_T2S_CONFIG.capitalMode),
    capitalValue: Math.max(0, num(algo.capitalValue, DEFAULT_SHIVAM_T2S_CONFIG.capitalValue)),
    autoSizeLots: algo.autoSizeLots === true,
    strikePolicy: strikePolicyOf(algo.strikePolicy),
    strikeOffset: Math.max(0, Math.min(8, Math.round(num(algo.strikeOffset, 0)))),
    tickSize: Math.max(0.01, num(algo.tickSize, DEFAULT_SHIVAM_T2S_CONFIG.tickSize)),
    brokeragePerLot: Math.max(0, num(algo.brokeragePerLot, DEFAULT_SHIVAM_T2S_CONFIG.brokeragePerLot)),
    expiryKind: String(algo.expiryKind || "weekly") === "monthly" ? "monthly" : "weekly",
    protectivePolicy: String(algo.protectivePolicy || DEFAULT_SHIVAM_T2S_CONFIG.protectivePolicy),
    liveAuthorized,
    runMode,
    enabled: algo.enabled === true,
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes: Math.max(0, Math.round(num(algo.eodSquareOffMinutes, 15))),
  };
}

export function validateShivamT2s(algo = {}) {
  const raw = String(algo.symbol || algo.index || "").trim();
  if (raw && !shivamScript(raw)) return "Unsupported index. Pick NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, or SENSEX.";
  const cfg = shivamT2sConfig(algo);
  const tfError = (label, value) => {
    const rawTf = String(value || "").trim();
    if (rawTf && !SHIVAM_T2S_TIMEFRAMES[rawTf] && !SHIVAM_T2S_TIMEFRAMES[resolveShivamTimeframe(rawTf, "")]) {
      return `${label} must be 1, 3, 5, 10, or 15 minutes.`;
    }
    return "";
  };
  const ceTf = tfError("CE candle timeframe", algo.ceTimeframe);
  if (ceTf) return ceTf;
  const peTf = tfError("PE candle timeframe", algo.peTimeframe);
  if (peTf) return peTf;
  const indexTf = tfError("Index/futures confirmation timeframe", algo.indexTimeframe || algo.confirmationTimeframe);
  if (indexTf) return indexTf;
  const slRaw = algo.slValue ?? algo.initialSlPct ?? algo.slPct;
  const tgtRaw = algo.targetValue ?? algo.targetPct;
  if (slRaw != null && !(Number(slRaw) > 0)) return "Stop-loss value must be greater than 0.";
  if (tgtRaw != null && !(Number(tgtRaw) > 0)) return "Target value must be greater than 0.";
  if (!(cfg.slValue > 0)) return "Stop-loss value must be greater than 0.";
  if (!(cfg.targetValue > 0)) return "Target value must be greater than 0.";
  if (cfg.slMode === "percentage" && cfg.slValue >= 100) return "Stop-loss percentage must be below 100.";
  if (!(cfg.lots >= 1)) return "Lots per entry must be a positive integer.";
  if (cfg.capitalMode === "percent" && (cfg.capitalValue <= 0 || cfg.capitalValue > 100)) {
    return "Capital allocation percent must be between 0 and 100.";
  }
  if (cfg.capitalMode === "amount" && !(cfg.capitalValue > 0)) return "Capital allocation amount must be greater than 0.";
  return "";
}

export function defaultShivamT2sAlgo(patch = {}) {
  const cfg = shivamT2sConfig(patch);
  return {
    name: SHIVAM_T2S_NAME,
    kind: SHIVAM_T2S_KIND,
    strategyType: SHIVAM_T2S_TYPE,
    tag: "shivam-t2s",
    symbol: cfg.symbol,
    instrument: "option",
    optionType: "CE",
    strikePolicy: cfg.strikePolicy,
    strikeOffset: cfg.strikeOffset,
    side: "BUY",
    lots: cfg.lots,
    ceTimeframe: cfg.ceTimeframe,
    peTimeframe: cfg.peTimeframe,
    indexTimeframe: cfg.indexTimeframe,
    timeframe: cfg.indexTimeframe,
    slMode: cfg.slMode,
    slValue: cfg.slValue,
    slPct: cfg.slMode === "percentage" ? cfg.slValue : undefined,
    initialSlPct: cfg.slMode === "percentage" ? cfg.slValue : undefined,
    targetMode: cfg.targetMode,
    targetValue: cfg.targetValue,
    targetPct: cfg.targetMode === "percentage" ? cfg.targetValue : undefined,
    maxTradesPerDay: cfg.maxTradesPerDay,
    maxPositions: 1,
    capitalMode: cfg.capitalMode,
    capitalValue: cfg.capitalValue,
    autoSizeLots: false,
    expiryKind: cfg.expiryKind,
    indicator: "SHIVAM_T2S",
    runMode: "paper",
    liveAuthorized: false,
    brokerId: "paper",
    enabled: false,
    status: "PAUSED",
    intradayOnly: true,
    eodSquareOffMinutes: 15,
    ...patch,
    name: SHIVAM_T2S_NAME,
    kind: SHIVAM_T2S_KIND,
    strategyType: SHIVAM_T2S_TYPE,
    indicator: "SHIVAM_T2S",
    symbol: cfg.symbol,
    testDesk: patch.testDesk === true,
    runMode: cfg.runMode === "backtest" || patch.runMode === "backtest" ? "backtest" : "paper",
    liveAuthorized: false,
    brokerId: "paper",
    enabled: patch.enabled === true,
  };
}
