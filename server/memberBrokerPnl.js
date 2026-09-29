const CACHE_MS = 9000;
const cache = new Map();
const inflight = new Map();

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function finite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(row, keys) {
  for (const key of keys) {
    const n = finite(row?.[key]);
    if (n != null) return n;
  }
  return null;
}

export function positionRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.positions)) return raw.positions;
  if (
    raw &&
    typeof raw === "object" &&
    (raw.realizedProfit != null ||
      raw.unrealizedProfit != null ||
      raw.realised != null ||
      raw.unrealised != null)
  ) {
    return [raw];
  }
  return null;
}

function sumRows(rows, realizedKeys, unrealizedKeys, source) {
  if (!rows) return null;
  if (!rows.length) {
    return { realizedPnl: 0, unrealizedPnl: 0, source, empty: true };
  }
  let realized = 0;
  let unrealized = 0;
  let saw = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const realizedLeg = firstFinite(row, realizedKeys);
    const unrealizedLeg = firstFinite(row, unrealizedKeys);
    if (realizedLeg == null && unrealizedLeg == null) continue;
    saw = true;
    realized += realizedLeg || 0;
    unrealized += unrealizedLeg || 0;
  }
  if (!saw) return null;
  return {
    realizedPnl: round2(realized),
    unrealizedPnl: round2(unrealized),
    source,
    empty: false,
  };
}

export function brokerPnlFromDhanRows(raw) {
  return sumRows(
    positionRows(raw),
    ["realizedProfit", "realized_profit", "realised"],
    ["unrealizedProfit", "unrealized_profit", "unrealised"],
    "dhan",
  );
}

export function brokerPnlFromUpstoxRows(raw) {
  return sumRows(
    positionRows(raw),
    ["realised", "realized", "realizedProfit"],
    ["unrealised", "unrealized", "unrealizedProfit"],
    "upstox",
  );
}

export function dhanMasterBook(raw) {
  const pnl = brokerPnlFromDhanRows(raw);
  if (!pnl) return null;
  const rows = positionRows(raw) || [];
  const closed = [];
  const open = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const kind = String(row.positionType || row.position_type || "").toUpperCase();
    const net = Number(row.netQty);
    const closedLeg = kind === "CLOSED" || net === 0;
    const realized = firstFinite(row, ["realizedProfit", "realized_profit", "realised"]);
    const unrealized = firstFinite(row, ["unrealizedProfit", "unrealized_profit", "unrealised"]);
    if (realized == null && unrealized == null) continue;
    if (!closedLeg) {
      const qty = Math.abs(net);
      const type = kind === "SHORT" || net < 0 ? "SELL" : "BUY";
      const avg = Number(row.costPrice || (type === "BUY" ? row.buyAvg : row.sellAvg) || 0);
      const ltp = Number(row.lastTradedPrice || row.ltp || avg);
      open.push({
        id: `dhan-pos-${row.securityId || row.tradingSymbol || open.length}-${row.productType || "MIS"}`,
        symbol: String(row.tradingSymbol || row.securityId || ""),
        side: type,
        type,
        qty,
        avg,
        ltp,
        pnl: round2((realized || 0) + (unrealized || 0)),
        realized: round2(realized || 0),
        product: row.productType || "MIS",
        brokerId: "dhan",
        live: true,
        paper: false,
        closed: false,
      });
      continue;
    }
    if ((realized || 0) === 0 && (unrealized || 0) === 0) continue;
    const buyQty = Math.abs(Number(row.buyQty || row.dayBuyQty) || 0);
    const sellQty = Math.abs(Number(row.sellQty || row.daySellQty) || 0);
    const buyAvg = Number(row.buyAvg || row.dayBuyAvg || 0);
    const sellAvg = Number(row.sellAvg || row.daySellAvg || 0);
    const short = sellQty > buyQty;
    closed.push({
      id: `dhan-closed-${row.securityId || row.tradingSymbol || closed.length}-${row.productType || "MIS"}`,
      symbol: String(row.tradingSymbol || row.securityId || ""),
      side: short ? "SELL" : "BUY",
      type: short ? "SELL" : "BUY",
      qty: Math.max(buyQty, sellQty),
      entry: short ? sellAvg || buyAvg : buyAvg || sellAvg,
      exit: short ? buyAvg || sellAvg : sellAvg || buyAvg,
      pnl: round2((realized || 0) + (unrealized || 0)),
      realized: round2(realized || 0),
      product: row.productType || "MIS",
      brokerId: "dhan",
      live: true,
      paper: false,
      closed: true,
    });
  }
  return {
    realizedPnl: pnl.realizedPnl,
    unrealizedPnl: pnl.unrealizedPnl,
    mtm: round2(pnl.realizedPnl + pnl.unrealizedPnl),
    source: "dhan",
    closed,
    open,
  };
}

