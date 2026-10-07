export const NIFTY_VWAP_KIND = "nifty-vwap";
export const NIFTY_VWAP_TYPE = "NIFTY_VWAP_ATM";
export const NIFTY_VWAP_REVERSAL_KIND = "nifty-vwap-reversal";
export const NIFTY_VWAP_REVERSAL_TYPE = "NIFTY_VWAP_REVERSAL_15M";
export const NIFTY_FIRST_CANDLE_KIND = "nifty-first-candle";
export const NIFTY_FIRST_CANDLE_TYPE = "NIFTY_FIRST_CANDLE_5M";
export const NIFTY_FIRST_CANDLE_NAME = "NIFTY";
export const CRUDE_FIRST_CANDLE_KIND = "crude-first-candle";
export const CRUDE_FIRST_CANDLE_TYPE = "CRUDE_FIRST_CANDLE_5M";
export const CRUDE_FIRST_CANDLE_NAME = "CRUDE OIL";
export const ALWAYS_ON_FIRST_CANDLE_IDS = ["a10", "a12"];
export const NIFTY_TEST_KIND = "nifty-test";
export const NIFTY_TEST_TYPE = "NIFTY_TEST";
export const NIFTY_TEST1_KIND = "nifty-test1";
export const NIFTY_TEST1_TYPE = "NIFTY_TEST1";
export const NIFTY_TEST2_KIND = "nifty-test2";
export const NIFTY_TEST2_TYPE = "NIFTY_TEST2";
export const NIFTY_TEST2_NAME = "TEST2";

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
  trailingActivationPct: 20,
  trailingStepPct: 5,
  trailingEveryPct: 10,
  trailingShiftPct: 5,
  vwapExitCandles: 5,
  maxPositions: 1,
  maxTradesPerDay: 5,
  intradayOnly: true,
  eodSquareOffMinutes: 15,
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "first-candle",
  useTrail: true,
  useVwapExit: false,
  expiryKind: "weekly",
  strikeOffset: 0,
  dailyLiveIst: "09:00",
  firstBarStartIst: "09:00",
  entryEvaluationIst: "09:05",
  endTimeIst: "15:15",
};

export const DEFAULT_CRUDE_FIRST_CANDLE_CONFIG = {
  ...DEFAULT_NIFTY_FIRST_CANDLE_CONFIG,
  symbol: "CRUDEOIL",
  lotSize: 100,
  expiryKind: "monthly",
  endTimeIst: "23:15",
  eodSquareOffMinutes: 15,
};

const FIRST_CANDLE_TIMEFRAMES = { "1m": 1, "5m": 5, "15m": 15 };
const NIFTY_TEST_TIMEFRAMES = { "1m": 1, "5m": 5, "15m": 15, "1H": 60 };

export const DEFAULT_NIFTY_TEST_CONFIG = {
  timeframe: "5m",
  slPct: 0.4,
  targetPct: 0.8,
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "current-open",
  startTimeIst: "09:15",
  endTimeIst: "15:15",
};

export const TEST1_SCRIPTS = [
  { id: "NIFTY", label: "NIFTY", lot: 65, step: 50, expiryKind: "weekly", session: "nse", endTimeIst: "15:15" },
  { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30, step: 100, expiryKind: "monthly", session: "nse", endTimeIst: "15:15" },
  { id: "FINNIFTY", label: "FINNIFTY", lot: 60, step: 50, expiryKind: "monthly", session: "nse", endTimeIst: "15:15" },
  { id: "MIDCPNIFTY", label: "MIDCPNIFTY", lot: 50, step: 25, expiryKind: "monthly", session: "nse", endTimeIst: "15:15" },
  { id: "SENSEX", label: "SENSEX", lot: 20, step: 100, expiryKind: "weekly", session: "nse", endTimeIst: "15:15" },
  { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100, step: 50, expiryKind: "monthly", session: "mcx", endTimeIst: "23:15" },
  { id: "NATURALGAS", label: "NATURAL GAS", lot: 1250, step: 5, expiryKind: "monthly", session: "mcx", endTimeIst: "23:15" },
  { id: "COPPER", label: "COPPER", lot: 2500, step: 5, expiryKind: "monthly", session: "mcx", endTimeIst: "23:15" },
];

