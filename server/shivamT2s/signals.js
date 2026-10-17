import { candleAllowsEntry, candleQuality } from "../candleQuality.js";

export function candleColor(bar) {
  return candleQuality(bar).color;
}

export function completedBars(bars = [], barMs, now = Date.now()) {
  const width = Number(barMs) || 5 * 60 * 1000;
  return (bars || []).filter((bar) => {
    const t = Number(bar?.time);
    if (!Number.isFinite(t)) return false;
    return Number(now) >= t + width;
  });
}

export function lastCompletedBar(bars = [], barMs, now = Date.now()) {
  const rows = completedBars(bars, barMs, now);
  return rows[rows.length - 1] || null;
}

export function barIsStale(bar, barMs, now = Date.now(), maxBars = 2.5) {
  const t = Number(bar?.time);
  const width = Number(barMs) || 0;
  if (!(t > 0) || !(width > 0)) return true;
  return Number(now) - (t + width) > width * maxBars;
}

export function barIsValid(bar) {
  const open = Number(bar?.open);
  const close = Number(bar?.close);
  const high = Number(bar?.high || Math.max(open, close));
  const low = Number(bar?.low || Math.min(open, close));
  return open > 0 && close > 0 && high > 0 && low > 0 && Number(bar?.time) > 0;
}

export function isDojiColor(color) {
  return String(color || "") === "doji";
}

export function evaluateShivamEntry({ indexBar, futureBar, ceBar, peBar } = {}) {
  const futBar = futureBar || indexBar;
  const indexColor = candleColor(indexBar);
  const futureColor = candleColor(futBar);
  const ceColor = candleColor(ceBar);
  const peColor = candleColor(peBar);
  const indexReady = barIsValid(indexBar) && indexColor && !isDojiColor(indexColor) && candleAllowsEntry(indexBar);
  const futureReady = barIsValid(futBar) && futureColor && !isDojiColor(futureColor) && candleAllowsEntry(futBar);
  const ceReady = barIsValid(ceBar) && ceColor === "green" && !isDojiColor(ceColor) && candleAllowsEntry(ceBar);
  const peReady = barIsValid(peBar) && peColor === "green" && !isDojiColor(peColor) && candleAllowsEntry(peBar);
  return {
    indexColor,
    futureColor,
    ceColor,
    peColor,
    buyCe: indexReady && futureReady && indexColor === "green" && futureColor === "green" && ceReady,
    buyPe: indexReady && futureReady && indexColor === "red" && futureColor === "red" && peReady,
    indexOpen: Number(indexBar?.open) || 0,
    indexClose: Number(indexBar?.close) || 0,
    futureOpen: Number(futBar?.open) || 0,
    futureClose: Number(futBar?.close) || 0,
    indexBarTime: Number(indexBar?.time) || 0,
    futureBarTime: Number(futBar?.time) || 0,
    ceBarTime: Number(ceBar?.time) || 0,
    peBarTime: Number(peBar?.time) || 0,
  };
}

export function cardSignalReady({ buyCe, buyPe, stale, incomplete, riskApproved, authorized, feedLive } = {}) {
  if (!feedLive || stale || incomplete || !riskApproved || !authorized) return false;
  return Boolean(buyCe || buyPe);
}
