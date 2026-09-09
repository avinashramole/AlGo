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
  const corr = String(row.correlationId || "").trim();
  if (corr && !/^t2s\d+$/i.test(corr)) memory.set(`corr:${corr}`, label);
  return label;
}

export function clearOrderStrategyMemory() {
  memory.clear();
}

function recallOrderStrategy(row = {}) {
  if (row.id && memory.has(`id:${row.id}`)) return memory.get(`id:${row.id}`);
  const corr = String(row.correlationId || "").trim();
  if (corr && memory.has(`corr:${corr}`)) return memory.get(`corr:${corr}`);
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
    return name === spaced || compact === raw || compact.slice(0, CORR_MAX) === raw || algo.id === raw;
  });
  if (match?.name) return canonicalStrategyName(match.name, algos);
  if (!(algos || []).length) return canonicalStrategyName(spaced, algos);
  return "";
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

function namedAlgo(algo) {
  return realStrategyName(algo?.name);
}

function isPendingRow(row = {}) {
  return /PENDING|PARTIAL|TRANSIT/i.test(String(row.status || ""));
}

function keepStrategy(item) {
  return item && realStrategyName(item.strategy);
}

function uniqueStrategy(rows = []) {
  const names = [...new Set((rows || []).map((row) => realStrategyName(row.strategy)).filter(Boolean))];
  return names.length === 1 ? names[0] : "";
}

function sameContract(left = {}, right = {}) {
  if (left.securityId && right.securityId && String(left.securityId) === String(right.securityId)) return true;
  if (left.symbol && right.symbol && left.symbol === right.symbol) return true;
  return false;
}

function inferFromLastOrderId(row = {}, algos = []) {
  for (const algo of algos || []) {
    if (algo.hedgeState?.lastOrderId && String(algo.hedgeState.lastOrderId) === String(row.id)) {
      return namedAlgo(algo);
    }
  }
  return "";
}

function inferPendingInFlight(row = {}, algos = []) {
  if (!isPendingRow(row) || !looksLikeNiftyOption(row)) return "";
  const inflight = (algos || []).filter((algo) => algo.hedgeState?.inFlight || algo.vwapState?.inFlight);
  if (inflight.length !== 1) return "";
  const algo = inflight[0];
  const locked = algo.vwapState?.lockedSymbol;
  if (locked && row.symbol && row.symbol !== locked) return "";
  return namedAlgo(algo);
}

function ownerAlgoForOpenPosition(row = {}, algos = []) {
  const owners = [];
  for (const algo of algos || []) {
    const hs = algo.hedgeState || {};
    if (isHedgeAlgo(algo) && (hs.inFlight || (hs.phase && hs.phase !== "IDLE") || hs.primarySide)) {
      if (!looksLikeNiftyOption(row)) continue;
      if (row.option && hs.hedgeSide && row.option === hs.hedgeSide) owners.push(namedAlgo(algo));
      else if (row.option && hs.primarySide && row.option === hs.primarySide) owners.push(namedAlgo(algo));
      else if (!row.option) owners.push(namedAlgo(algo));
      continue;
    }
    const vs = algo.vwapState || {};
    if ((isReversalAlgo(algo) || isAtmAlgo(algo)) && (vs.inFlight || vs.lockedSymbol || vs.fillPrice)) {
      if (vs.lockedSymbol && row.symbol === vs.lockedSymbol) owners.push(namedAlgo(algo));
      else if (vs.lockedOption && row.option === vs.lockedOption && looksLikeNiftyOption(row)) owners.push(namedAlgo(algo));
    }
  }
  const names = [...new Set(owners.filter(Boolean))];
  return names.length === 1 ? names[0] : "";
}

export function resolveOrderStrategy(row = {}, { previous = [], algos = [], positions = [], orders = [], forPosition = false } = {}) {
  const direct = realStrategyName(row.strategy);
  const fromCorr = strategyFromCorrelation(row.correlationId, algos);
  const remembered = recallOrderStrategy(row);
  const prevSameId = (previous || []).find((item) => String(item.id) === String(row.id) && keepStrategy(item));
  let name = direct || fromCorr || remembered || realStrategyName(prevSameId?.strategy);
  if (!name && forPosition) {
    name =
      uniqueStrategy((orders || []).filter((item) => keepStrategy(item) && sameContract(item, row))) ||
      uniqueStrategy((previous || []).filter((item) => keepStrategy(item) && sameContract(item, row))) ||
      uniqueStrategy((positions || []).filter((item) => keepStrategy(item) && sameContract(item, row))) ||
      ownerAlgoForOpenPosition(row, algos);
  }
  if (!name && !forPosition) {
    name = inferFromLastOrderId(row, algos) || inferPendingInFlight(row, algos);
  }
  if (name) {
    name = canonicalStrategyName(name, algos) || name;
    rememberOrderStrategy(row, name);
  }
  return name;
}

export function strategyForPlacedOrder(payload = {}, algos = []) {
  return canonicalStrategyName(realStrategyName(payload.strategy), algos);
}

export function canonicalStrategyName(value, algos = []) {
  const raw = realStrategyName(value);
  if (!raw) return "";
  const compact = hyphenName(raw).toLowerCase();
  const match = (algos || []).find((algo) => {
    const name = String(algo.name || "").trim();
    if (!name) return false;
    return (
      name === raw ||
      hyphenName(name).toLowerCase() === compact ||
      String(algo.id || "") === raw
    );
  });
  return match?.name || raw;
}
