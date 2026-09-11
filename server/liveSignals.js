function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round0(value) {
  return Math.round(Number(value) || 0);
}

export function formatIstTime(ms = Date.now()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(new Date(ms));
}

export function signalAction(text) {
  const raw = String(text || "").toUpperCase();
  if (/\bBUY\b/.test(raw)) return "BUY";
  if (/\bSELL\b/.test(raw)) return "SELL";
  return "";
}

function optionFromSignal(text, algo) {
  const raw = String(text || "");
  const named = raw.match(/\b(NIFTY|BANKNIFTY|FINNIFTY|SENSEX)\s+(\d{3,6})\s*(CE|PE)\b/i);
  if (named) return `${named[1].toUpperCase()} ${named[2]} ${named[3].toUpperCase()}`;
  const strike = raw.match(/\b(\d{3,6})\s*(CE|PE)\b/i);
  if (strike) {
    const root = String(algo?.symbol || "NIFTY").toUpperCase().replace(/\s+50$/, "") || "NIFTY";
    return `${root} ${strike[1]} ${strike[2].toUpperCase()}`;
  }
  return String(algo?.symbol || "").trim();
}

export function emptyFeaturedSignal() {
  return {
    action: "BUY",
    symbol: "",
    strategy: "",
    expiry: "—",
    confidence: 0,
    risk: "—",
    metrics: [
      { label: "VWAP", value: 0 },
      { label: "DEPTH", value: 0 },
      { label: "OI", value: 0 },
      { label: "VOLUME", value: 0 },
    ],
  };
}

export function buildLiveSignals({ algos = [], orders = [] } = {}) {
  const rows = [];
  for (const order of orders || []) {
    const status = String(order.status || "").toUpperCase();
    if (status === "REJECTED" || status === "CANCELLED") continue;
    const action = order.side === "SELL" ? "SELL" : "BUY";
    const ts = Date.parse(order.createdAt || order.ts || "") || 0;
    rows.push({
      id: `ord-${order.id || ts}`,
      action,
      symbol: String(order.symbol || "").trim(),
      strategy: String(order.strategy || "Desk").trim() || "Desk",
      time: ts ? formatIstTime(ts) : formatIstTime(Date.now()),
      confidence: status === "FILLED" ? 90 : status === "PARTIAL" ? 75 : 70,
      ts,
    });
  }
  for (const algo of algos || []) {
    const action = signalAction(algo.lastSignal);
    if (!action) continue;
    const symbol = optionFromSignal(algo.lastSignal, algo);
    if (!symbol) continue;
    rows.push({
      id: `sig-${algo.id}`,
      action,
      symbol,
      strategy: String(algo.name || "Strategy").trim() || "Strategy",
      time: formatIstTime(Date.now()),
      confidence: algo.status === "LIVE" || algo.runMode === "live" ? 88 : 72,
      ts: Date.now(),
    });
  }
  const seen = new Set();
  return rows
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .filter((row) => {
      const key = `${row.strategy}|${row.action}|${row.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Boolean(row.symbol);
    })
    .slice(0, 20)
    .map(({ ts: _ts, ...row }) => row);
}

export function buildFeaturedSignal(signals = [], optionMeta = {}, dnaScores = []) {
  const first = (signals || []).find((row) => row.symbol && (row.action === "BUY" || row.action === "SELL"));
  if (!first) return emptyFeaturedSignal();
  const metrics = (dnaScores || []).slice(0, 4).map((item) => ({
    label: String(item.label || "").toUpperCase() || "SCORE",
    value: round0(item.value),
  }));
  while (metrics.length < 4) {
    metrics.push({ label: "SCORE", value: 0 });
  }
  return {
    action: first.action,
    symbol: first.symbol,
    strategy: first.strategy,
    expiry: optionMeta.expiryLabel || optionMeta.expiry || "—",
    confidence: round0(first.confidence),
    risk: first.confidence >= 85 ? "LOW" : first.confidence >= 70 ? "MED" : "HIGH",
    metrics,
  };
}

export function buildLiveDna({ indices = [], optionChain = [] } = {}) {
  const nifty = (indices || []).find((row) => row.symbol === "NIFTY 50") || indices[0] || {};
  const vix = (indices || []).find((row) => row.symbol === "INDIA VIX") || {};
  const rows = optionChain || [];
  const callOi = rows.reduce((sum, row) => sum + Number(row.callOi || 0), 0);
  const putOi = rows.reduce((sum, row) => sum + Number(row.putOi || 0), 0);
  const callVol = rows.reduce((sum, row) => sum + Number(row.callVol || 0), 0);
  const putVol = rows.reduce((sum, row) => sum + Number(row.putVol || 0), 0);
  const pcr = callOi > 0 ? putOi / callOi : 0;
  const changePct = Number(nifty.changePct || 0);
  const buyDen = callVol + putVol;
  return [
    { label: "Trend", value: round0(clamp(50 + changePct * 18)) },
    { label: "Momentum", value: round0(clamp(50 + Number(nifty.change || 0) / 10)) },
    { label: "Buy Pressure", value: round0(buyDen > 0 ? clamp((callVol / buyDen) * 100) : 50) },
    { label: "Volatility", value: round0(clamp(Number(vix.price || 0) * 4 || Number(nifty.atmIv || 0))) },
    { label: "OI Build", value: round0(callOi + putOi > 0 ? clamp((putOi / (callOi + putOi)) * 100) : 50) },
    { label: "PCR", value: round0(clamp(pcr * 50)) },
  ];
}

export function liveSentiment(dnaScores = []) {
  const trend = dnaScores.find((row) => row.label === "Trend")?.value ?? 50;
  const buy = dnaScores.find((row) => row.label === "Buy Pressure")?.value ?? 50;
  return round0((Number(trend) + Number(buy)) / 2);
}

export function emptyFiiDii() {
  return {
    fii: { buy: 0, sell: 0, net: 0 },
    dii: { buy: 0, sell: 0, net: 0 },
  };
}

export function indexWatchRows(indices = []) {
  return (indices || [])
    .filter((row) => row?.symbol)
    .map((row) => ({
      symbol: row.symbol,
      ltp: Number(row.price || row.future || 0),
      chg: Number(row.changePct || 0),
      volume: row.symbol === "INDIA VIX" ? "—" : "Live",
    }));
}
