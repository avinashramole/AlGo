export const UNDERLYINGS = [
  { id: "NIFTY", label: "NIFTY", indexSymbol: "NIFTY 50", step: 50, scrip: 13, segment: "IDX_I", lot: 65, expiryWeekday: "Tue", weekly: true },
  { id: "BANKNIFTY", label: "BANKNIFTY", indexSymbol: "BANKNIFTY", step: 100, scrip: 25, segment: "IDX_I", lot: 30, expiryWeekday: "Tue", weekly: false },
  { id: "FINNIFTY", label: "FINNIFTY", indexSymbol: "FINNIFTY", step: 50, scrip: 27, segment: "IDX_I", lot: 60, expiryWeekday: "Tue", weekly: false },
  { id: "SENSEX", label: "SENSEX", indexSymbol: "SENSEX", step: 100, scrip: 51, segment: "IDX_I", lot: 20, expiryWeekday: "Thu", weekly: true },
];

export function getUnderlying(id) {
  return UNDERLYINGS.find((row) => row.id === id) || UNDERLYINGS[0];
}

function kolkataParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function ymdKolkata(date) {
  const parts = kolkataParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const MONTHS = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export function normalizeExpiry(value) {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const mdy = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
  if (mdy) return `20${mdy[3]}-${mdy[1]}-${mdy[2]}`;
  const named = raw.match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{4})/i);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }
  return raw;
}

