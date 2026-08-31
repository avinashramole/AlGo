export const TradeLogger = {
  lines: [],
  record(event, detail = {}) {
    const row = { at: new Date().toISOString(), event, ...detail };
    this.lines.unshift(row);
    if (this.lines.length > 200) this.lines.length = 200;
    const extra = detail.message || detail.reason || "";
    console.log(`NIFTY VWAP ${event}${extra ? ` · ${extra}` : ""}`);
    return row;
  },
};