export const DEFAULT_NIFTY_TEST2_CONFIG = {
  timeframe: "5m",
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "test2-premium-strangle",
  startTimeIst: "09:35",
  endTimeIst: "15:15",
  exitTimeIst: "15:15",
  sellPremium: 80,
  hedgePremium: 20,
  hedgeSlPct: 20,
  overallSl: 30000,
  overallTarget: 0,
  overallTargetPct: 5,
  costPerCombo: 80,
  maxTradesPerDay: 1,
  maxPositions: 4,
  holdStyle: "btst",
  product: "NRML",
  holdOvernight: true,
  intradayOnly: false,
  eodSquareOffMinutes: 0,
};

export function test2HoldStyle(algo = {}) {
  const raw = String(algo.holdStyle || "").trim().toLowerCase();
  if (raw === "intraday" || raw === "mis") return "intraday";
  return "btst";
}

export const DEFAULT_NIFTY_TEST1_CONFIG = {
  timeframe: "5m",
  barMinutes: 5,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  signalMode: "test1-atm-green",
  startTimeIst: "09:30",
  endTimeIst: "15:15",
  minBodyPct: 0.9,
  maxWickPct: 0.1,
  targetMultiple: 1,
  targetSource: "body",
  strikeOffset: 0,
  expiryKind: "weekly",
  maxPositions: 1,
  intradayOnly: true,
  eodSquareOffMinutes: 15,
};

export function test1Script(symbol) {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  const id = raw.includes("MIDCPNIFTY")
    ? "MIDCPNIFTY"
    : raw.includes("BANKNIFTY")
      ? "BANKNIFTY"
      : raw.includes("FINNIFTY")
        ? "FINNIFTY"
        : raw.includes("SENSEX")
          ? "SENSEX"
          : raw.includes("CRUDEOIL")
            ? "CRUDEOIL"
            : raw.includes("NATURALGAS") || raw.includes("NATGAS")
              ? "NATURALGAS"
              : raw.includes("COPPER")
                ? "COPPER"
                : raw.includes("NIFTY")
                  ? "NIFTY"
                  : "";
  return TEST1_SCRIPTS.find((row) => row.id === id) || TEST1_SCRIPTS[0];
}

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

