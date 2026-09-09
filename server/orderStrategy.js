const CORR_MAX = 25;
const GENERIC_NAME = /^(manual|auto)$/i;
const memory = new Map();

export function realStrategyName(value) {
  const name = String(value || "").trim();
  if (!name || GENERIC_NAME.test(name)) return "";
  return name;
}

export function rememberOrderStrategy(row = {}, name = "") {
  const label = realStrategyName(name || row.strategy);
  if (!label) return label;
  if (row.id) memory.set(`id:${row.id}`, label);
  if (row.securityId) memory.set(`sid:${row.securityId}`, label);
  return label;
}

export function clearOrderStrategyMemory() {
  memory.clear();
}

function recallOrderStrategy(row = {}) {
  if (row.id && memory.has(`id:${row.id}`)) return memory.get(`id:${row.id}`);
  if (row.securityId && memory.has(`sid:${row.securityId}`)) return memory.get(`sid:${row.securityId}`);
  return "";
}

function hyphenName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9+-]/g, "");
}

export function orderCorrelationId(payload = {}) {
  const name = hyphenName(realStrategyName(payload.strategy) || payload.strategy);
  if (name) return name.slice(0, CORR_MAX);
  return `t2s${Date.now()}`.slice(0, CORR_MAX);
}

export function strategyFromCorrelation(value, algos = []) {
  const raw = String(value || "").trim();
  if (!raw || /^t2s\d+$/i.test(raw)) return "";
  const spaced = raw.replace(/-/g, " ");
  const match = (algos || []).find((algo) => {
    const name = String(algo.name || "");
    const compact = hyphenName(name);
    return (
      name === spaced ||
      compact === raw ||
      compact.slice(0, CORR_MAX) === raw ||
      algo.id === raw
    );
  });
  return realStrategyName(match?.name || spaced);
}

function isHedgeAlgo(algo = {}) {
  return (
    algo.kind === "nifty-vwap-hedge" ||
    algo.strategyType === "NIFTY_VWAP_HEDGE_15M" ||
    algo.indicator === "NIFTY_VWAP_HEDGE"
  );
}

function isReversalAlgo(algo = {}) {
  return (
    algo.kind === "nifty-vwap-reversal" ||
    algo.strategyType === "NIFTY_VWAP_REVERSAL_15M" ||
    algo.indicator === "NIFTY_VWAP_REVERSAL"
  );
}

function isAtmAlgo(algo = {}) {
  return algo.kind === "nifty-vwap" || algo.strategyType === "NIFTY_VWAP_ATM" || algo.indicator === "NIFTY_VWAP_ATM";
}

export function looksLikeNiftyOption(row = {}) {
  if (row.option === "CE" || row.option === "PE") {
    const symbol = String(row.symbol || "");
    return !/BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX/i.test(symbol);
  }
  const text = `${row.symbol || ""} ${row.tradingSymbol || ""}`;
  return /NIFTY/i.test(text) && /(CE|PE)/i.test(text) && !/BANKNIFTY|FINNIFTY|MIDCPNIFTY/i.test(text);
}

function hedgeActive(algo = {}) {
  const hs = algo.hedgeState || {};
  return Boolean(
    algo.enabled ||
      hs.inFlight ||
      (hs.phase && hs.phase !== "IDLE") ||
      hs.primarySide ||
      Number(hs.primaryEntryPrice) > 0 ||
      Number(hs.hedgeEntryPrice) > 0,
  );
}

function namedAlgo(algo, fallback) {
  return realStrategyName(algo?.name) || fallback || "";
}

function inferAlgoStrategy(row = {}, algos = []) {
  const list = algos || [];
  for (const algo of list) {
    if (algo.hedgeState?.lastOrderId && String(algo.hedgeState.lastOrderId) === String(row.id)) {
      return namedAlgo(algo, "NIFTY 15m VWAP hedge");
    }
  }
  const hedge = list.find(isHedgeAlgo);
  const reversal = list.find(isReversalAlgo);
  const atm = list.find(isAtmAlgo);
  const nifty = looksLikeNiftyOption(row);
  if (nifty) {
    const otherLive = [reversal, atm].filter((algo) => algo?.enabled);
    if (hedge && (hedgeActive(hedge) || !otherLive.length)) {
      return namedAlgo(hedge, "NIFTY 15m VWAP hedge");
    }
    const liveNifty = [hedge, reversal, atm].filter((algo) => algo?.enabled);
    if (liveNifty.length === 1) return namedAlgo(liveNifty[0]);
  }
  const running = list.filter((algo) => algo.enabled);
  if (running.length === 1) return namedAlgo(running[0]);
  const inflight = running.find((algo) => algo.hedgeState?.inFlight || algo.vwapState?.inFlight);
  if (inflight) return namedAlgo(inflight);
  return "";
}

function keepStrategy(item) {
  return item && realStrategyName(item.strategy);
}

export function resolveOrderStrategy(row = {}, { previous = [], algos = [], positions = [] } = {}) {
  const direct = realStrategyName(row.strategy);
  const fromCorr = strategyFromCorrelation(row.correlationId, algos);
  const remembered = recallOrderStrategy(row);
  const prev =
    (previous || []).find((item) => String(item.id) === String(row.id) && keepStrategy(item)) ||
    (previous || []).find((item) => item.securityId && item.securityId === row.securityId && keepStrategy(item)) ||
    (previous || []).find((item) => item.symbol && item.symbol === row.symbol && item.side === row.side && keepStrategy(item));
  const pos = (positions || []).find(
    (item) =>
      keepStrategy(item) &&
      ((item.securityId && item.securityId === row.securityId) || (item.symbol && item.symbol === row.symbol)),
  );
  const inferred = inferAlgoStrategy(row, algos);
  const name = direct || fromCorr || remembered || realStrategyName(prev?.strategy) || realStrategyName(pos?.strategy) || inferred;
  if (name) rememberOrderStrategy(row, name);
  return name;
}
