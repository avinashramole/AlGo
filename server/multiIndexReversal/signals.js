import { candleAllowsEntry, candleQuality } from "../candleQuality.js";

export function candleColor(bar) {
  return candleQuality(bar).color;
}

export function completedBars(bars = [], barMs, now = Date.now()) {
  const width = Number(barMs) || 15 * 60 * 1000;
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

export function sameIntervalBar(bars = [], time) {
  const want = Number(time);
  if (!Number.isFinite(want)) return null;
  return (bars || []).find((bar) => Number(bar.time) === want) || null;
}

export function evaluateEntry({ indexBar, ceBar, peBar } = {}) {
  const indexColor = candleColor(indexBar);
  const ceColor = candleColor(ceBar);
  const peColor = candleColor(peBar);
  const indexOk = candleAllowsEntry(indexBar);
  return {
    indexColor,
    ceColor,
    peColor,
    buyCe: indexOk && indexColor === "green" && ceColor === "green" && candleAllowsEntry(ceBar),
    buyPe: indexOk && indexColor === "red" && peColor === "green" && candleAllowsEntry(peBar),
    barTime: Number(indexBar?.time) || 0,
    indexOpen: Number(indexBar?.open) || 0,
    indexClose: Number(indexBar?.close) || 0,
  };
}

export function lossPct(avg, mark) {
  const entry = Number(avg);
  const px = Number(mark);
  if (!(entry > 0)) return 0;
  return ((entry - px) / entry) * 100;
}

export function premiumValue(avg, qty) {
  return Math.max(0, Number(avg) * Number(qty));
}

export function positionPnl(avg, mark, qty) {
  return (Number(mark) - Number(avg)) * Number(qty);
}
