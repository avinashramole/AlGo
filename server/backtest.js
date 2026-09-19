function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i];
  return sum / period;
}

function emaSeries(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i += 1) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsiAt(closes, period) {
  if (closes.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function trueRange(prev, bar) {
  return Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close));
}

function supertrendAt(candles, period, multiplier) {
  if (candles.length < period + 2) return candles[candles.length - 1]?.close || 0;
  let atr = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    atr += trueRange(candles[i - 1] || candles[i], candles[i]);
  }
  atr /= period;
  const last = candles[candles.length - 1];
  const mid = (last.high + last.low) / 2;
  const upper = mid + multiplier * atr;
  const lower = mid - multiplier * atr;
  return last.close >= mid ? lower : upper;
}

function vwapAt(candles) {
  let pv = 0;
  let vol = 0;
  for (const bar of candles) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    pv += typical * (bar.volume || 1);
    vol += bar.volume || 1;
  }
  return vol ? pv / vol : candles[candles.length - 1]?.close || 0;
}

function macdHist(closes) {
  if (closes.length < 35) return 0;
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  const macd = fast.map((value, i) => value - slow[i]);
  const signal = emaSeries(macd, 9);
  return macd[macd.length - 1] - signal[signal.length - 1];
}

function sessionOpenIndex(candles, i) {
  const day = new Date(candles[i].time).toDateString();
  let start = i;
  while (start > 0 && new Date(candles[start - 1].time).toDateString() === day) start -= 1;
  return start;
}

function sourcesAt(candles, i, algo) {
  if (i < 0 || !candles[i]) {
    return {
      price: 0,
      vwap: 0,
      ema_fast: 0,
      ema_slow: 0,
      rsi: 50,
      macd: 0,
      supertrend: 0,
      or_high: 0,
      or_low: 0,
      lookback_high: 0,
      lookback_low: 0,
      value: 0,
    };
  }
  const slice = candles.slice(0, i + 1);
  const closes = slice.map((bar) => bar.close);
  const lookback = Math.max(5, Number(algo.lookback) || 20);
  const rangeBars = Math.max(1, Math.round((Number(algo.rangeMinutes) || 15) / barMinutes(algo.timeframe)));
  const openIdx = sessionOpenIndex(candles, i);
  const orSlice = candles.slice(openIdx, Math.min(i + 1, openIdx + rangeBars));
  const look = slice.slice(-lookback);
  return {
    price: candles[i].close,
    vwap: vwapAt(slice),
    ema_fast: emaSeries(closes, Number(algo.fast) || 9).at(-1),
    ema_slow: emaSeries(closes, Number(algo.slow) || 21).at(-1),
    rsi: rsiAt(closes, Number(algo.period) || 14),
    macd: macdHist(closes),
    supertrend: supertrendAt(slice, Number(algo.period) || 10, Number(algo.multiplier) || 3),
    or_high: Math.max(...orSlice.map((bar) => bar.high)),
    or_low: Math.min(...orSlice.map((bar) => bar.low)),
    lookback_high: Math.max(...look.map((bar) => bar.high)),
    lookback_low: Math.min(...look.map((bar) => bar.low)),
    value: 0,
  };
}