export function addIstMinutes(hm, minutes, fallback = "09:00") {
  const clock = parseIstHm(hm, fallback);
  const [hour, minute] = clock.split(":").map(Number);
  const total = (hour * 60 + minute + Math.max(0, Math.round(Number(minutes) || 0))) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A 5m clock of 09:05 follows a change to 15m (09:15) or 1m (09:01). A custom time stays. */
export function firstCandleEntryIst(firstBarStartIst, timeframe, storedEntry) {
  const minutes = firstCandleBarMinutes(timeframe);
  const start = parseIstHm(firstBarStartIst, "09:00");
  const barClose = addIstMinutes(start, minutes, start);
  const stored = String(storedEntry || "").trim();
  if (!stored) return barClose;
  const parsed = parseIstHm(stored, barClose);
  const otherClocks = Object.values(FIRST_CANDLE_TIMEFRAMES)
    .filter((step) => step !== minutes)
    .map((step) => addIstMinutes(start, step, start));
  if (otherClocks.includes(parsed)) return barClose;
  return parsed;
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

export function isNiftyFirstCandleName(name = "") {
  const text = String(name || "").trim();
  if (!text || /crude/i.test(text)) return false;
  if (/^nifty$/i.test(text)) return true;
  return /nifty/i.test(text) && /first\s*candle/i.test(text);
}

export function isCrudeFirstCandleName(name = "", symbol = "") {
  const text = String(name || "").trim();
  const root = String(symbol || "").toUpperCase();
  if (/^crude\s*oil$/i.test(text) || /^crudeoil$/i.test(text)) return true;
  const mentionsCrude = /crude/i.test(text) || root === "CRUDEOIL";
  if (!mentionsCrude || !/first\s*candle/i.test(text)) return false;
  if (/(?:^|[^0-9])15\s*m/i.test(text)) return false;
  return true;
}

function isOfficialNiftyFirstCandleName(name = "") {
  const text = String(name || "").trim();
  if (!text) return true;
  if (/^nifty$/i.test(text)) return true;
  return /nifty/i.test(text) && /5\s*m/i.test(text) && /first\s*candle/i.test(text) && !/crude/i.test(text);
}

function isOfficialCrudeFirstCandleName(name = "") {
  const text = String(name || "").trim();
  if (!text) return true;
  if (/^crude\s*oil$/i.test(text) || /^crudeoil$/i.test(text)) return true;
  return /crude/i.test(text) && /5\s*m/i.test(text) && /first\s*candle/i.test(text);
}

export function lockedNiftyFirstCandleName(name = "") {
  const text = String(name || "").trim();
  if (isOfficialNiftyFirstCandleName(text)) return NIFTY_FIRST_CANDLE_NAME;
  return text;
}

export function lockedCrudeFirstCandleName(name = "") {
  const text = String(name || "").trim();
  if (isOfficialCrudeFirstCandleName(text)) return CRUDE_FIRST_CANDLE_NAME;
  return text;
}

export function firstCandleNameAliases(name = "") {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return [];
  const aliases = new Set([text]);
  if (isNiftyFirstCandleName(name) || text === "nifty") {
    aliases.add("nifty");
    aliases.add("nifty 5m first candle");
    aliases.add("nifty 5 m first candle");
  }
  if (isCrudeFirstCandleName(name) || text === "crude oil" || text === "crudeoil") {
    aliases.add("crude oil");
    aliases.add("crudeoil");
    aliases.add("crude oil 5m first candle");
    aliases.add("crude oil 5 m first candle");
  }
  return [...aliases];
}

export function isNiftyFirstCandleAlgo(algo = {}) {
  if (
    algo.kind === NIFTY_FIRST_CANDLE_KIND ||
    algo.strategyType === NIFTY_FIRST_CANDLE_TYPE ||
    algo.indicator === "NIFTY_FIRST_CANDLE"
  ) {
    return true;
  }
  return isNiftyFirstCandleName(algo.name) && !isCrudeFirstCandleName(algo.name, algo.symbol);
}

export function isCrudeFirstCandleAlgo(algo = {}) {
  if (
    algo.kind === CRUDE_FIRST_CANDLE_KIND ||
    algo.strategyType === CRUDE_FIRST_CANDLE_TYPE ||
    algo.indicator === "CRUDE_FIRST_CANDLE"
  ) {
    return true;
  }
  return isCrudeFirstCandleName(algo.name, algo.symbol);
}

export function isFirstCandleAlgo(algo = {}) {
  return isNiftyFirstCandleAlgo(algo) || isCrudeFirstCandleAlgo(algo);
}

export function isNiftyTestAlgo(algo = {}) {
  return algo.kind === NIFTY_TEST_KIND || algo.strategyType === NIFTY_TEST_TYPE || algo.indicator === "NIFTY_TEST";
}

export function isNiftyTest1Algo(algo = {}) {
  if (algo.kind === NIFTY_TEST1_KIND || algo.strategyType === NIFTY_TEST1_TYPE || algo.indicator === "NIFTY_TEST1") {
    return true;
  }
  return String(algo.name || "").trim().toUpperCase() === "TEST1";
}

export function isNiftyTest2Algo(algo = {}) {
  if (algo.kind === NIFTY_TEST2_KIND || algo.strategyType === NIFTY_TEST2_TYPE || algo.indicator === "NIFTY_TEST2") {
    return true;
  }
  return String(algo.name || "").trim().toUpperCase() === "TEST2";
}

export function isNiftyOptionEngineAlgo(algo = {}) {
  return isNiftyVwapAlgo(algo) || isNiftyVwapReversalAlgo(algo) || isNiftyFirstCandleAlgo(algo);
}

export function niftyTestConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_TEST_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_TEST_CONFIG.lotSize)));
  const timeframe = NIFTY_TEST_TIMEFRAMES[algo.timeframe] ? algo.timeframe : DEFAULT_NIFTY_TEST_CONFIG.timeframe;
  return {
    timeframe,
    slPct: Math.max(0.05, num(algo.slPct, DEFAULT_NIFTY_TEST_CONFIG.slPct)),
    targetPct: Math.max(0.1, num(algo.targetPct, DEFAULT_NIFTY_TEST_CONFIG.targetPct)),
    barMinutes: NIFTY_TEST_TIMEFRAMES[timeframe],
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "current-open",
    startTimeIst: parseIstHm(algo.startTimeIst, DEFAULT_NIFTY_TEST_CONFIG.startTimeIst),
    endTimeIst: parseIstHm(algo.endTimeIst, DEFAULT_NIFTY_TEST_CONFIG.endTimeIst),
  };
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

