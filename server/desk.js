function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function istIso(day, hour, minute, second = 0) {
  const utcMs = Date.UTC(2026, 7, day, hour, minute, second) - 5.5 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export function seedOrders() {
  return [
    {
      id: "o1",
      symbol: "NIFTY 24500 CE",
      side: "BUY",
      qty: 65,
      filledQty: 65,
      price: 128.4,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: "VWAP Depth",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 16, 41),
    },
    {
      id: "o2",
      symbol: "BANKNIFTY 52100 PE",
      side: "SELL",
      qty: 30,
      filledQty: 30,
      price: 186.2,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: "Mean Revert",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 21, 2),
    },
    {
      id: "o3",
      symbol: "NIFTY 24600 CE",
      side: "BUY",
      qty: 50,
      filledQty: 50,
      price: 74.1,
      product: "MIS",
      type: "LIMIT",
      status: "FILLED",
      strategy: "ORB Breakout",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 12, 8),
    },
    {
      id: "o4",
      symbol: "FINNIFTY 24900 CE",
      side: "BUY",
      qty: 60,
      filledQty: 60,
      price: 96.8,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: "Momentum Rider",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 16, 41),
    },
    {
      id: "o5",
      symbol: "SENSEX 80600 CE",
      side: "BUY",
      qty: 20,
      filledQty: 20,
      price: 142.0,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: "VWAP Depth",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 28, 14),
    },
    {
      id: "o6",
      symbol: "NIFTY 24400 PE",
      side: "SELL",
      qty: 50,
      filledQty: 50,
      price: 52.6,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: "Mean Revert",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 8, 55),
    },
    {
      id: "o7",
      symbol: "NIFTY 24700 CE",
      side: "BUY",
      qty: 65,
      filledQty: 0,
      price: 38.5,
      product: "MIS",
      type: "LIMIT",
      status: "PENDING",
      strategy: "VWAP Depth",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 10, 42, 18),
    },
    {
      id: "o8",
      symbol: "BANKNIFTY 52300 CE",
      side: "BUY",
      qty: 30,
      filledQty: 0,
      price: 94.2,
      product: "MIS",
      type: "MARKET",
      status: "REJECTED",
      strategy: "Momentum Rider",
      brokerId: "dhan",
      brokerName: "Dhan",
      reason: "Insufficient margin",
      createdAt: istIso(18, 10, 18, 6),
    },
    {
      id: "o9",
      symbol: "NIFTY 24300 PE",
      side: "SELL",
      qty: 65,
      filledQty: 0,
      price: 41.0,
      product: "MIS",
      type: "LIMIT",
      status: "CANCELLED",
      strategy: "ORB Breakout",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 9, 44, 22),
    },
    {
      id: "o10",
      symbol: "FINNIFTY 24800 PE",
      side: "SELL",
      qty: 60,
      filledQty: 20,
      price: 72.4,
      product: "MIS",
      type: "LIMIT",
      status: "PARTIAL",
      strategy: "Momentum Rider",
      brokerId: "dhan",
      brokerName: "Dhan",
      createdAt: istIso(18, 11, 5, 11),
    },
  ];
}

export function seedClosedTrades() {
  return [
    {
      id: "t1",
      symbol: "NIFTY 24450 CE",
      side: "BUY",
      qty: 65,
      entry: 118.2,
      exit: 141.6,
      pnl: 1521.0,
      product: "MIS",
      strategy: "VWAP Depth",
      brokerId: "dhan",
      closedAt: istIso(18, 10, 5, 12),
    },
    {
      id: "t2",
      symbol: "BANKNIFTY 52000 PE",
      side: "SELL",
      qty: 30,
      entry: 210.4,
      exit: 198.1,
      pnl: 369.0,
      product: "MIS",
      strategy: "Mean Revert",
      brokerId: "dhan",
      closedAt: istIso(18, 10, 22, 40),
    },
    {
      id: "t3",
      symbol: "NIFTY 24700 CE",
      side: "BUY",
      qty: 65,
      entry: 62.4,
      exit: 48.1,
      pnl: -929.5,
      product: "MIS",
      strategy: "ORB Breakout",
      brokerId: "dhan",
      closedAt: istIso(17, 14, 58, 3),
    },
    {
      id: "t4",
      symbol: "FINNIFTY 24850 CE",
      side: "BUY",
      qty: 60,
      entry: 88.0,
      exit: 104.5,
      pnl: 990.0,
      product: "MIS",
      strategy: "Momentum Rider",
      brokerId: "dhan",
      closedAt: istIso(17, 13, 12, 9),
    },
    {
      id: "t5",
      symbol: "SENSEX 80500 CE",
      side: "BUY",
      qty: 20,
      entry: 156.0,
      exit: 132.4,
      pnl: -472.0,
      product: "MIS",
      strategy: "VWAP Depth",
      brokerId: "dhan",
      closedAt: istIso(16, 15, 4, 51),
    },
  ];
}

