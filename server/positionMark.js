export function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function isOptionContract(symbol, option = "") {
  if (option === "CE" || option === "PE") return true;
  return /\b(CE|PE|CALL|PUT)\b/i.test(String(symbol || ""));
}

export function isSaneOptionLtp(ltp, avg = 0) {
  const price = Number(ltp);
  if (!(price > 0) || !Number.isFinite(price)) return false;
  if (price >= 8000) return false;
  const cost = Number(avg) || 0;
  if (cost > 0 && cost < 2000 && price > Math.max(cost * 15, 2500)) return false;
  return true;
}

export function preferMarkLtp(row = {}, feedLtp) {
  const avg = Number(row.avg) || 0;
  const tick = Number(row.ltp);
  const feed = Number(feedLtp);
  if (isOptionContract(row.symbol, row.option)) {
    if (row.ticked && isSaneOptionLtp(tick, avg)) return tick;
    if (isSaneOptionLtp(feed, avg)) return feed;
    if (isSaneOptionLtp(tick, avg) && Math.abs(tick - avg) > 0.05) return tick;
    return 0;
  }
  return feed > 0 ? feed : tick > 0 ? tick : 0;
}

export function markContractToMarket(row = {}, liveLtp) {
  const avg = Number(row.avg) || 0;
  const qty = Number(row.qty) || 0;
  const dir = String(row.type || "BUY").toUpperCase() === "SELL" ? -1 : 1;
  const option = isOptionContract(row.symbol, row.option);
  const ltp = Number(liveLtp);
  const useLive = option ? isSaneOptionLtp(ltp, avg) : ltp > 0;
  if (useLive && qty) {
    return { ...row, ltp: round2(ltp), pnl: round2((ltp - avg) * qty * dir) };
  }
  if (option) {
    const brokerPnl = Number(row.brokerPnl);
    const brokerLtp = Number(row.brokerLtp);
    if (Number.isFinite(brokerPnl)) {
      return {
        ...row,
        ltp: isSaneOptionLtp(brokerLtp, avg) ? round2(brokerLtp) : avg,
        pnl: round2(brokerPnl),
      };
    }
    if (!isSaneOptionLtp(Number(row.ltp), avg)) {
      return { ...row, ltp: avg, pnl: 0 };
    }
  }
  return row;
}