export function niftyFirstCandleTrail(algo = {}) {
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  };
  const every = num(algo.trailingEveryPct);
  const shift = num(algo.trailingShiftPct);
  const activation = num(algo.trailingActivationPct);
  if (every > 0 && shift > 0) {
    return {
      trailingActivationPct: activation > 0 ? activation : DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingActivationPct,
      trailingEveryPct: every,
      trailingShiftPct: shift,
    };
  }
  return {
    trailingActivationPct: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingActivationPct,
    trailingEveryPct: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingEveryPct,
    trailingShiftPct: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.trailingShiftPct,
  };
}

export function niftyFirstCandleConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const trail = niftyFirstCandleTrail(algo);
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.lotSize)));
  const timeframe = FIRST_CANDLE_TIMEFRAMES[algo.timeframe] ? algo.timeframe : DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.timeframe;
  const barMinutes = firstCandleBarMinutes(timeframe);
  const expiryKind = String(algo.expiryKind || "").toLowerCase() === "monthly" ? "monthly" : "weekly";
  const strikeOffset = Math.max(-5, Math.min(5, Math.round(num(algo.strikeOffset, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.strikeOffset))));
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
    trailingActivationPct: trail.trailingActivationPct,
    trailingStepPct: trail.trailingShiftPct,
    trailingEveryPct: trail.trailingEveryPct,
    trailingShiftPct: trail.trailingShiftPct,
    lockToEntry: true,
    vwapExitCandles: DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.vwapExitCandles,
    maxPositions: 1,
    maxTradesPerDay: (() => {
      const requested = num(algo.maxTradesPerDay, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.maxTradesPerDay);
      if (!Number.isFinite(requested) || requested <= 1) return DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.maxTradesPerDay;
      return Math.max(1, Math.round(requested));
    })(),
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes,
    barMinutes,
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "first-candle",
    useTrail: true,
    useVwapExit: false,
    expiryKind,
    strikeOffset,
    dailyLiveIst: parseIstHm(algo.dailyLiveIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.dailyLiveIst),
    firstBarStartIst,
    entryEvaluationIst: firstCandleEntryIst(firstBarStartIst, timeframe, algo.entryEvaluationIst),
    endTimeIst: parseIstHm(algo.endTimeIst, DEFAULT_NIFTY_FIRST_CANDLE_CONFIG.endTimeIst),
  };
}