export function enrichPositions(rows) {
  const meta = {
    p1: { product: "MIS", strategy: "VWAP Depth", openedAt: istIso(18, 9, 16, 41) },
    p2: { product: "MIS", strategy: "Mean Revert", openedAt: istIso(18, 9, 21, 2) },
    p3: { product: "MIS", strategy: "ORB Breakout", openedAt: istIso(18, 9, 12, 8) },
    p4: { product: "MIS", strategy: "Momentum Rider", openedAt: istIso(18, 9, 16, 41) },
    p5: { product: "MIS", strategy: "VWAP Depth", openedAt: istIso(18, 9, 28, 14) },
    p6: { product: "MIS", strategy: "Mean Revert", openedAt: istIso(18, 9, 8, 55) },
  };
  return rows.map((row) => ({
    product: "MIS",
    strategy: "",
    openedAt: row.openedAt || new Date().toISOString(),
    ...row,
    ...(meta[row.id] || {}),
  }));
}

function dayKey(iso) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function pushGroup(map, key, patch) {
  if (!map[key]) map[key] = { ...patch, trades: 0, wins: 0, pnl: 0 };
  const row = map[key];
  row.trades += 1;
  row.pnl = round2(row.pnl + (patch.pnl || 0));
  if ((patch.pnl || 0) > 0) row.wins += 1;
  return row;
}

export function buildReport(state) {
  const closed = Array.isArray(state.closedTrades) ? state.closedTrades : [];
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const positions = Array.isArray(state.positions) ? state.positions : [];
  const filled = orders.filter((row) => row.status === "FILLED" || row.status === "PARTIAL");
  const realized = round2(closed.reduce((sum, row) => sum + Number(row.pnl || 0), 0));
  const unrealized = round2(positions.reduce((sum, row) => sum + Number(row.pnl || 0), 0));
  const turnover = filled.reduce((sum, row) => sum + Number(row.price || 0) * Number(row.filledQty || row.qty || 0), 0);
  const brokerage = round2(filled.length * 20);
  const charges = round2(turnover * 0.00053 + brokerage);
  const wins = closed.filter((row) => Number(row.pnl) > 0).length;
  const losses = closed.filter((row) => Number(row.pnl) < 0).length;
  const byBroker = {};
  const byStrategy = {};
  const bySymbol = {};
  for (const row of closed) {
    pushGroup(byBroker, row.brokerId || "dhan", { id: row.brokerId || "dhan", pnl: row.pnl });
    pushGroup(byStrategy, row.strategy || "Manual", { name: row.strategy || "Manual", pnl: row.pnl });
    pushGroup(bySymbol, row.symbol, { symbol: row.symbol, pnl: row.pnl });
  }
  for (const row of positions) {
    const key = row.brokerId || "dhan";
    if (!byBroker[key]) byBroker[key] = { id: key, trades: 0, wins: 0, pnl: 0 };
    byBroker[key].unrealized = round2((byBroker[key].unrealized || 0) + Number(row.pnl || 0));
  }
  const dailyMap = {};
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(2026, 7, 18) - i * 86400000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
    dailyMap[key] = { date: key, pnl: 0, trades: 0 };
  }
  for (const row of closed) {
    const key = dayKey(row.closedAt);
    if (!dailyMap[key]) dailyMap[key] = { date: key, pnl: 0, trades: 0 };
    dailyMap[key].pnl = round2(dailyMap[key].pnl + Number(row.pnl || 0));
    dailyMap[key].trades += 1;
  }
  const todayKey = dayKey(new Date().toISOString());
  if (dailyMap[todayKey]) dailyMap[todayKey].unrealized = unrealized;

  return {
    date: dayKey(new Date().toISOString()),
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    grossPnl: round2(realized + unrealized),
    charges,
    netPnl: round2(realized + unrealized - charges),
    openPositions: positions.length,
    ordersToday: orders.length,
    filledToday: filled.length,
    pendingToday: orders.filter((row) => row.status === "PENDING" || row.status === "PARTIAL").length,
    trades: closed.length,
    wins,
    losses,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0,
    turnover: round2(turnover),
    byBroker: Object.values(byBroker).map((row) => ({
      ...row,
      unrealized: round2(row.unrealized || 0),
      winRate: row.trades ? Math.round((row.wins / row.trades) * 100) : 0,
    })),
    byStrategy: Object.values(byStrategy)
      .map((row) => ({ ...row, winRate: row.trades ? Math.round((row.wins / row.trades) * 100) : 0 }))
      .sort((a, b) => b.pnl - a.pnl),
    bySymbol: Object.values(bySymbol)
      .map((row) => ({ ...row, winRate: row.trades ? Math.round((row.wins / row.trades) * 100) : 0 }))
      .sort((a, b) => b.pnl - a.pnl),
    daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    tradeBook: closed
      .slice()
      .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
      .map((row) => ({ ...row, status: "CLOSED" })),
  };
}
