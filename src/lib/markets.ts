export function chainIdFromIndex(symbol: string) {
  const compact = String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (compact.includes("BANKNIFTY")) return "BANKNIFTY";
  if (compact.includes("FINNIFTY")) return "FINNIFTY";
  if (compact.includes("SENSEX")) return "SENSEX";
  if (compact.includes("CRUDEOIL")) return "CRUDEOIL";
  if (compact.includes("NIFTY") && !compact.includes("VIX")) return "NIFTY";
  return "";
}

export function exchangeSegmentFor(symbol: string) {
  const upper = String(symbol || "").toUpperCase();
  if (upper.includes("CRUDEOIL")) return "MCX_COMM";
  if (upper.includes("SENSEX")) return "BSE_FNO";
  return "NSE_FNO";
}
