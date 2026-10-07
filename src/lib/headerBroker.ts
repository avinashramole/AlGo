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

export function adminLiveTape(
  data: {
    dhanFeed?: { source?: string; live?: boolean; hasQuotes?: boolean; lastTickAt?: number | null };
    optionMeta?: { source?: string };
  } = {},
) {
  const feed = data?.dhanFeed;
  const source = String(feed?.source || "");
  const tickAt = Number(feed?.lastTickAt);
  const lastTickAt = tickAt > 0 ? tickAt : null;
  const dhanLive = Boolean(feed?.live) && source !== "kotak";
  const quotes = Boolean(feed?.live || feed?.hasQuotes || feed?.lastTickAt || data?.optionMeta?.source === "dhan");
  if (dhanLive || (quotes && source !== "kotak")) {
    return {
      brokerId: "dhan",
      brokerName: "DHAN",
      live: dhanLive,
      hasQuotes: quotes,
      lastTickAt,
    };
  }
  if (source === "kotak" && Boolean(feed?.live || feed?.hasQuotes || feed?.lastTickAt)) {
    return {
      brokerId: "kotak",
      brokerName: "KOTAK",
      live: Boolean(feed?.live),
      hasQuotes: true,
      lastTickAt,
    };
  }
  return {
    brokerId: "dhan",
    brokerName: "DHAN",
    live: false,
    hasQuotes: quotes,
    lastTickAt,
  };
}
