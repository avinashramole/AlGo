function round2(value) {
  return Number(Number(value).toFixed(2));
}

export const MCX_PREV_CLOSE_MAX = 0.6;

export function looksLikePrevClose(price, prev, options = {}) {
  const p = Number(price);
  const c = Number(prev);
  if (!(p > 0) || !(c > 0) || c === p) return false;
  const gap = Math.abs(p - c);
  const pct = gap / c;
  const maxPct = Number(options.maxPct) > 0 ? Number(options.maxPct) : 0.2;
  return pct >= 0.00015 && pct <= maxPct;
}

export function dayChangeFromQuote(price, quote = {}, storedPrev = 0, options = {}) {
  const p = Number(price) || 0;
  const explicitPrev = Number(quote.prevClose || 0);
  const close = Number(quote.close || 0);
  const net = quote.netChange != null && quote.netChange !== "" ? Number(quote.netChange) : null;
  const maxPct = Number(options.maxPct) > 0 ? Number(options.maxPct) : 0.2;
  const ok = (value) => looksLikePrevClose(p, value, { maxPct });
  let prev = 0;
  if (ok(explicitPrev)) prev = explicitPrev;
  else if (net != null && Number.isFinite(net) && p > 0 && Math.abs(net) > 0.0001) prev = round2(p - net);
  else if (ok(storedPrev)) prev = Number(storedPrev);
  else if (ok(close)) prev = close;
  else if (Number(storedPrev) > 0 && storedPrev !== p) prev = Number(storedPrev);
  if (!(p > 0) || !(prev > 0)) return { change: 0, changePct: 0, prevClose: prev || Number(storedPrev) || 0 };
  const change = round2(p - prev);
  return { change, changePct: round2((change / prev) * 100), prevClose: round2(prev) };
}
