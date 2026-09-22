export function atmStrike(spot, step = 50) {
  const price = Number(spot);
  const width = Number(step) || 50;
  if (!(price > 0)) return 0;
  return Math.round(price / width) * width;
}

export function optionLabel(symbol, strike, option) {
  return `${symbol} ${strike} ${option}`;
}

export const OptionStrikeSelector = {
  atmStrike,
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
    const offset = Math.max(-2, Math.min(2, Math.round(Number(strikeOffset) || 0)));
    const strike = atmStrike(spot, step) + offset * (Number(step) || 50);
    const opt = option === "PE" ? "PE" : "CE";
    return {
      strike,
      option: opt,
      symbol: optionLabel(symbol, strike, opt),
      locked: false,
    };
  },
};