export function crudeFirstCandleConfig(algo = {}) {
  const base = niftyFirstCandleConfig({
    ...algo,
    lotSize: algo.lotSize || DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.lotSize,
    endTimeIst: algo.endTimeIst || DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.endTimeIst,
    expiryKind: "monthly",
  });
  const endTimeIst = parseIstHm(algo.endTimeIst, DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.endTimeIst);
  const endParts = endTimeIst.split(":").map(Number);
  const eodFromEnd = Math.max(0, 23 * 60 + 30 - (endParts[0] * 60 + endParts[1]));
  const requestedMax = Number(algo.maxTradesPerDay);
  const maxTradesPerDay = Number.isFinite(requestedMax) && requestedMax >= 1
    ? Math.max(1, Math.min(20, Math.round(requestedMax)))
    : DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.maxTradesPerDay;
  return {
    ...base,
    useTrail: false,
    lockToEntry: false,
    symbol: "CRUDEOIL",
    lotSize: Math.max(1, Math.round(Number(algo.lotSize) || DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.lotSize)),
    qty: Math.max(1, Math.round(Number(base.lots) || 1)) * Math.max(1, Math.round(Number(algo.lotSize) || DEFAULT_CRUDE_FIRST_CANDLE_CONFIG.lotSize)),
    expiryKind: "monthly",
    endTimeIst,
    eodSquareOffMinutes: eodFromEnd,
    maxTradesPerDay,
  };
}

export function niftyTest1Config(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const script = test1Script(algo.symbol);
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_TEST1_CONFIG.lots)));
  const lotSize = script.lot;
  const minBodyPct = Math.min(0.99, Math.max(0.5, num(algo.minBodyPct, DEFAULT_NIFTY_TEST1_CONFIG.minBodyPct)));
  const maxWickPct = Math.min(0.5, Math.max(0.01, num(algo.maxWickPct, DEFAULT_NIFTY_TEST1_CONFIG.maxWickPct)));
  const targetMultiple = Math.min(5, Math.max(0.1, num(algo.targetMultiple, DEFAULT_NIFTY_TEST1_CONFIG.targetMultiple)));
  const targetSource = String(algo.targetSource || DEFAULT_NIFTY_TEST1_CONFIG.targetSource) === "range" ? "range" : "body";
  return {
    timeframe: "5m",
    barMinutes: 5,
    symbol: script.id,
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "test1-atm-green",
    startTimeIst: parseIstHm(algo.startTimeIst, DEFAULT_NIFTY_TEST1_CONFIG.startTimeIst),
    endTimeIst: parseIstHm(algo.endTimeIst, script.endTimeIst),
    minBodyPct,
    maxWickPct,
    targetMultiple,
    targetSource,
    strikeOffset: 0,
    expiryKind: script.expiryKind,
    session: script.session,
    step: script.step,
    maxPositions: 1,
    intradayOnly: algo.intradayOnly !== false,
    eodSquareOffMinutes: Math.max(0, Math.round(num(algo.eodSquareOffMinutes, DEFAULT_NIFTY_TEST1_CONFIG.eodSquareOffMinutes))),
    useTrail: false,
    useVwapExit: false,
  };
}

export function niftyTest2Config(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = Math.max(1, Math.round(num(algo.lots, DEFAULT_NIFTY_TEST2_CONFIG.lots)));
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_TEST2_CONFIG.lotSize)));
  const holdStyle = test2HoldStyle(algo);
  const btst = holdStyle === "btst";
  return {
    timeframe: "5m",
    barMinutes: 5,
    symbol: "NIFTY",
    lots,
    lotSize,
    qty: lots * lotSize,
    signalMode: "test2-premium-strangle",
    startTimeIst: parseIstHm(algo.startTimeIst, DEFAULT_NIFTY_TEST2_CONFIG.startTimeIst),
    endTimeIst: parseIstHm(algo.endTimeIst, DEFAULT_NIFTY_TEST2_CONFIG.endTimeIst),
    exitTimeIst: parseIstHm(
      String(algo.exitTimeIst || "") === "09:35" ? DEFAULT_NIFTY_TEST2_CONFIG.exitTimeIst : algo.exitTimeIst,
      DEFAULT_NIFTY_TEST2_CONFIG.exitTimeIst,
    ),
    sellPremium: Math.max(1, num(algo.sellPremium, DEFAULT_NIFTY_TEST2_CONFIG.sellPremium)),
    hedgePremium: Math.max(1, num(algo.hedgePremium, DEFAULT_NIFTY_TEST2_CONFIG.hedgePremium)),
    hedgeSlPct: Math.max(1, num(algo.hedgeSlPct, DEFAULT_NIFTY_TEST2_CONFIG.hedgeSlPct)),
    overallSl: Math.max(0, num(algo.overallSl, DEFAULT_NIFTY_TEST2_CONFIG.overallSl)),
    overallTarget: Math.max(0, num(algo.overallTarget, DEFAULT_NIFTY_TEST2_CONFIG.overallTarget)),
    overallTargetPct: Math.max(0, num(algo.overallTargetPct, DEFAULT_NIFTY_TEST2_CONFIG.overallTargetPct)),
    costPerCombo: Math.max(0, num(algo.costPerCombo, DEFAULT_NIFTY_TEST2_CONFIG.costPerCombo)),
    maxTradesPerDay: 1,
    maxPositions: 4,
    holdStyle,
    product: btst ? "NRML" : "MIS",
    holdOvernight: btst,
    intradayOnly: !btst,
    eodSquareOffMinutes: btst ? 0 : 15,
  };
}

