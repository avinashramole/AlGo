function round2(value) {
  return Number(Number(value).toFixed(2));
}

export function profitPct(entry, mark) {
  const e = Number(entry);
  const m = Number(mark);
  if (!(e > 0) || !Number.isFinite(m)) return 0;
  return ((m - e) / e) * 100;
}

export const TrailingStopManager = {
  profitPct,
  initialStop(entry, initialSlPct = 20) {
    return round2(Number(entry) * (1 - Number(initialSlPct) / 100));
  },
  targetPrice(entry, targetPct = 40) {
    return round2(Number(entry) * (1 + Number(targetPct) / 100));
  },
  nextStop({ entry, mark, prevStop, initialSlPct = 20, activationPct = 10, stepPct = 3 }) {
    const start = Number(entry) * (1 - Number(initialSlPct) / 100);
    const pct = profitPct(entry, mark);
    let stop = start;
    if (pct + 1e-9 >= Number(activationPct)) {
      const extra = pct - Number(activationPct);
      const steps = Math.floor(extra / Number(stepPct) + 1e-9);
      stop = start + Number(entry) * ((Number(activationPct) + steps * Number(stepPct)) / 100);
    }
    stop = round2(stop);
    if (Number.isFinite(Number(prevStop))) stop = Math.max(stop, Number(prevStop));
    return stop;
  },
  hitStop(mark, stop) {
    return Number(mark) <= Number(stop);
  },
  hitTarget(mark, target) {
    return Number(mark) >= Number(target);
  },
};
