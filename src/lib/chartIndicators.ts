import type { Candle } from "./chartData";

export function closes(candles: Candle[]) {
  return candles.map((row) => Number(row.close) || 0);
}

export function sma(values: number[], period: number) {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period < 1) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number) {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function wma(values: number[], period: number) {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period < 1) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i += 1) {
    let sum = 0;
    for (let w = 1; w <= period; w += 1) sum += values[i - period + w] * w;
    out[i] = sum / denom;
  }
  return out;
}

export function sessionVwap(candles: Candle[]) {
  const out: Array<number | null> = Array(candles.length).fill(null);
  let day = "";
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i += 1) {
    const row = candles[i];
    const key = new Date(row.time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (key !== day) {
      day = key;
      pv = 0;
      vol = 0;
    }
    const typical = (Number(row.high) + Number(row.low) + Number(row.close)) / 3;
    const volume = Math.max(0, Number(row.volume) || 0);
    pv += typical * volume;
    vol += volume;
    out[i] = vol > 0 ? pv / vol : typical;
  }
  return out;
}

export function trueRange(candles: Candle[]) {
  return candles.map((row, i) => {
    const high = Number(row.high);
    const low = Number(row.low);
    const prev = i > 0 ? Number(candles[i - 1].close) : high;
    return Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev));
  });
}

export function wilderSmooth(values: number[], period: number) {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let prev = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function atr(candles: Candle[], period = 14) {
  return wilderSmooth(trueRange(candles), period);
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    const mean = mid[i];
    if (mean == null) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { mid, upper, lower };
}

export function rsi(values: number[], period = 14) {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, diff)) / period;
    loss = (loss * (period - 1) + Math.max(0, -diff)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line: Array<number | null> = values.map((_, i) =>
    fastEma[i] == null || slowEma[i] == null ? null : (fastEma[i] as number) - (slowEma[i] as number),
  );
  const compact = line.filter((value): value is number => value != null);
  const signalSeed = ema(compact, signal);
  const signalLine: Array<number | null> = Array(values.length).fill(null);
  let seed = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] == null) continue;
    signalLine[i] = signalSeed[seed] ?? null;
    seed += 1;
  }
  const hist = line.map((value, i) => (value == null || signalLine[i] == null ? null : value - (signalLine[i] as number)));
  return { line, signal: signalLine, hist };
}

export function stochastic(candles: Candle[], period = 14, smooth = 3) {
  const raw: Array<number | null> = Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i += 1) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      high = Math.max(high, Number(candles[j].high));
      low = Math.min(low, Number(candles[j].low));
    }
    const range = high - low || 1;
    raw[i] = ((Number(candles[i].close) - low) / range) * 100;
  }
  const k = sma(
    raw.map((value) => value ?? 0),
    smooth,
  ).map((value, i) => (raw[i] == null ? null : value));
  const d = sma(
    k.map((value) => value ?? 0),
    smooth,
  ).map((value, i) => (k[i] == null ? null : value));
  return { k, d };
}

export function supertrend(candles: Candle[], period = 7, mult = 3) {
  const atrs = atr(candles, period);
  const line: Array<number | null> = Array(candles.length).fill(null);
  const dir: Array<number | null> = Array(candles.length).fill(null);
  let prevUpper = 0;
  let prevLower = 0;
  let prevDir = 1;
  for (let i = 0; i < candles.length; i += 1) {
    const width = atrs[i];
    if (width == null) continue;
    const mid = (Number(candles[i].high) + Number(candles[i].low)) / 2;
    let upper = mid + mult * width;
    let lower = mid - mult * width;
    if (i > 0 && atrs[i - 1] != null) {
      const prevClose = Number(candles[i - 1].close);
      upper = upper < prevUpper || prevClose > prevUpper ? upper : prevUpper;
      lower = lower > prevLower || prevClose < prevLower ? lower : prevLower;
    }
    let nextDir = prevDir;
    if (i > 0) {
      if (prevDir === 1 && Number(candles[i].close) < lower) nextDir = -1;
      else if (prevDir === -1 && Number(candles[i].close) > upper) nextDir = 1;
    }
    line[i] = nextDir === 1 ? lower : upper;
    dir[i] = nextDir;
    prevUpper = upper;
    prevLower = lower;
    prevDir = nextDir;
  }
  return { line, dir };
}

