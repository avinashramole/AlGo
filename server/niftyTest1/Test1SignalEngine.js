import { completedCandles, istWallTime, sessionBars } from "../niftyVwap/VwapSignalEngine.js";

function hmToMinutes(hm, fallback = "09:30") {
  const raw = String(hm || fallback);
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 9 * 60 + 30;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function candleMetrics(bar) {
  const open = Number(bar?.open);
  const high = Number(bar?.high);
  const low = Number(bar?.low);
  const close = Number(bar?.close);
  const range = high - low;
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const wick = Math.max(0, upperWick) + Math.max(0, lowerWick);
  const bodyPct = range > 0 ? body / range : 0;
  const wickPct = range > 0 ? wick / range : 1;
  return {
    time: Number(bar?.time) || 0,
    open,
    high,
    low,
    close,
    range,
    body,
    upperWick,
    lowerWick,
    wick,
    bodyPct,
    wickPct,
    green: close > open,
  };
}

export function isStrongGreenBody(bar, { minBodyPct = 0.9, maxWickPct = 0.1 } = {}) {
  const metrics = candleMetrics(bar);
  const ok =
    metrics.green &&
    metrics.range > 0 &&
    metrics.bodyPct + 1e-9 >= Number(minBodyPct) &&
    metrics.wickPct - 1e-9 <= Number(maxWickPct);
  return { ok, ...metrics };
}

function inSignalWindow(bar, startTimeIst, endTimeIst) {
  const wall = istWallTime(bar?.time);
  const mins = wall.hour * 60 + wall.minute;
  return mins >= hmToMinutes(startTimeIst, "09:30") && mins < hmToMinutes(endTimeIst, "15:15");
}

function lastCompleted(bars, now, barMs, startTimeIst, endTimeIst) {
  const rows = completedCandles(sessionBars(bars, now), now, barMs).filter((bar) => inSignalWindow(bar, startTimeIst, endTimeIst));
  return rows[rows.length - 1] || null;
}

export const Test1SignalEngine = {
  candleMetrics,
  isStrongGreenBody,
  evaluate({
    ceBars = [],
    peBars = [],
    now = Date.now(),
    barMs = 5 * 60 * 1000,
    startTimeIst = "09:30",
    endTimeIst = "15:15",
    minBodyPct = 0.9,
    maxWickPct = 0.1,
  } = {}) {
    const waitingStart = istWallTime(now);
    const nowMins = waitingStart.hour * 60 + waitingStart.minute;
    const startMins = hmToMinutes(startTimeIst, "09:30");
    const waitingEval = nowMins < startMins;
    const cfg = { minBodyPct, maxWickPct };
    const ceBar = lastCompleted(ceBars, now, barMs, startTimeIst, endTimeIst);
    const peBar = lastCompleted(peBars, now, barMs, startTimeIst, endTimeIst);
    const ce = ceBar ? isStrongGreenBody(ceBar, cfg) : null;
    const pe = peBar ? isStrongGreenBody(peBar, cfg) : null;
    const latestTime = Math.max(ce?.time || 0, pe?.time || 0);
    const ceReady = Boolean(ce && ce.time === latestTime);
    const peReady = Boolean(pe && pe.time === latestTime);
    let option = "";
    let pick = null;
    if (!waitingEval && latestTime) {
      if (ceReady && ce.ok && peReady && pe.ok) {
        pick = ce.bodyPct >= pe.bodyPct ? ce : pe;
        option = pick === ce ? "CE" : "PE";
      } else if (ceReady && ce.ok) {
        pick = ce;
        option = "CE";
      } else if (peReady && pe.ok) {
        pick = pe;
        option = "PE";
      }
    }
    const shown = pick || (ceReady ? ce : peReady ? pe : ce || pe);
    return {
      ready: Boolean(!waitingEval && latestTime),
      waitingEval,
      barTime: latestTime,
      option,
      buyCe: option === "CE",
      buyPe: option === "PE",
      open: shown?.open || 0,
      high: shown?.high || 0,
      low: shown?.low || 0,
      close: shown?.close || 0,
      range: shown?.range || 0,
      body: shown?.body || 0,
      bodyPct: shown?.bodyPct || 0,
      wickPct: shown?.wickPct || 0,
      green: Boolean(shown?.green),
    };
  },
};
