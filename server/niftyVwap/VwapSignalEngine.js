const BAR_MS = 5 * 60 * 1000;

export function sessionKeyIST(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
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

export const VwapSignalEngine = {
  sessionKeyIST,
  sessionBars,
  completedCandles,
  sessionVwap,
  consecutiveAgainstVwap,
  firstFuturesBias,
  optionCloseAboveVwap,
  evaluate({ futuresBars = [], ceBars = [], peBars = [], now = Date.now() } = {}) {
    const futCompleted = completedCandles(sessionBars(futuresBars, now), now);
    const ceCompleted = completedCandles(sessionBars(ceBars, now), now);
    const peCompleted = completedCandles(sessionBars(peBars, now), now);
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
};
