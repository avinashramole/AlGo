export const OPTION_UNDERLYINGS = [
  { id: "NIFTY", label: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
  { id: "MIDCPNIFTY", label: "MIDCPNIFTY", lot: 50 },
  { id: "SENSEX", label: "SENSEX", lot: 20 },
  { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 },
  { id: "NATURALGAS", label: "NATURAL GAS", lot: 1250 },
  { id: "COPPER", label: "COPPER", lot: 2500 },
];

export function chainIdFromIndex(symbol: string) {
  const compact = String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (compact.includes("MIDCP") || compact.includes("MIDCAP")) return "MIDCPNIFTY";
  if (compact.includes("BANKNIFTY")) return "BANKNIFTY";
  if (compact.includes("FINNIFTY")) return "FINNIFTY";
  if (compact.includes("SENSEX")) return "SENSEX";
  if (compact.includes("NATURALGAS") || compact.includes("NATGAS")) return "NATURALGAS";
  if (compact.includes("COPPER")) return "COPPER";
  if (compact.includes("CRUDEOIL") || compact.includes("CRUDE")) return "CRUDEOIL";
  if (compact.includes("NIFTY") && !compact.includes("VIX")) return "NIFTY";
  return "";
}

export function exchangeSegmentFor(symbol: string) {
  const upper = String(symbol || "").toUpperCase();
  if (upper.includes("CRUDEOIL") || upper.includes("NATURALGAS") || upper.includes("COPPER")) return "MCX_COMM";
  if (upper.includes("SENSEX")) return "BSE_FNO";
  return "NSE_FNO";
}

export function isCrudeUnderlying(symbol?: string) {
  return String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .includes("CRUDEOIL");
}

export function isMcxUnderlying(symbol?: string) {
  const id = chainIdFromIndex(symbol || "") || String(symbol || "").toUpperCase().replace(/\s+/g, "");
  return id === "CRUDEOIL" || id === "NATURALGAS" || id === "COPPER";
}

export function lotForUnderlying(id?: string) {
  const chain = chainIdFromIndex(id || "") || String(id || "").toUpperCase().replace(/\s+/g, "");
  return OPTION_UNDERLYINGS.find((row) => row.id === chain)?.lot || 0;
}
