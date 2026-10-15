import { parseBarMinutes, resolveDeskTimeframe } from "../deskTimeframe.js";

export const SHIVAM_T2S_KIND = "shivam-t2s";
export const SHIVAM_T2S_TYPE = "SHIVAM_T2S";
export const SHIVAM_T2S_NAME = "Shivam T2S Strategy";
export const SHIVAM_T2S_NAMES = [SHIVAM_T2S_NAME, "Shivam T2S", "SHIVAM T2S"];
export const SHIVAM_T2S_SEED_ID = "a16";

export const SHIVAM_T2S_SCRIPTS = [
  { id: "NIFTY", label: "NIFTY 50", exchange: "NSE", segment: "NSE_FNO", session: "nse", expiryKind: "weekly", futures: "NIFTY FUT" },
  { id: "BANKNIFTY", label: "BANK NIFTY", exchange: "NSE", segment: "NSE_FNO", session: "nse", expiryKind: "weekly", futures: "BANKNIFTY FUT" },
  { id: "FINNIFTY", label: "FINNIFTY", exchange: "NSE", segment: "NSE_FNO", session: "nse", expiryKind: "weekly", futures: "FINNIFTY FUT" },
  { id: "MIDCPNIFTY", label: "MIDCPNIFTY", exchange: "NSE", segment: "NSE_FNO", session: "nse", expiryKind: "weekly", futures: "MIDCPNIFTY FUT" },
  { id: "SENSEX", label: "SENSEX", exchange: "BSE", segment: "BSE_FNO", session: "nse", expiryKind: "weekly", futures: "SENSEX FUT" },
  { id: "CRUDEOIL", label: "CRUDE OIL", exchange: "MCX", segment: "MCX_COMM", session: "mcx", expiryKind: "monthly", futures: "CRUDEOIL FUT" },
  { id: "COPPER", label: "COPPER", exchange: "MCX", segment: "MCX_COMM", session: "mcx", expiryKind: "monthly", futures: "COPPER FUT" },
  { id: "NATURALGAS", label: "NATURAL GAS", exchange: "MCX", segment: "MCX_COMM", session: "mcx", expiryKind: "monthly", futures: "NATURALGAS FUT" },
];

export const SHIVAM_SCRIPT_PICK_ERROR =
  "Unsupported index. Pick NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, CRUDEOIL, COPPER, or NATURALGAS.";

const SHIVAM_SCRIPT_ALIASES = {
  NIFTY: "NIFTY",
  NIFTY50: "NIFTY",
  BANKNIFTY: "BANKNIFTY",
  BANKNIFTY50: "BANKNIFTY",
  FINNIFTY: "FINNIFTY",
  MIDCPNIFTY: "MIDCPNIFTY",
  MIDCAPNIFTY: "MIDCPNIFTY",
  SENSEX: "SENSEX",
  CRUDE: "CRUDEOIL",
  CRUDEOIL: "CRUDEOIL",
  CRUDEOILFUT: "CRUDEOIL",
  COPPER: "COPPER",
  COPPERFUT: "COPPER",
  NATURALGAS: "NATURALGAS",
  NATGAS: "NATURALGAS",
  NATURALGASFUT: "NATURALGAS",
};

export const SHIVAM_T2S_TIMEFRAMES = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1H": 60,
  "1h": 60,
  "60m": 60,
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
  if (!raw) return SHIVAM_T2S_SCRIPTS[0];
  const id = SHIVAM_SCRIPT_ALIASES[raw] || "";
  return SHIVAM_T2S_SCRIPTS.find((row) => row.id === id) || null;
}

export function isShivamT2sAlgo(algo = {}) {
  if (algo.kind === SHIVAM_T2S_KIND || algo.strategyType === SHIVAM_T2S_TYPE || algo.indicator === "SHIVAM_T2S") {
    return true;
  }
  return SHIVAM_T2S_NAMES.includes(String(algo.name || "").trim());
}

export function resolveShivamTimeframe(value, fallback = "5m") {
  return resolveDeskTimeframe(value, fallback);
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
  const liveAuthorized = algo.liveAuthorized === true;
  const requested = String(algo.runMode || "paper").toLowerCase();
  const runMode = requested === "backtest" ? "backtest" : requested === "live" && liveAuthorized ? "live" : "paper";
  const mcx = script.session === "mcx" || script.segment === "MCX_COMM";
  return {
    name: SHIVAM_T2S_NAME,
    symbol: script.id,
    indexLabel: script.label,
    futuresInstrument: script.futures,
    exchange: script.exchange,
    segment: script.segment,
    session: mcx ? "mcx" : "nse",
    ceTimeframe,
    peTimeframe,
    indexTimeframe,
    timeframe: indexTimeframe,
    ceBarMinutes: parseBarMinutes(ceTimeframe),
    peBarMinutes: parseBarMinutes(peTimeframe),
    indexBarMinutes: parseBarMinutes(indexTimeframe),
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
    expiryKind: mcx ? "monthly" : String(algo.expiryKind || "weekly") === "monthly" ? "monthly" : "weekly",
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
  if (raw && !shivamScript(raw)) return SHIVAM_SCRIPT_PICK_ERROR;
  const cfg = shivamT2sConfig(algo);
  const tfError = (label, value) => {
    const rawTf = String(value || "").trim();
    if (rawTf && !parseBarMinutes(rawTf, 0)) {
      return `${label} must be 5m, 15m, 30m, 1hr, or custom 1–60 minutes.`;
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
    autoSizeLots: cfg.autoSizeLots,
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
    expiryKind: cfg.expiryKind,
    testDesk: true,
    autoSizeLots: cfg.autoSizeLots,
    runMode: cfg.runMode,
    liveAuthorized: cfg.liveAuthorized,
    brokerId:
      cfg.runMode === "live"
        ? patch.brokerId && String(patch.brokerId).toLowerCase() !== "paper"
          ? String(patch.brokerId)
          : "dhan"
        : "paper",
    enabled: patch.enabled === true,
  };
}
