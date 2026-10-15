export type BookRow = {
  paper?: boolean;
  brokerId?: string;
  sim?: boolean;
  live?: boolean;
  testDesk?: boolean;
};

export function isTestDeskTrade(row?: { testDesk?: boolean } | null) {
  return Boolean(row?.testDesk);
}

export function isPaperTrade(row?: BookRow | null) {
  if (!row) return false;
  return Boolean(row.paper) || String(row.brokerId || "").toLowerCase() === "paper";
}

export function isSimTrade(row?: BookRow | null) {
  return Boolean(row?.sim) && !isPaperTrade(row);
}

export function isLiveBrokerTrade(row?: BookRow | null) {
  return Boolean(row) && !isPaperTrade(row) && !isSimTrade(row);
}

export function memberIsPaperTrade(row?: BookRow | null, desk?: { tradeMode?: string; brokerId?: string } | null) {
  if (!row) return false;
  if (isPaperTrade(row)) return true;
  if (row.live) return false;
  return String(desk?.brokerId || "").toLowerCase() === "paper" || desk?.tradeMode === "paper";
}

export function hasPaperActivity(input: {
  orders?: BookRow[] | null;
  positions?: BookRow[] | null;
  closedTrades?: BookRow[] | null;
  algos?: Array<{ enabled?: boolean; runMode?: string; testDesk?: boolean }> | null;
  tradeMode?: string;
  brokerId?: string;
}) {
  if (String(input.tradeMode || "") === "paper" || String(input.brokerId || "").toLowerCase() === "paper") return true;
  if ((input.algos || []).some((algo) => algo.enabled && algo.runMode === "paper" && !algo.testDesk)) return true;
  return [...(input.orders || []), ...(input.positions || []), ...(input.closedTrades || [])]
    .filter((row) => !isTestDeskTrade(row))
    .some(isPaperTrade);
}
