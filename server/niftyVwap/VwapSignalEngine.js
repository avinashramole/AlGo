const BAR_MS = 5 * 60 * 1000;
const NSE_OPEN_MINUTES = 9 * 60 + 15;
const NSE_CLOSE_MINUTES = 15 * 60 + 30;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function sessionKeyIST(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function istWallTime(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function istWallToUtcMs(wall) {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second || 0) - IST_OFFSET_MS;
}

export function sessionBarOpenMs(ms, barMinutes = 5) {
  const step = Math.max(1, Number(barMinutes) || 5);
  const wall = istWallTime(ms);
  const minutes = wall.hour * 60 + wall.minute;
  if (minutes < NSE_OPEN_MINUTES || minutes >= NSE_CLOSE_MINUTES) return null;
  const elapsed = minutes - NSE_OPEN_MINUTES;
  const openMin = NSE_OPEN_MINUTES + Math.floor(elapsed / step) * step;
  return istWallToUtcMs({
    year: wall.year,
    month: wall.month,
    day: wall.day,
    hour: Math.floor(openMin / 60),
    minute: openMin % 60,
    second: 0,
  });
}

export function aggregateSessionBars(candles = [], barMinutes = 5, now = Date.now()) {
  const step = Math.max(1, Number(barMinutes) || 5);
  const barMs = step * 60 * 1000;
  const buckets = new Map();
  for (const row of Array.isArray(candles) ? candles : []) {
    const openMs = sessionBarOpenMs(row.time, step);
    if (openMs == null) continue;
    const open = Number(row.open);
    const high = Number(row.high);
    const low = Number(row.low);
    const close = Number(row.close);
    const volume = Number(row.volume) > 0 ? Number(row.volume) : 1;
    if (!(close > 0) && !(open > 0)) continue;
    const prev = buckets.get(openMs);
    if (!prev) {
      buckets.set(openMs, {
        time: openMs,
        open: open > 0 ? open : close,
        high: high > 0 ? high : Math.max(open, close),
        low: low > 0 ? low : Math.min(open || close, close),
        close: close > 0 ? close : open,
        volume,
        samples: 1,
      });
      continue;
    }
    prev.high = Math.max(prev.high, high > 0 ? high : prev.high);
    prev.low = Math.min(prev.low, low > 0 ? low : prev.low);
    prev.close = close > 0 ? close : prev.close;
    prev.volume += volume;
    prev.samples += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => a.time - b.time)
    .filter((bar) => now >= bar.time + barMs)
    .map(({ samples: _samples, ...bar }) => bar);
}

export function sessionBars(candles = [], atMs) {
  if (!Array.isArray(candles) || !candles.length) return [];
  const day = sessionKeyIST(atMs ?? candles[candles.length - 1].time);
  return candles.filter((bar) => sessionKeyIST(bar.time) === day && Number(bar.close) > 0);
}

export function completedCandles(candles = [], now = Date.now(), barMs = BAR_MS) {
  const rows = Array.isArray(candles) ? candles.filter((bar) => Number(bar.close) > 0) : [];
  if (!rows.length) return [];
  const last = rows[rows.length - 1];
  const lastTime = Number(last.time);
  if (!Number.isFinite(lastTime)) return rows.slice(0, -1);
  if (now < lastTime + barMs) return rows.slice(0, -1);
  return rows;
}

export function sessionVwap(candles = []) {
  let pv = 0;
  let vol = 0;
  for (const bar of candles) {
    const typical = (Number(bar.high) + Number(bar.low) + Number(bar.close)) / 3;
    const volume = Number(bar.volume) > 0 ? Number(bar.volume) : 1;
    if (!Number.isFinite(typical) || typical <= 0) continue;
    pv += typical * volume;
    vol += volume;
  }
  return vol ? pv / vol : 0;
}

export function consecutiveAgainstVwap(candles = [], side) {
  let count = 0;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const slice = candles.slice(0, i + 1);
    const vwap = sessionVwap(slice);
    const close = Number(candles[i].close);
    if (!(vwap > 0) || !(close > 0)) break;
    const against = side === "CE" ? close < vwap : close > vwap;
    if (!against) break;
    count += 1;
  }
  return count;
}

