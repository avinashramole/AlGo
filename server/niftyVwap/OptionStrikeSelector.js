export function atmStrike(spot, step = 50) {
  const price = Number(spot);
  const width = Number(step) || 50;
  if (!(price > 0)) return 0;
  return Math.round(price / width) * width;
}

export function strikeForOffset(spot, step = 50, strikeOffset = 0) {
  const width = Number(step) || 50;
  const atm = atmStrike(spot, width);
  if (!atm) return 0;
  const offset = Math.max(-5, Math.min(5, Math.round(Number(strikeOffset) || 0)));
  return atm + offset * width;
}

export function optionLabel(symbol, strike, option) {
  return `${symbol} ${strike} ${option}`;
}

export const OptionStrikeSelector = {
  atmStrike,
  strikeForOffset,
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
    const strike = strikeForOffset(spot, step, strikeOffset);
    const opt = option === "PE" ? "PE" : "CE";
    return {
      strike,
      option: opt,
      symbol: optionLabel(symbol, strike, opt),
      locked: false,
    };
  },
};