export function upstoxMasterBook(raw) {
  const pnl = brokerPnlFromUpstoxRows(raw);
  if (!pnl) return null;
  const rows = positionRows(raw) || [];
  const closed = [];
  const open = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const realized = firstFinite(row, ["realised", "realized", "realizedProfit"]);
    const unrealized = firstFinite(row, ["unrealised", "unrealized", "unrealizedProfit"]);
    if (realized == null && unrealized == null) continue;
    const qty = Math.abs(Number(row.quantity ?? row.net_quantity ?? 0));
    const side = Number(row.quantity) < 0 ? "SELL" : "BUY";
    const avg = Number(row.average_price || row.buy_price || 0);
    const ltp = Number(row.last_price || row.close_price || avg);
    const leg = {
      id: `upstox-${row.instrument_token || row.trading_symbol || row.tradingsymbol || open.length + closed.length}`,
      symbol: String(row.trading_symbol || row.tradingsymbol || row.instrument_token || ""),
      side,
      type: side,
      qty,
      avg,
      ltp,
      entry: avg,
      exit: ltp,
      pnl: round2((realized || 0) + (unrealized || 0)),
      realized: round2(realized || 0),
      product: row.product || "MIS",
      brokerId: "upstox",
      live: true,
      paper: false,
    };
    if (!qty) {
      if ((realized || 0) === 0 && (unrealized || 0) === 0) continue;
      closed.push({ ...leg, closed: true });
    } else {
      open.push({ ...leg, closed: false });
    }
  }
  return {
    realizedPnl: pnl.realizedPnl,
    unrealizedPnl: pnl.unrealizedPnl,
    mtm: round2(pnl.realizedPnl + pnl.unrealizedPnl),
    source: "upstox",
    closed,
    open,
  };
}

export function dhanPnlFromTrades(raw) {
  const rows = positionRows(raw);
  if (!rows) return null;
  const groups = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const qty = Math.abs(Number(row.tradedQuantity || row.filledQty || row.quantity || 0));
    const price = Number(row.tradedPrice || row.avgTradedPrice || row.price || 0);
    if (!qty || !Number.isFinite(price) || price <= 0) continue;
    const side = String(row.transactionType || row.transaction_type || row.side || "BUY").toUpperCase();
    const symbol = String(row.tradingSymbol || row.securityId || "");
    const key = `${row.securityId || symbol}|${row.productType || "MIS"}`;
    const group = groups.get(key) || { symbol, buyQty: 0, buyValue: 0, sellQty: 0, sellValue: 0, product: row.productType || "MIS" };
    if (side === "SELL") {
      group.sellQty += qty;
      group.sellValue += qty * price;
    } else {
      group.buyQty += qty;
      group.buyValue += qty * price;
    }
    groups.set(key, group);
  }
  const closed = [];
  let realized = 0;
  for (const [key, group] of groups) {
    const matched = Math.min(group.buyQty, group.sellQty);
    if (!matched) continue;
    const buyAvg = group.buyValue / group.buyQty;
    const sellAvg = group.sellValue / group.sellQty;
    const pnl = round2((sellAvg - buyAvg) * matched);
    realized += pnl;
    closed.push({
      id: `dhan-trade-${key}`,
      symbol: group.symbol,
      side: "BUY",
      type: "BUY",
      qty: matched,
      entry: round2(buyAvg),
      exit: round2(sellAvg),
      pnl,
      realized: pnl,
      product: group.product,
      brokerId: "dhan",
      live: true,
      paper: false,
      closed: true,
    });
  }
  if (!closed.length) return { realizedPnl: 0, closed: [] };
  return { realizedPnl: round2(realized), closed };
}

export function adminBookFromDhan(positionsRaw, tradesRaw) {
  const fromPositions = positionsRaw == null ? null : dhanMasterBook(positionsRaw);
  const fromTrades = tradesRaw == null ? null : dhanPnlFromTrades(tradesRaw);
  const positionHas = Boolean(
    fromPositions &&
      (fromPositions.closed.length || fromPositions.open.length || fromPositions.realizedPnl || fromPositions.unrealizedPnl),
  );
  if (positionHas) return fromPositions;
  if (fromTrades && (fromTrades.realizedPnl || fromTrades.closed.length)) {
    const unrealized = round2(fromPositions?.unrealizedPnl || 0);
    return {
      realizedPnl: fromTrades.realizedPnl,
      unrealizedPnl: unrealized,
      mtm: round2(fromTrades.realizedPnl + unrealized),
      source: "dhan",
      closed: fromTrades.closed,
      open: fromPositions?.open || [],
    };
  }
  return fromPositions;
}