export function firstFuturesBias(completedSessionBars = []) {
  for (let i = 0; i < completedSessionBars.length; i += 1) {
    const slice = completedSessionBars.slice(0, i + 1);
    const vwap = sessionVwap(slice);
    const close = Number(completedSessionBars[i].close);
    if (!(vwap > 0) || !(close > 0)) continue;
    if (close > vwap) return { side: "CE", barIndex: i, vwap, close, bar: completedSessionBars[i] };
    if (close < vwap) return { side: "PE", barIndex: i, vwap, close, bar: completedSessionBars[i] };
  }
  return { side: "", barIndex: -1, vwap: 0, close: 0, bar: null };
}

export function optionCloseAboveVwap(optionBars = []) {
  if (!optionBars.length) return false;
  const vwap = sessionVwap(optionBars);
  const close = Number(optionBars[optionBars.length - 1].close);
  return vwap > 0 && close > vwap;
}

export function lastBarVwapReversal(completedSessionBars = []) {
  if (!completedSessionBars.length) {
    return { buyCe: false, buyPe: false, open: 0, close: 0, vwap: 0, bar: null };
  }
  const last = completedSessionBars[completedSessionBars.length - 1];
  const vwap = sessionVwap(completedSessionBars);
  const open = Number(last.open);
  const close = Number(last.close);
  const buyCe = vwap > 0 && open < vwap && close > vwap;
  const buyPe = vwap > 0 && open > vwap && close < vwap;
  return { buyCe, buyPe, open, close, vwap, bar: last };
}

export const VwapSignalEngine = {
  sessionKeyIST,
  istWallTime,
  sessionBarOpenMs,
  aggregateSessionBars,
  sessionBars,
  completedCandles,
  sessionVwap,
  consecutiveAgainstVwap,
  firstFuturesBias,
  optionCloseAboveVwap,
  lastBarVwapReversal,
  evaluate({ futuresBars = [], ceBars = [], peBars = [], now = Date.now(), barMs = BAR_MS } = {}) {
    const futCompleted = completedCandles(sessionBars(futuresBars, now), now, barMs);
    const ceCompleted = completedCandles(sessionBars(ceBars, now), now, barMs);
    const peCompleted = completedCandles(sessionBars(peBars, now), now, barMs);
    const bias = firstFuturesBias(futCompleted);
    const futVwap = sessionVwap(futCompleted);
    const lastFut = futCompleted[futCompleted.length - 1] || null;
    return {
      ready: Boolean(lastFut && futVwap > 0),
      barTime: lastFut ? Number(lastFut.time) : 0,
      futuresClose: lastFut ? Number(lastFut.close) : 0,
      futuresVwap: futVwap,
      bias: bias.side,
      buyCe: bias.side === "CE" && optionCloseAboveVwap(ceCompleted),
      buyPe: bias.side === "PE" && optionCloseAboveVwap(peCompleted),
      ceAboveVwap: optionCloseAboveVwap(ceCompleted),
      peAboveVwap: optionCloseAboveVwap(peCompleted),
      againstCount: lastFut ? consecutiveAgainstVwap(futCompleted, bias.side || "CE") : 0,
      againstCe: consecutiveAgainstVwap(futCompleted, "CE"),
      againstPe: consecutiveAgainstVwap(futCompleted, "PE"),
    };
  },
  evaluateReversal({ futuresBars = [], now = Date.now(), barMs = 15 * 60 * 1000 } = {}) {
    const barMinutes = Math.max(1, Math.round(Number(barMs) / 60_000) || 15);
    const futCompleted = aggregateSessionBars(sessionBars(futuresBars, now), barMinutes, now);
    const lastFut = futCompleted[futCompleted.length - 1] || null;
    const reversal = lastBarVwapReversal(futCompleted);
    return {
      ready: Boolean(lastFut && reversal.vwap > 0),
      barTime: lastFut ? Number(lastFut.time) : 0,
      futuresClose: lastFut ? Number(lastFut.close) : 0,
      futuresOpen: lastFut ? Number(lastFut.open) : 0,
      futuresVwap: reversal.vwap,
      bias: reversal.buyCe ? "CE" : reversal.buyPe ? "PE" : "",
      buyCe: reversal.buyCe,
      buyPe: reversal.buyPe,
      ceAboveVwap: false,
      peAboveVwap: false,
      againstCount: 0,
      againstCe: 0,
      againstPe: 0,
    };
  },
};