function rsiAtIndex(closes, i, period) {
  if (i < period) return 50;
  let gain = 0;
  let loss = 0;
  for (let j = i - period + 1; j <= i; j += 1) {
    const diff = closes[j] - closes[j - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

export function precomputeSources(candles = [], algo = {}) {
  const bars = Array.isArray(candles) ? candles : [];
  const closes = bars.map((bar) => Number(bar.close));
  const fast = Number(algo.fast) || 9;
  const slow = Number(algo.slow) || 21;
  const period = Number(algo.period) || 14;
  const multiplier = Number(algo.multiplier) || 3;
  const lookback = Math.max(5, Number(algo.lookback) || 20);
  const rangeBars = Math.max(1, Math.round((Number(algo.rangeMinutes) || 15) / barMinutes(algo.timeframe)));
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdFast = emaSeries(closes, 12);
  const macdSlow = emaSeries(closes, 26);
  const macdLine = macdFast.map((value, i) => value - macdSlow[i]);
  const macdSignal = emaSeries(macdLine, 9);
  const cache = [];
  let pv = 0;
  let vol = 0;
  let sessionStart = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (i > 0 && new Date(bars[i].time).toDateString() !== new Date(bars[i - 1].time).toDateString()) {
      sessionStart = i;
    }
    const typical = (Number(bars[i].high) + Number(bars[i].low) + Number(bars[i].close)) / 3;
    const barVol = Number(bars[i].volume) || 1;
    pv += typical * barVol;
    vol += barVol;
    const orEnd = Math.min(i + 1, sessionStart + rangeBars);
    let orHigh = -Infinity;
    let orLow = Infinity;
    for (let j = sessionStart; j < orEnd; j += 1) {
      orHigh = Math.max(orHigh, Number(bars[j].high));
      orLow = Math.min(orLow, Number(bars[j].low));
    }
    const lookFrom = Math.max(0, i - lookback + 1);
    let lookHigh = -Infinity;
    let lookLow = Infinity;
    for (let j = lookFrom; j <= i; j += 1) {
      lookHigh = Math.max(lookHigh, Number(bars[j].high));
      lookLow = Math.min(lookLow, Number(bars[j].low));
    }
    cache[i] = {
      price: closes[i],
      vwap: vol ? pv / vol : closes[i],
      ema_fast: emaFast[i],
      ema_slow: emaSlow[i],
      rsi: rsiAtIndex(closes, i, period),
      macd: i < 34 ? 0 : macdLine[i] - macdSignal[i],
      supertrend: supertrendAt(bars.slice(Math.max(0, i - period - 1), i + 1), period, multiplier),
      or_high: Number.isFinite(orHigh) ? orHigh : closes[i],
      or_low: Number.isFinite(orLow) ? orLow : closes[i],
      lookback_high: Number.isFinite(lookHigh) ? lookHigh : closes[i],
      lookback_low: Number.isFinite(lookLow) ? lookLow : closes[i],
      value: 0,
    };
  }
  return cache;
}

function sourceAt(candles, i, algo, cache) {
  if (cache && i >= 0 && cache[i]) return cache[i];
  return sourcesAt(candles, i, algo);
}

function barMinutes(tf) {
  if (tf === "1m") return 1;
  if (tf === "15m") return 15;
  if (tf === "1H") return 60;
  return 5;
}

function readValue(src, sources, numberValue) {
  if (src === "value") return Number(numberValue) || 0;
  return Number(sources[src] ?? 0);
}

function isCloseOp(op) {
  return op === "close_above" || op === "close_below";
}

function completedBarIndex(candles, i, timeframe, now = Date.now()) {
  if (i < 0) return -1;
  const barMs = barMinutes(timeframe) * 60_000;
  const t = Number(candles[i]?.time);
  if (Number.isFinite(t) && now < t + barMs) return i - 1;
  return i;
}

function hit(op, left, right, prevLeft, prevRight) {
  if (op === "close_above") return left > right;
  if (op === "close_below") return left < right;
  if (op === "crosses_above") return prevLeft <= prevRight && left > right;
  if (op === "crosses_below") return prevLeft >= prevRight && left < right;
  if (op === "above" || op === "gt") return left > right;
  if (op === "below" || op === "lt") return left < right;
  if (op === "gte") return left >= right;
  if (op === "lte") return left <= right;
  if (op === "eq") return Math.abs(left - right) < 0.0001;
  return false;
}

function evaluateRow(candles, idx, algo, row, cache) {
  const now = sourceAt(candles, idx, algo, cache);
  const prev = sourceAt(candles, idx - 1, algo, cache);
  const left = readValue(row.left || "price", now, row.value);
  const right = readValue(row.right || "vwap", now, row.value);
  const prevLeft = readValue(row.left || "price", prev, row.value);
  const prevRight = readValue(row.right || "vwap", prev, row.value);
  return hit(row.op || "crosses_above", left, right, prevLeft, prevRight);
}

function evaluateGroup(candles, idx, algo, group, cache) {
  const hits = group.rows.map((row) => evaluateRow(candles, idx, algo, row, cache));
  return group.join === "or" ? hits.some(Boolean) : hits.every(Boolean);
}

function groupFromAlgo(algo, side) {
  const fallback =
    side === "buy"
      ? { left: algo.buyLeft || "price", op: algo.buyOp || "crosses_above", right: algo.buyRight || "vwap", value: algo.buyValue }
      : { left: algo.sellLeft || "price", op: algo.sellOp || "crosses_below", right: algo.sellRight || "vwap", value: algo.sellValue };
  const group = side === "buy" ? algo.buyConditions : algo.sellConditions;
  const join = group?.join === "or" ? "or" : "and";
  const raw = Array.isArray(group?.rows) ? group.rows : [];
  const rows = (raw.length ? raw : [fallback]).slice(0, 5).map((row) => ({
    left: row.left || fallback.left,
    op: row.op || fallback.op,
    right: row.right || fallback.right,
    value: row.value ?? fallback.value,
  }));
  return { join, rows };
}

export function evaluateSignals(candles, i, algo, cache) {
  const buyGroup = groupFromAlgo(algo, "buy");
  const sellGroup = groupFromAlgo(algo, "sell");
  const closeOps = [...buyGroup.rows, ...sellGroup.rows].some((row) => isCloseOp(row.op));
  let idx = i;
  if (closeOps) idx = completedBarIndex(candles, i, algo.timeframe);
  if (idx < 2) return { buy: false, sell: false };
  const now = sourceAt(candles, idx, algo, cache);
  return {
    buy: evaluateGroup(candles, idx, algo, buyGroup, cache),
    sell: evaluateGroup(candles, idx, algo, sellGroup, cache),
    price: now.price,
  };
}

export function runBacktest(algo, candles = []) {
  const bars = Array.isArray(candles) ? candles.filter((bar) => Number(bar.close) > 0) : [];
  const qty = Math.max(1, Number(algo.qty) || Number(algo.lots || 1) * Number(algo.lotSize || 65));
  const slPct = Math.max(0.05, Number(algo.slPct) || 0.4) / 100;
  const targetPct = Math.max(0.1, Number(algo.targetPct) || 0.8) / 100;
  const side = algo.side || "BOTH";
  const trades = [];
  let open = null;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const start = Math.max(30, Number(algo.lookback) || 20);
  const cache = precomputeSources(bars, algo);

  for (let i = start; i < bars.length; i += 1) {
    const bar = bars[i];
    if (open) {
      const dir = open.side === "BUY" ? 1 : -1;
      const sl = open.entry * (1 - slPct * dir);
      const tgt = open.entry * (1 + targetPct * dir);
      let exit = null;
      if (open.side === "BUY") {
        if (bar.low <= sl) exit = sl;
        else if (bar.high >= tgt) exit = tgt;
      } else if (bar.high >= sl) exit = sl;
      else if (bar.low <= tgt) exit = tgt;
      const signal = evaluateSignals(bars, i, algo, cache);
      if (!exit && ((open.side === "BUY" && signal.sell) || (open.side === "SELL" && signal.buy))) {
        exit = bar.close;
      }
      if (exit) {
        const pnl = Number(((exit - open.entry) * qty * dir).toFixed(2));
        trades.push({
          side: open.side,
          entry: Number(open.entry.toFixed(2)),
          exit: Number(exit.toFixed(2)),
          qty,
          pnl,
          bars: i - open.bar,
        });
        equity += pnl;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.min(maxDrawdown, equity - peak);
        open = null;
      }
    }
    if (open) continue;
    const signal = evaluateSignals(bars, i, algo, cache);
    if (signal.buy && (side === "BUY" || side === "BOTH")) {
      open = { side: "BUY", entry: bar.close, bar: i };
    } else if (signal.sell && (side === "SELL" || side === "BOTH")) {
      open = { side: "SELL", entry: bar.close, bar: i };
    }
  }

  if (open && bars.length) {
    const last = bars[bars.length - 1];
    const dir = open.side === "BUY" ? 1 : -1;
    const pnl = Number(((last.close - open.entry) * qty * dir).toFixed(2));
    trades.push({
      side: open.side,
      entry: Number(open.entry.toFixed(2)),
      exit: Number(last.close.toFixed(2)),
      qty,
      pnl,
      bars: bars.length - 1 - open.bar,
    });
    equity += pnl;
  }

  const wins = trades.filter((row) => row.pnl > 0).length;
  return {
    ranAt: new Date().toISOString(),
    timeframe: algo.timeframe || "5m",
    bars: bars.length,
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    pnl: Number(equity.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    book: trades.slice(-12),
  };
}

export { sma };
