import { isSimTrade } from "./paperBook";

export type DailyPnlRow = { date: string; pnl: number; trades?: number; unrealized?: number };

export function istDayKey(value: string | Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value instanceof Date ? value : new Date(value));
  } catch {
    return String(value).slice(0, 10);
  }
}

export function lastTradingDayKeys(now: Date = new Date(), count = 5) {
  const keys: string[] = [];
  const cursor = new Date(now.getTime());
  let guard = 0;
  while (keys.length < Math.max(1, Number(count) || 5) && guard < 21) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(cursor);
    if (weekday !== "Sat" && weekday !== "Sun") keys.push(istDayKey(cursor));
    cursor.setTime(cursor.getTime() - 24 * 60 * 60 * 1000);
    guard += 1;
  }
  return keys.reverse();
}

function isSeedSimDay(key: string) {
  return /^2026-08-1[2-8]$/.test(key);
}

export function liveDailyPnl(
  daily?: DailyPnlRow[] | null,
  closed?: Array<{ closedAt?: string; pnl?: number; sim?: boolean; live?: boolean; paper?: boolean; brokerId?: string }> | null,
  now: Date = new Date(),
): DailyPnlRow[] {
  const keys = lastTradingDayKeys(now, 5);
  const today = istDayKey(now);
  const map: Record<string, DailyPnlRow> = {};
  for (const key of keys) map[key] = { date: key, pnl: 0, trades: 0 };

  const incoming = (daily || []).filter((row) => map[row.date] && row.date <= today && !isSeedSimDay(row.date));
  if (incoming.length) {
    for (const row of incoming) {
      map[row.date] = {
        date: row.date,
        pnl: Number(row.pnl) || 0,
        trades: Number(row.trades) || 0,
        unrealized: row.unrealized,
      };
    }
    return keys.map((key) => map[key]);
  }

  for (const row of closed || []) {
    if (isSimTrade(row) || !row.closedAt) continue;
    const key = istDayKey(row.closedAt);
    if (!map[key] || key > today || isSeedSimDay(key)) continue;
    map[key].pnl = Number(((map[key].pnl || 0) + Number(row.pnl || 0)).toFixed(2));
    map[key].trades = Number(map[key].trades || 0) + 1;
  }
  return keys.map((key) => map[key]);
}