export function formatExpiryLabel(ymd) {
  const date = normalizeExpiry(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ymd || "—";
  const probe = new Date(`${date}T12:00:00+05:30`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(probe);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit" }).format(probe);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "short" }).format(probe);
  const year = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric" }).format(probe);
  return `${weekday}, ${day} ${month} ${year}`;
}

function afterExpiryCutoff() {
  const parts = kolkataParts();
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 15 * 60 + 30;
}

export function dropExpired(dates) {
  const today = ymdKolkata(new Date());
  const skipToday = afterExpiryCutoff();
  return [...new Set((dates || []).map(normalizeExpiry))]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .filter((date) => date > today || (date === today && !skipToday))
    .sort();
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month, 0, 6, 30)).getUTCDate();
  for (let day = lastDay; day >= 1; day -= 1) {
    const probe = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+05:30`);
    const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(probe);
    if (name === weekday) return ymdKolkata(probe);
  }
  return null;
}

export function upcomingExpiries(symbol = "NIFTY", count = 8) {
  const und = getUnderlying(symbol);
  const today = ymdKolkata(new Date());
  const skipToday = afterExpiryCutoff();
  const dates = [];

  if (und.weekly) {
    for (let i = 0; i < 120 && dates.length < count; i += 1) {
      const probe = new Date(Date.now() + i * 86_400_000);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(probe);
      const ymd = ymdKolkata(probe);
      if (weekday !== und.expiryWeekday) continue;
      if (ymd < today) continue;
      if (ymd === today && skipToday) continue;
      dates.push(ymd);
    }
    return dates;
  }

  const now = kolkataParts();
  let year = Number(now.year);
  let month = Number(now.month);
  while (dates.length < count) {
    const ymd = lastWeekdayOfMonth(year, month, und.expiryWeekday);
    if (ymd && ymd >= today && !(ymd === today && skipToday)) dates.push(ymd);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
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

export function markAtmRows(rows, spot, step) {
  const atm = atmStrike(spot, step);
  let marked = false;
  const next = rows.map((row) => {
    const isAtm = row.strike === atm;
    if (isAtm) marked = true;
    return { ...row, atm: isAtm };
  });
  if (marked) return next;
  let best = next[0];
  let gap = Infinity;
  for (const row of next) {
    const d = Math.abs(row.strike - Number(spot));
    if (d < gap) {
      gap = d;
      best = row;
    }
  }
  return next.map((row) => ({ ...row, atm: row === best || row.strike === best?.strike }));
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
      callBuy: Math.round(Math.max(65, 4200 - distance * 220)),
      callSell: Math.round(Math.max(65, 3800 - distance * 200)),
      callVwap: round2(callLtp * (i <= 0 ? 0.992 : 1.008)),
      putLtp,
      putChg: round2((i >= 0 ? 5 : -3) + i * 0.35),
      putOi: Math.max(80_000, putOi),
      putOiChg: Math.round((i >= -1 ? 1 : -1) * (85_000 - distance * 5_500)),
      putVol: Math.round(Math.max(12_000, 170_000 - distance * 11_000)),
      putIv: round2(12.1 + distance * 0.38),
      putDelta: round2(Math.min(-0.04, Math.max(-0.96, -0.5 - i * 0.045))),
      putBuy: Math.round(Math.max(65, 4000 - distance * 210)),
      putSell: Math.round(Math.max(65, 3600 - distance * 190)),
      putVwap: round2(putLtp * (i >= 0 ? 0.992 : 1.008)),
      atm: strike === atm,
    });
  }
  return rows;
}

function chainData(payload) {
  const top = payload?.data || payload || {};
  return top.data && (top.data.oc || top.data.last_price) ? top.data : top;
}

function ocEntries(oc) {
  if (!oc) return [];
  if (Array.isArray(oc)) {
    return oc.map((row) => [row.strike ?? row.strike_price ?? row.strikePrice, row]);
  }
  return Object.entries(oc);
}

function chainLeg(row, kind) {
  if (!row || typeof row !== "object") return {};
  if (kind === "ce") return row.ce || row.CE || row.call || row.Call || {};
  return row.pe || row.PE || row.put || row.Put || {};
}

function chainSecurityId(leg) {
  const raw = leg?.security_id ?? leg?.securityId ?? leg?.SecurityId ?? leg?.scrip_id ?? leg?.scripId ?? 0;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

export function parseDhanChain(payload, spot, step = 50) {
  const data = chainData(payload);
  const oc = data.oc || data.OC || {};
  const last = Number(data.last_price || data.lastPrice) || Number(spot) || 0;
  const rows = ocEntries(oc)
    .map(([key, value]) => {
      const strike = Number(key);
      const ce = chainLeg(value, "ce");
      const pe = chainLeg(value, "pe");
      return {
        strike,
        callLtp: Number(ce.last_price || ce.lastPrice || 0),
        callChg: pctChange(ce.last_price || ce.lastPrice, ce.previous_close_price || ce.previousClosePrice),
        callOi: Number(ce.oi || 0),
        callOiChg: Number(ce.oi || 0) - Number(ce.previous_oi || ce.previousOi || 0),
        callVol: Number(ce.volume || 0),
        callIv: round2(Number(ce.implied_volatility || ce.impliedVolatility || 0)),
        callDelta: round2(Number(ce.greeks?.delta || 0)),
        callBid: Number(ce.top_bid_price || ce.topBidPrice || 0),
        callAsk: Number(ce.top_ask_price || ce.topAskPrice || 0),
        callBuy: Number(ce.top_bid_quantity || ce.topBidQuantity || 0),
        callSell: Number(ce.top_ask_quantity || ce.topAskQuantity || 0),
        callVwap: Number(ce.average_price || ce.averagePrice || 0),
        callId: chainSecurityId(ce),
        putLtp: Number(pe.last_price || pe.lastPrice || 0),
        putChg: pctChange(pe.last_price || pe.lastPrice, pe.previous_close_price || pe.previousClosePrice),
        putOi: Number(pe.oi || 0),
        putOiChg: Number(pe.oi || 0) - Number(pe.previous_oi || pe.previousOi || 0),
        putVol: Number(pe.volume || 0),
        putIv: round2(Number(pe.implied_volatility || pe.impliedVolatility || 0)),
        putDelta: round2(Number(pe.greeks?.delta || 0)),
        putBid: Number(pe.top_bid_price || pe.topBidPrice || 0),
        putAsk: Number(pe.top_ask_price || pe.topAskPrice || 0),
        putBuy: Number(pe.top_bid_quantity || pe.topBidQuantity || 0),
        putSell: Number(pe.top_ask_quantity || pe.topAskQuantity || 0),
        putVwap: Number(pe.average_price || pe.averagePrice || 0),
        putId: chainSecurityId(pe),
        atm: false,
      };
    })
    .filter((row) => Number.isFinite(row.strike) && (row.callLtp > 0 || row.putLtp > 0 || row.callOi > 0 || row.putOi > 0 || row.callId || row.putId))
    .sort((a, b) => a.strike - b.strike);

  if (!rows.length) return { rows: [], spot: last };
  return { rows: markAtmRows(rows, last, step), spot: last };
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

export function nearestExpiries(dates, count = 4, keep) {
  const live = dropExpired(dates);
  const wanted = normalizeExpiry(keep);
  const next = live.slice(0, count);
  if (wanted && live.includes(wanted) && !next.includes(wanted)) {
    return [...next.slice(0, Math.max(0, count - 1)), wanted];
  }
  return next;
}

export function withExpiryLabels(meta) {
  const expiry = normalizeExpiry(meta.expiry);
  const expiries = nearestExpiries(meta.expiries || [], 4, expiry);
  const chosen = expiries.includes(expiry) ? expiry : expiries[0] || expiry;
  return {
    ...meta,
    expiry: chosen,
    expiries,
    expiryLabel: formatExpiryLabel(chosen),
    expiryLabels: Object.fromEntries(expiries.map((date) => [date, formatExpiryLabel(date)])),
  };
}
