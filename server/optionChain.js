export const UNDERLYINGS = [
  { id: "NIFTY", label: "NIFTY", indexSymbol: "NIFTY 50", step: 50, scrip: 13, segment: "IDX_I", lot: 75 },
  { id: "BANKNIFTY", label: "BANKNIFTY", indexSymbol: "BANKNIFTY", step: 100, scrip: 25, segment: "IDX_I", lot: 30 },
  { id: "FINNIFTY", label: "FINNIFTY", indexSymbol: "FINNIFTY", step: 50, scrip: 27, segment: "IDX_I", lot: 65 },
  { id: "SENSEX", label: "SENSEX", indexSymbol: "SENSEX", step: 100, scrip: 51, segment: "IDX_I", lot: 20 },
];

export function getUnderlying(id) {
  return UNDERLYINGS.find((row) => row.id === id) || UNDERLYINGS[0];
}

function ymdKolkata(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function upcomingExpiries(count = 8) {
  const dates = [];
  for (let i = 0; i < 90 && dates.length < count; i += 1) {
    const probe = new Date(Date.now() + i * 86_400_000);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(probe);
    if (weekday === "Thu") dates.push(ymdKolkata(probe));
  }
  return dates;
}

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function pctChange(last, prev) {
  const ltp = Number(last);
  const close = Number(prev);
  if (!Number.isFinite(ltp) || !Number.isFinite(close) || close <= 0) return 0;
  return round2(((ltp - close) / close) * 100);
}

export function atmStrike(spot, step) {
  return Math.round(Number(spot) / step) * step;
}

export function buildSyntheticChain(spot, step, wings = 10) {
  const atm = atmStrike(spot, step);
  const rows = [];
  for (let i = -wings; i <= wings; i += 1) {
    const strike = atm + i * step;
    const distance = Math.abs(i);
    const callIntr = Math.max(0, spot - strike);
    const putIntr = Math.max(0, strike - spot);
    const timeValue = Math.max(6, 48 - distance * 3.4);
    const callLtp = round2(Math.max(0.5, callIntr + timeValue * (i >= 0 ? 0.85 : 1.05)));
    const putLtp = round2(Math.max(0.5, putIntr + timeValue * (i <= 0 ? 0.85 : 1.05)));
    const callOi = Math.round((2_400_000 - distance * 140_000) * (i <= 0 ? 1.15 : 0.8));
    const putOi = Math.round((2_200_000 - distance * 130_000) * (i >= 0 ? 1.2 : 0.75));
    rows.push({
      strike,
      callLtp,
      callChg: round2((i <= 0 ? 6 : -2) - i * 0.4),
      callOi: Math.max(80_000, callOi),
      callOiChg: Math.round((i <= 1 ? 1 : -1) * (90_000 - distance * 6_000)),
      callVol: Math.round(Math.max(12_000, 180_000 - distance * 12_000)),
      callIv: round2(11.2 + distance * 0.35),
      callDelta: round2(Math.max(0.04, Math.min(0.96, 0.5 - i * 0.045))),
      putLtp,
      putChg: round2((i >= 0 ? 5 : -3) + i * 0.35),
      putOi: Math.max(80_000, putOi),
      putOiChg: Math.round((i >= -1 ? 1 : -1) * (85_000 - distance * 5_500)),
      putVol: Math.round(Math.max(12_000, 170_000 - distance * 11_000)),
      putIv: round2(12.1 + distance * 0.38),
      putDelta: round2(Math.min(-0.04, Math.max(-0.96, -0.5 - i * 0.045))),
      atm: strike === atm,
    });
  }
  return rows;
}

export function parseDhanChain(payload, spot) {
  const data = payload?.data || payload || {};
  const oc = data.oc || {};
  const last = Number(data.last_price) || Number(spot) || 0;
  const rows = Object.entries(oc)
    .map(([key, value]) => {
      const strike = Number(key);
      const ce = value?.ce || {};
      const pe = value?.pe || {};
      return {
        strike,
        callLtp: Number(ce.last_price || 0),
        callChg: pctChange(ce.last_price, ce.previous_close_price),
        callOi: Number(ce.oi || 0),
        callOiChg: Number(ce.oi || 0) - Number(ce.previous_oi || 0),
        callVol: Number(ce.volume || 0),
        callIv: round2(Number(ce.implied_volatility || 0)),
        callDelta: round2(Number(ce.greeks?.delta || 0)),
        callBid: Number(ce.top_bid_price || 0),
        callAsk: Number(ce.top_ask_price || 0),
        putLtp: Number(pe.last_price || 0),
        putChg: pctChange(pe.last_price, pe.previous_close_price),
        putOi: Number(pe.oi || 0),
        putOiChg: Number(pe.oi || 0) - Number(pe.previous_oi || 0),
        putVol: Number(pe.volume || 0),
        putIv: round2(Number(pe.implied_volatility || 0)),
        putDelta: round2(Number(pe.greeks?.delta || 0)),
        putBid: Number(pe.top_bid_price || 0),
        putAsk: Number(pe.top_ask_price || 0),
        atm: false,
      };
    })
    .filter((row) => Number.isFinite(row.strike) && (row.callLtp > 0 || row.putLtp > 0))
    .sort((a, b) => a.strike - b.strike);

  if (!rows.length) return { rows: [], spot: last };
  let atm = rows[0];
  let best = Infinity;
  for (const row of rows) {
    const gap = Math.abs(row.strike - last);
    if (gap < best) {
      best = gap;
      atm = row;
    }
  }
  atm.atm = true;
  return { rows, spot: last };
}

export function trimAroundAtm(rows, wings = 12) {
  const atmIndex = rows.findIndex((row) => row.atm);
  if (atmIndex < 0) return rows.slice(0, wings * 2 + 1);
  return rows.slice(Math.max(0, atmIndex - wings), atmIndex + wings + 1);
}

export function chainStats(rows, spot) {
  const callOi = rows.reduce((sum, row) => sum + (row.callOi || 0), 0);
  const putOi = rows.reduce((sum, row) => sum + (row.putOi || 0), 0);
  const pcr = callOi > 0 ? Number((putOi / callOi).toFixed(2)) : 0;
  const atm = rows.find((row) => row.atm) || rows[Math.floor(rows.length / 2)];
  let maxPain = atm?.strike || 0;
  let minPain = Infinity;
  for (const settle of rows) {
    let pain = 0;
    for (const row of rows) {
      pain += (row.callOi || 0) * Math.max(0, settle.strike - row.strike);
      pain += (row.putOi || 0) * Math.max(0, row.strike - settle.strike);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPain = settle.strike;
    }
  }
  return {
    pcr,
    maxPain,
    atmIv: Number(atm?.callIv || 0),
    spot: Number(spot || atm?.strike || 0),
    callOi,
    putOi,
  };
}