export function optionEngineConfig(algo = {}) {
  if (isNiftyTest2Algo(algo)) return niftyTest2Config(algo);
  if (isNiftyTest1Algo(algo)) return niftyTest1Config(algo);
  if (isCrudeFirstCandleAlgo(algo)) return crudeFirstCandleConfig(algo);
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
    name: lockedNiftyFirstCandleName(patch.name),
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
    trailingEveryPct: cfg.trailingEveryPct,
    trailingShiftPct: cfg.trailingShiftPct,
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
    trailingActivationPct: cfg.trailingActivationPct,
    trailingEveryPct: cfg.trailingEveryPct,
    trailingShiftPct: cfg.trailingShiftPct,
    trailingStepPct: cfg.trailingShiftPct,
    name: lockedNiftyFirstCandleName(patch.name),
    enabled: false,
  };
}

export function defaultCrudeFirstCandleAlgo(patch = {}) {
  const cfg = crudeFirstCandleConfig(patch);
  return {
    name: lockedCrudeFirstCandleName(patch.name),
    kind: CRUDE_FIRST_CANDLE_KIND,
    strategyType: CRUDE_FIRST_CANDLE_TYPE,
    tag: "crude 5m",
    symbol: "CRUDEOIL",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: cfg.timeframe,
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
    expiryKind: "monthly",
    strikeOffset: cfg.strikeOffset,
    firstBarStartIst: cfg.firstBarStartIst,
    entryEvaluationIst: cfg.entryEvaluationIst,
    endTimeIst: cfg.endTimeIst,
    indicator: "CRUDE_FIRST_CANDLE",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    dailyLiveIst: cfg.dailyLiveIst,
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: CRUDE_FIRST_CANDLE_KIND,
    strategyType: CRUDE_FIRST_CANDLE_TYPE,
    symbol: "CRUDEOIL",
    instrument: "option",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: cfg.timeframe,
    expiryKind: "monthly",
    strikeOffset: cfg.strikeOffset,
    maxTradesPerDay: cfg.maxTradesPerDay,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    endTimeIst: cfg.endTimeIst,
    indicator: "CRUDE_FIRST_CANDLE",
    name: lockedCrudeFirstCandleName(patch.name),
    enabled: false,
  };
}

export function defaultNiftyTestAlgo(patch = {}) {
  const cfg = niftyTestConfig(patch);
  return {
    name: patch.name || "nifty test",
    kind: NIFTY_TEST_KIND,
    strategyType: NIFTY_TEST_TYPE,
    tag: "nifty test",
    symbol: "NIFTY",
    instrument: "future",
    optionType: "CE",
    strikeOffset: 0,
    side: "BOTH",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: cfg.timeframe,
    slPct: cfg.slPct,
    targetPct: cfg.targetPct,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    indicator: "NIFTY_TEST",
    buyLeft: "price",
    buyOp: "crosses_above",
    buyRight: "lookback_high",
    sellLeft: "price",
    sellOp: "crosses_below",
    sellRight: "lookback_low",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_TEST_KIND,
    strategyType: NIFTY_TEST_TYPE,
    symbol: "NIFTY",
    instrument: "future",
    side: "BOTH",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: cfg.timeframe,
    slPct: cfg.slPct,
    targetPct: cfg.targetPct,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    indicator: "NIFTY_TEST",
    enabled: false,
  };
}

