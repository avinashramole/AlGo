export function candleColor(bar) {
  if (!bar) return "";
  const open = Number(bar.open);
  const close = Number(bar.close);
  if (!(open > 0) || !(close > 0)) return "";
  if (close > open) return "green";
  if (close < open) return "red";
  return "doji";
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
  return {
    indexColor,
    ceColor,
    peColor,
    buyCe: indexColor === "green" && ceColor === "green",
    buyPe: indexColor === "red" && peColor === "green",
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
