const CORR_MAX = 25;

export function orderCorrelationId(payload = {}) {
  const name = String(payload.strategy || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9+-]/g, "");
  if (name) return name.slice(0, CORR_MAX);
  return `t2s${Date.now()}`.slice(0, CORR_MAX);
}

export function strategyFromCorrelation(value, algos = []) {
  const raw = String(value || "").trim();
  if (!raw || /^t2s\d+$/i.test(raw)) return "";
  const spaced = raw.replace(/-/g, " ");
  const match = (algos || []).find(
    (algo) =>
      algo.name === spaced ||
      String(algo.name || "").replace(/\s+/g, "-") === raw ||
      algo.id === raw,
  );
  return match?.name || spaced;
}

export function resolveOrderStrategy(row = {}, { previous = [], algos = [], positions = [] } = {}) {
  const direct = String(row.strategy || "").trim();
  if (direct) return direct;
  const fromCorr = strategyFromCorrelation(row.correlationId, algos);
  if (fromCorr) return fromCorr;
  const prev =
    (previous || []).find((item) => String(item.id) === String(row.id) && item.strategy) ||
    (previous || []).find((item) => item.securityId && item.securityId === row.securityId && item.strategy) ||
    (previous || []).find((item) => item.symbol && item.symbol === row.symbol && item.side === row.side && item.strategy);
  if (prev?.strategy) return String(prev.strategy);
  const pos = (positions || []).find(
    (item) =>
      item.strategy &&
      ((item.securityId && item.securityId === row.securityId) || (item.symbol && item.symbol === row.symbol)),
  );
  if (pos?.strategy) return String(pos.strategy);
  const running = (algos || []).filter((algo) => algo.enabled);
  if (running.length === 1) return String(running[0].name || "");
  const inflight = running.find((algo) => algo.hedgeState?.inFlight || algo.vwapState?.inFlight);
  if (inflight?.name) return String(inflight.name);
  return "";
}
