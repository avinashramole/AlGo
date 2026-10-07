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