export function withAdminBrokerPnl({ positions = [], closedTrades = [], byBroker = {}, unrealized = 0, realized = 0, broker } = {}) {
  const next = { ...byBroker };
  if (!broker || !Number.isFinite(Number(broker.mtm))) {
    return { totalPnl: round2(unrealized + realized), pnlByBroker: next };
  }
  const liveDhan = (row) => !row?.paper && row?.brokerId !== "paper" && (row?.brokerId === "dhan" || row?.live);
  const dhanLocal = [...positions, ...closedTrades].filter(liveDhan).reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const brokerMtm = Number(broker.mtm);
  next.dhan = round2((Number(next.dhan) || 0) - dhanLocal + brokerMtm);
  return { totalPnl: round2(unrealized + realized - dhanLocal + brokerMtm), pnlByBroker: next };
}

export function applyBrokerBookToReport(report, book) {
  if (!report || !book || !Number.isFinite(Number(book.realizedPnl)) || !Number.isFinite(Number(book.unrealizedPnl))) return report;
  const realized = round2(book.realizedPnl);
  const unrealized = round2(book.unrealizedPnl);
  const net = round2(realized + unrealized);
  return {
    ...report,
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    grossPnl: net,
    charges: 0,
    netPnl: net,
    brokerPnl: true,
    brokerPnlSource: book.source || "",
  };
}

export function applyBrokerPnl(desk, pnl) {
  if (!desk || !pnl) return desk;
  const realized = round2(pnl.realizedPnl);
  const unrealized = round2(pnl.unrealizedPnl);
  const gross = round2(realized + unrealized);
  const report = desk.report && typeof desk.report === "object" ? desk.report : {};
  desk.report = {
    ...report,
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    grossPnl: gross,
    charges: 0,
    netPnl: gross,
    brokerPnl: true,
    brokerPnlSource: pnl.source || "",
  };
  const balance = round2(desk.wallet?.balance || 0);
  desk.wallet = {
    ...(desk.wallet || {}),
    balance,
    mtm: unrealized,
    equity: round2(balance + unrealized),
  };
  return desk;
}

async function memberBrokerCredentials(userId) {
  const { brokerAccountForLiveCopy, peekClientSecrets } = await import("./memberDesk.js");
  const desk = peekClientSecrets(userId);
  const brokerId = String(desk.brokerId || "").trim().toLowerCase();
  if (brokerId !== "dhan" && brokerId !== "upstox") return null;
  const slot = brokerAccountForLiveCopy(userId, brokerId);
  if (slot.leftoverToken) return null;
  const token = String(slot.brokerToken || desk.brokerToken || "").trim();
  const clientId = String(slot.accountId || desk.accountId || "").trim();
  if (!token) return null;
  if (brokerId === "dhan" && !clientId) return null;
  return { brokerId, token, clientId };
}

async function upstoxPositions(token) {
  const { ipv4Request } = await import("./ipv4.js");
  const res = await ipv4Request("https://api.upstox.com/v2/portfolio/short-term-positions", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    timeoutMs: 8000,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json?.errors?.[0]?.message || json?.message || `Upstox positions ${res.status}`;
    throw new Error(message);
  }
  const status = String(json?.status || "").toLowerCase();
  if (status && status !== "success") {
    throw new Error(json?.errors?.[0]?.message || "Upstox positions failed");
  }
  return json;
}

async function fetchBrokerPnl(userId) {
  const creds = await memberBrokerCredentials(userId);
  if (!creds) return null;
  if (creds.brokerId === "dhan") {
    const { fetchMemberDhanPositions } = await import("./dhan.js");
    return dhanMasterBook(await fetchMemberDhanPositions(creds.token, creds.clientId));
  }
  return upstoxMasterBook(await upstoxPositions(creds.token));
}

export async function readMemberBrokerPnl(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const job = fetchBrokerPnl(key)
    .then((value) => {
      cache.set(key, { at: Date.now(), value: value || null });
      if (value) {
        console.log(`member broker pnl ${key} ${value.source} realized ${value.realizedPnl} mtm ${value.unrealizedPnl}`);
      }
      return value || null;
    })
    .catch((error) => {
      cache.set(key, { at: Date.now(), value: null });
      console.log(`member broker pnl kept local ${key}: ${error?.message || error}`);
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

export async function attachMemberBrokerPnl(desk, userId, load = readMemberBrokerPnl) {
  if (!desk || !userId) return desk;
  try {
    const pnl = await load(userId);
    if (pnl) applyBrokerPnl(desk, pnl);
  } catch (error) {
    console.log(`member broker pnl kept local ${userId}: ${error?.message || error}`);
  }
  return desk;
}
