export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function generateCandles(count: number, startPrice: number, seed = 42): Candle[] {
  const rand = seeded(seed);
  const candles: Candle[] = [];
  let price = startPrice;
  const now = Date.now();
  const step = 60_000;

  for (let i = count; i >= 0; i -= 1) {
    const drift = (rand() - 0.48) * 18;
    const open = price;
    const close = Math.max(100, open + drift);
    const high = Math.max(open, close) + rand() * 12;
    const low = Math.min(open, close) - rand() * 12;
    const volume = 800_000 + rand() * 2_400_000;
    candles.push({
      time: now - i * step,
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return candles;
}

export function sparklineFrom(values: number[]) {
  return values;
}
