export const NIFTY_VWAP_HEDGE_KIND = "nifty-vwap-hedge";
export const NIFTY_VWAP_HEDGE_TYPE = "NIFTY_VWAP_HEDGE_15M";

export const DEFAULT_NIFTY_VWAP_HEDGE_CONFIG = {
  timeframe: "15m",
  barMinutes: 15,
  symbol: "NIFTY",
  lots: 1,
  lotSize: 65,
  hedgeLots: 2,
  primaryTargetPct: 40,
  hedgeTriggerPct: 20,
  accountProfitPct: 5,
  brokeragePerLot: 40,
  maxPrimaryLots: 1,
  maxHedgeLots: 2,
  maxTotalLots: 3,
  expiryKind: "weekly",
  signalMode: "reversal",
};

export function isNiftyVwapHedgeAlgo(algo = {}) {
  return (
    algo.kind === NIFTY_VWAP_HEDGE_KIND ||
    algo.strategyType === NIFTY_VWAP_HEDGE_TYPE ||
    algo.indicator === "NIFTY_VWAP_HEDGE"
  );
}

export function niftyVwapHedgeConfig(algo = {}) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const lots = 1;
  const hedgeLots = 2;
  const lotSize = Math.max(1, Math.round(num(algo.lotSize, DEFAULT_NIFTY_VWAP_HEDGE_CONFIG.lotSize)));
  return {
    timeframe: "15m",
    barMinutes: 15,
    symbol: "NIFTY",
    lots,
    hedgeLots,
    lotSize,
    qty: lots * lotSize,
    hedgeQty: hedgeLots * lotSize,
    primaryTargetPct: 40,
    hedgeTriggerPct: 20,
    accountProfitPct: 5,
    brokeragePerLot: Math.max(0, num(algo.brokeragePerLot, DEFAULT_NIFTY_VWAP_HEDGE_CONFIG.brokeragePerLot)),
    maxPrimaryLots: 1,
    maxHedgeLots: 2,
    maxTotalLots: 3,
    expiryKind: "weekly",
    signalMode: "reversal",
  };
}

export function defaultNiftyVwapHedgeAlgo(patch = {}) {
  const cfg = niftyVwapHedgeConfig(patch);
  return {
    name: patch.name || "NIFTY 15m VWAP hedge",
    kind: NIFTY_VWAP_HEDGE_KIND,
    strategyType: NIFTY_VWAP_HEDGE_TYPE,
    tag: "15m hedge",
    symbol: "NIFTY",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    side: "BUY",
    lots: cfg.lots,
    hedgeLots: cfg.hedgeLots,
    lotSize: cfg.lotSize,
    qty: cfg.qty,
    timeframe: "15m",
    slPct: 0,
    initialSlPct: 0,
    targetPct: cfg.primaryTargetPct,
    primaryTargetPct: cfg.primaryTargetPct,
    hedgeTriggerPct: cfg.hedgeTriggerPct,
    accountProfitPct: cfg.accountProfitPct,
    brokeragePerLot: cfg.brokeragePerLot,
    maxPositions: 2,
    intradayOnly: false,
    eodSquareOffMinutes: 0,
    expiryKind: "weekly",
    indicator: "NIFTY_VWAP_HEDGE",
    buyLeft: "price",
    buyOp: "close_above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "close_below",
    sellRight: "vwap",
    runMode: ["live", "paper", "backtest"].includes(patch.runMode) ? patch.runMode : "live",
    brokerId: patch.runMode === "paper" || patch.runMode === "backtest" ? "paper" : "dhan",
    dailyLiveIst: "09:30",
    enabled: false,
    status: patch.runMode === "backtest" ? "BACKTEST" : "PAUSED",
    ...patch,
    kind: NIFTY_VWAP_HEDGE_KIND,
    strategyType: NIFTY_VWAP_HEDGE_TYPE,
    enabled: false,
  };
}
