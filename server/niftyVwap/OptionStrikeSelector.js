export function atmStrike(spot, step = 50) {
  const price = Number(spot);
  const width = Number(step) || 50;
  if (!(price > 0)) return 0;
  return Math.round(price / width) * width;
}

export function clampStrikeOffset(offset) {
  return Math.max(-5, Math.min(5, Math.round(Number(offset) || 0)));
}

export function signedOptionOffset(offset, option) {
  const n = clampStrikeOffset(offset);
  return String(option || "").toUpperCase() === "PE" ? -n : n;
}

export function strikeForOffset(spot, step = 50, strikeOffset = 0) {
  const width = Number(step) || 50;
  const atm = atmStrike(spot, width);
  if (!atm) return 0;
  return atm + clampStrikeOffset(strikeOffset) * width;
}

export function strikeForWingOffset(spot, step = 50, strikeOffset = 0, option = "CE") {
  const width = Number(step) || 50;
  const atm = atmStrike(spot, width);
  if (!atm) return 0;
  return atm + signedOptionOffset(strikeOffset, option) * width;
}

export function optionLabel(symbol, strike, option) {
  return `${symbol} ${strike} ${option}`;
}

export const OptionStrikeSelector = {
  atmStrike,
  clampStrikeOffset,
  signedOptionOffset,
  strikeForOffset,
  strikeForWingOffset,
  optionLabel,
  select({ spot, step = 50, option, symbol = "NIFTY", locked, strikeOffset = 0 } = {}) {
    if (locked?.strike && locked?.option) {
      return {
        strike: Number(locked.strike),
        option: locked.option === "PE" ? "PE" : "CE",
        symbol: optionLabel(symbol, locked.strike, locked.option === "PE" ? "PE" : "CE"),
        locked: true,
      };
    }
    const opt = option === "PE" ? "PE" : "CE";
    const strike = strikeForWingOffset(spot, step, strikeOffset, opt);
    return {
      strike,
      option: opt,
      symbol: optionLabel(symbol, strike, opt),
      locked: false,
    };
  },
};