export function parabolicSar(candles: Candle[], step = 0.02, max = 0.2) {
  const out: Array<number | null> = Array(candles.length).fill(null);
  if (candles.length < 3) return out;
  let up = Number(candles[1].close) >= Number(candles[0].close);
  let af = step;
  let ep = up ? Number(candles[0].high) : Number(candles[0].low);
  let sar = up ? Number(candles[0].low) : Number(candles[0].high);
  out[1] = sar;
  for (let i = 2; i < candles.length; i += 1) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    sar = sar + af * (ep - sar);
    if (up) {
      sar = Math.min(sar, Number(candles[i - 1].low), Number(candles[i - 2].low));
      if (low < sar) {
        up = false;
        sar = ep;
        ep = low;
        af = step;
      } else {
        if (high > ep) {
          ep = high;
          af = Math.min(max, af + step);
        }
      }
    } else {
      sar = Math.max(sar, Number(candles[i - 1].high), Number(candles[i - 2].high));
      if (high > sar) {
        up = true;
        sar = ep;
        ep = high;
        af = step;
      } else if (low < ep) {
        ep = low;
        af = Math.min(max, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

export function adx(candles: Candle[], period = 14) {
  const plus: number[] = [];
  const minus: number[] = [];
  const tr = trueRange(candles);
  for (let i = 0; i < candles.length; i += 1) {
    if (i === 0) {
      plus.push(0);
      minus.push(0);
      continue;
    }
    const up = Number(candles[i].high) - Number(candles[i - 1].high);
    const down = Number(candles[i - 1].low) - Number(candles[i].low);
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
  }
  const smoothPlus = wilderSmooth(plus, period);
  const smoothMinus = wilderSmooth(minus, period);
  const smoothTr = wilderSmooth(tr, period);
  const plusDi: Array<number | null> = Array(candles.length).fill(null);
  const minusDi: Array<number | null> = Array(candles.length).fill(null);
  const dx: number[] = Array(candles.length).fill(0);
  for (let i = 0; i < candles.length; i += 1) {
    if (smoothTr[i] == null || !smoothTr[i]) continue;
    plusDi[i] = (100 * (smoothPlus[i] || 0)) / (smoothTr[i] as number);
    minusDi[i] = (100 * (smoothMinus[i] || 0)) / (smoothTr[i] as number);
    const sum = (plusDi[i] || 0) + (minusDi[i] || 0) || 1;
    dx[i] = (100 * Math.abs((plusDi[i] || 0) - (minusDi[i] || 0))) / sum;
  }
  return { adx: wilderSmooth(dx, period), plusDi, minusDi };
}

export function cci(candles: Candle[], period = 20) {
  const typical = candles.map((row) => (Number(row.high) + Number(row.low) + Number(row.close)) / 3);
  const mean = sma(typical, period);
  const out: Array<number | null> = Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i += 1) {
    if (mean[i] == null) continue;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j += 1) dev += Math.abs(typical[j] - (mean[i] as number));
    const md = dev / period || 1;
    out[i] = (typical[i] - (mean[i] as number)) / (0.015 * md);
  }
  return out;
}

export function williamsR(candles: Candle[], period = 14) {
  const out: Array<number | null> = Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i += 1) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      high = Math.max(high, Number(candles[j].high));
      low = Math.min(low, Number(candles[j].low));
    }
    out[i] = ((high - Number(candles[i].close)) / (high - low || 1)) * -100;
  }
  return out;
}

export function obv(candles: Candle[]) {
  const out: Array<number | null> = Array(candles.length).fill(null);
  let value = 0;
  for (let i = 0; i < candles.length; i += 1) {
    if (i > 0) {
      const prev = Number(candles[i - 1].close);
      const close = Number(candles[i].close);
      const vol = Math.max(0, Number(candles[i].volume) || 0);
      if (close > prev) value += vol;
      else if (close < prev) value -= vol;
    }
    out[i] = value;
  }
  return out;
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  candles.forEach((row, i) => {
    const haClose = (Number(row.open) + Number(row.high) + Number(row.low) + Number(row.close)) / 4;
    const prev = out[i - 1];
    const haOpen = prev ? (prev.open + prev.close) / 2 : (Number(row.open) + Number(row.close)) / 2;
    out.push({
      time: row.time,
      open: haOpen,
      high: Math.max(Number(row.high), haOpen, haClose),
      low: Math.min(Number(row.low), haOpen, haClose),
      close: haClose,
      volume: row.volume,
    });
  });
  return out;
}

export type PivotLevels = { p: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };

export function sessionPivots(candles: Candle[]): PivotLevels | null {
  if (!candles.length) return null;
  const lastDay = new Date(candles[candles.length - 1].time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let high = -Infinity;
  let low = Infinity;
  let close = 0;
  let found = false;
  for (const row of candles) {
    const day = new Date(row.time).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (day === lastDay) continue;
    found = true;
    high = Math.max(high, Number(row.high));
    low = Math.min(low, Number(row.low));
    close = Number(row.close);
  }
  if (!found) {
    high = Math.max(...candles.map((row) => Number(row.high)));
    low = Math.min(...candles.map((row) => Number(row.low)));
    close = Number(candles[candles.length - 1].close);
  }
  const p = (high + low + close) / 3;
  return {
    p,
    r1: 2 * p - low,
    s1: 2 * p - high,
    r2: p + (high - low),
    s2: p - (high - low),
    r3: high + 2 * (p - low),
    s3: low - 2 * (high - p),
  };
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
