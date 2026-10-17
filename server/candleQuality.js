export const CANDLE_ENTRY_RULE =
  "Entry uses the last completed candle. Skip doji. Skip if upper wick or lower wick is greater than the candle body.";

export function candleQuality(bar) {
  const open = Number(bar?.open);
  const close = Number(bar?.close);
  if (!(open > 0) || !(close > 0)) {
    return {
      color: "",
      body: 0,
      upperWick: 0,
      lowerWick: 0,
      doji: false,
      wickGtBody: false,
      skipEntry: true,
      usable: false,
    };
  }
  const top = Math.max(open, close);
  const bottom = Math.min(open, close);
  const high = Number(bar?.high) > 0 ? Number(bar.high) : top;
  const low = Number(bar?.low) > 0 ? Number(bar.low) : bottom;
  const body = Math.abs(close - open);
  const upperWick = Math.max(0, high - top);
  const lowerWick = Math.max(0, bottom - low);
  const color = close > open ? "green" : close < open ? "red" : "doji";
  const doji = color === "doji";
  const wickGtBody = upperWick > body || lowerWick > body;
  const skipEntry = doji || wickGtBody;
  return {
    color,
    body,
    upperWick,
    lowerWick,
    doji,
    wickGtBody,
    skipEntry,
    usable: !skipEntry,
  };
}

export function candleAllowsEntry(bar) {
  return candleQuality(bar).usable;
}