export function defaultNiftyTest1Algo(patch = {}) {
  const cfg = niftyTest1Config(patch);
  return {
    name: "TEST1",
    kind: NIFTY_TEST1_KIND,
    strategyType: NIFTY_TEST1_TYPE,
    tag: "TEST1",
    symbol: cfg.symbol,
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "5m",
    slPct: 0,
    targetPct: 0,
    minBodyPct: cfg.minBodyPct,
    maxWickPct: cfg.maxWickPct,
    targetMultiple: cfg.targetMultiple,
    targetSource: cfg.targetSource,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    expiryKind: cfg.expiryKind,
    maxPositions: 1,
    intradayOnly: true,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    indicator: "NIFTY_TEST1",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    name: "TEST1",
    kind: NIFTY_TEST1_KIND,
    strategyType: NIFTY_TEST1_TYPE,
    symbol: cfg.symbol,
    instrument: "option",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "5m",
    minBodyPct: cfg.minBodyPct,
    maxWickPct: cfg.maxWickPct,
    targetMultiple: cfg.targetMultiple,
    targetSource: cfg.targetSource,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    expiryKind: cfg.expiryKind,
    indicator: "NIFTY_TEST1",
    enabled: false,
  };
}

export function defaultNiftyTest2Algo(patch = {}) {
  const cfg = niftyTest2Config(patch);
  return {
    name: NIFTY_TEST2_NAME,
    kind: NIFTY_TEST2_KIND,
    strategyType: NIFTY_TEST2_TYPE,
    tag: "TEST2",
    symbol: "NIFTY",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BOTH",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "5m",
    slPct: cfg.hedgeSlPct,
    targetPct: 0,
    sellPremium: cfg.sellPremium,
    hedgePremium: cfg.hedgePremium,
    hedgeSlPct: cfg.hedgeSlPct,
    overallSl: cfg.overallSl,
    overallTarget: cfg.overallTarget,
    overallTargetPct: cfg.overallTargetPct,
    costPerCombo: cfg.costPerCombo,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    exitTimeIst: cfg.exitTimeIst,
    maxTradesPerDay: 1,
    maxPositions: 4,
    holdStyle: cfg.holdStyle,
    product: cfg.product,
    holdOvernight: cfg.holdOvernight,
    intradayOnly: cfg.intradayOnly,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    indicator: "NIFTY_TEST2",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    name: NIFTY_TEST2_NAME,
    kind: NIFTY_TEST2_KIND,
    strategyType: NIFTY_TEST2_TYPE,
    symbol: "NIFTY",
    instrument: "option",
    lots: cfg.lots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "5m",
    sellPremium: cfg.sellPremium,
    hedgePremium: cfg.hedgePremium,
    hedgeSlPct: cfg.hedgeSlPct,
    overallSl: cfg.overallSl,
    overallTarget: cfg.overallTarget,
    overallTargetPct: cfg.overallTargetPct,
    costPerCombo: cfg.costPerCombo,
    startTimeIst: cfg.startTimeIst,
    endTimeIst: cfg.endTimeIst,
    exitTimeIst: cfg.exitTimeIst,
    holdStyle: cfg.holdStyle,
    product: cfg.product,
    holdOvernight: cfg.holdOvernight,
    intradayOnly: cfg.intradayOnly,
    eodSquareOffMinutes: cfg.eodSquareOffMinutes,
    indicator: "NIFTY_TEST2",
    enabled: false,
  };
}
