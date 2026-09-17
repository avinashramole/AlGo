export const OPTION_UNDERLYINGS = [
  { id: "NIFTY", label: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
  { id: "SENSEX", label: "SENSEX", lot: 20 },
  { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 },
];

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

export function isCrudeUnderlying(symbol?: string) {
  return String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .includes("CRUDEOIL");
}
