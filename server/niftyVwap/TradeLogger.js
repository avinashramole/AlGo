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
  purge(strategyName) {
    const name = String(strategyName || "").trim().toLowerCase();
    if (!name) return 0;
    const before = this.lines.length;
    this.lines = this.lines.filter((row) => String(row.strategy || "").trim().toLowerCase() !== name);
    return before - this.lines.length;
  },
};
