const NAMES: Record<string, string> = {
  dhan: "DHAN",
  upstox: "UPSTOX",
  zerodha: "ZERODHA",
  fyers: "FYERS",
  kotak: "KOTAK",
  angelone: "ANGEL",
  paper: "PAPER",
};

export function brokerChipName(brokerId?: string, brokerName?: string) {
  const id = String(brokerId || "").trim().toLowerCase();
  const named = String(brokerName || "").trim();
  if (named) return named.replace(/\s+kite$/i, "").toUpperCase();
  return NAMES[id] || (id ? id.toUpperCase() : "");
}

export function headerBrokerLabel({
  brokerId,
  brokerName,
  live,
  hasQuotes,
}: {
  brokerId?: string;
  brokerName?: string;
  live?: boolean;
  hasQuotes?: boolean;
} = {}) {
  const id = String(brokerId || "").trim().toLowerCase();
  const label = brokerChipName(id, brokerName);
  if (!label) return "";
  if (id === "paper") return "PAPER";
  if (live) return `${label} LIVE`;
  if (hasQuotes) return label;
  return `${label} · wait`;
}
