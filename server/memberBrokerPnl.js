import { buildDailyPnl } from "./desk.js";
import { optionContractKey, overlayMemberCopyMeta } from "./memberDesk.js";
import { collapseDhanPositionRows, dhanPositionBookId, dhanPositionProduct, dhanPositionQuantity } from "./optionChain.js";
import { isOptionContract, isSaneOptionLtp } from "./positionMark.js";

const CACHE_MS = 2000;
const cache = new Map();
const inflight = new Map();
const balanceCache = new Map();
const balanceInflight = new Map();

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

export function brokerProduct(value) {
  return dhanPositionProduct(value);
}

function qtyOf(row, keys) {
  return Math.abs(firstFinite(row, keys) || 0);
}

function dhanSymbol(row = {}) {
  return String(row.tradingSymbol || row.trading_symbol || row.symbol || row.securityId || row.security_id || "");
}

function closedBookKey(row = {}) {
  return `${String(row.symbol || "").toUpperCase()}|${brokerProduct(row.product)}`;
}

function withClosedSides(row = {}) {
  const qty = Math.abs(Number(row.qty) || 0);
  const buyQty = Math.abs(Number(row.buyQty) || 0) || qty;
  const sellQty = Math.abs(Number(row.sellQty) || 0) || qty;
  const entry = Number(row.entry || row.buyPrice || row.buyAvg || row.avg || 0);
  const exit = Number(row.exit || row.sellPrice || row.sellAvg || row.ltp || 0);
  return {
    ...row,
    qty: qty || Math.max(buyQty, sellQty),
    buyQty,
    sellQty,
    buyPrice: Number(row.buyPrice || row.buyAvg || entry || 0),
    sellPrice: Number(row.sellPrice || row.sellAvg || exit || 0),
    entry: entry || Number(row.buyPrice || 0),
    exit: exit || Number(row.sellPrice || 0),
    product: brokerProduct(row.product),
  };
}

function mergeClosedFromTrades(positionClosed = [], tradeClosed = []) {
  const trades = new Map((tradeClosed || []).map((row) => [closedBookKey(row), row]));
  const used = new Set();
  const closed = (positionClosed || []).map((row) => {
    const next = withClosedSides(row);
    if (next.qty && next.entry && next.exit && next.buyQty && next.sellQty) return next;
    const hit = trades.get(closedBookKey(next)) || trades.get(`${String(next.symbol || "").toUpperCase()}|${brokerProduct(next.product || "MIS")}`);
    if (!hit) return next;
    used.add(closedBookKey(hit));
    return withClosedSides({
      ...next,
      qty: next.qty || hit.qty,
      entry: next.entry || hit.entry,
      exit: next.exit || hit.exit,
      buyQty: next.buyQty || hit.qty,
      sellQty: next.sellQty || hit.qty,
      buyPrice: next.buyPrice || hit.entry,
      sellPrice: next.sellPrice || hit.exit,
      buyAvg: next.buyAvg || hit.entry,
      sellAvg: next.sellAvg || hit.exit,
    });
  });
  for (const row of tradeClosed || []) {
    const key = closedBookKey(row);
    if (used.has(key) || closed.some((item) => closedBookKey(item) === key)) continue;
    closed.push(withClosedSides(row));
  }
  return closed;
}

export function dhanMasterBook(raw) {
  const pnl = brokerPnlFromDhanRows(raw);
  if (!pnl) return null;
  const rows = positionRows(raw) || [];
  const closed = [];
  const openRaw = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const kind = String(row.positionType || row.position_type || "").toUpperCase();
    const net = firstFinite(row, ["netQty", "net_qty"]);
    const closedLeg = kind === "CLOSED" || net === 0;
    const realized = firstFinite(row, ["realizedProfit", "realized_profit", "realised"]);
    const unrealized = firstFinite(row, ["unrealizedProfit", "unrealized_profit", "unrealised"]);
    if (realized == null && unrealized == null) continue;
    const product = brokerProduct(row.productType || row.product_type || row.product);
    const symbol = dhanSymbol(row);
    const ltp = firstFinite(row, ["lastTradedPrice", "last_traded_price", "ltp", "close"]) || 0;
    const buyQty = qtyOf(row, ["buyQty", "buy_qty", "dayBuyQty", "day_buy_qty", "dayBuyQuantity", "buyQuantity"]);
    const sellQty = qtyOf(row, ["sellQty", "sell_qty", "daySellQty", "day_sell_qty", "daySellQuantity", "sellQuantity"]);
    const buyAvg = firstFinite(row, ["buyAvg", "buy_avg", "dayBuyAvg", "day_buy_avg", "buyAvgPrice", "buyPrice", "costPrice", "cost_price"]) || 0;
    const sellAvg = firstFinite(row, ["sellAvg", "sell_avg", "daySellAvg", "day_sell_avg", "sellAvgPrice", "sellPrice"]) || 0;
    if (!closedLeg) {
      openRaw.push(row);
      continue;
    }
    if ((realized || 0) === 0 && (unrealized || 0) === 0) continue;
    const short = sellQty > buyQty;
    const qty = Math.max(buyQty, sellQty);
    const entry = short ? sellAvg || buyAvg : buyAvg || sellAvg;
    const exit = short ? buyAvg || sellAvg : sellAvg || buyAvg || ltp;
    closed.push({
      id: `dhan-closed-${row.securityId || row.security_id || symbol || closed.length}-${product}`,
      symbol,
      side: short ? "SELL" : "BUY",
      type: short ? "SELL" : "BUY",
      qty,
      entry,
      exit,
      ltp: ltp || exit,
      buyQty,
      sellQty,
      buyPrice: buyAvg,
      sellPrice: sellAvg,
      buyAvg,
      sellAvg,
      pnl: round2((realized || 0) + (unrealized || 0)),
      realized: round2(realized || 0),
      product,
      brokerId: "dhan",
      live: true,
      paper: false,
      closed: true,
    });
  }
  const open = collapseDhanPositionRows(openRaw).map((row) => {
    const symbol = dhanSymbol(row);
    const type = row.positionType === "SHORT" || Number(row.netQty) < 0 ? "SELL" : "BUY";
    const realized = firstFinite(row, ["realizedProfit", "realized_profit", "realised"]) || 0;
    const unrealized = firstFinite(row, ["unrealizedProfit", "unrealized_profit", "unrealised"]) || 0;
    const buyAvg = firstFinite(row, ["buyAvg", "buy_avg", "dayBuyAvg", "day_buy_avg", "buyAvgPrice", "buyPrice", "costPrice", "cost_price"]) || 0;
    const sellAvg = firstFinite(row, ["sellAvg", "sell_avg", "daySellAvg", "day_sell_avg", "sellAvgPrice", "sellPrice"]) || 0;
    const avg = Number(row.costPrice || row.cost_price || (type === "BUY" ? buyAvg : sellAvg) || 0);
    const ltp = firstFinite(row, ["lastTradedPrice", "last_traded_price", "ltp", "close"]) || avg;
    const qty = dhanPositionQuantity({ ...row, tradingSymbol: symbol }) || Math.max(
      qtyOf(row, ["buyQty", "buy_qty", "dayBuyQty", "day_buy_qty", "dayBuyQuantity", "buyQuantity"]),
      qtyOf(row, ["sellQty", "sell_qty", "daySellQty", "day_sell_qty", "daySellQuantity", "sellQuantity"]),
    );
    const product = brokerProduct(row.productType || row.product_type || row.product);
    return {
      id: dhanPositionBookId({ ...row, tradingSymbol: symbol }),
      symbol,
      side: type,
      type,
      qty,
      avg,
      ltp: ltp || avg,
      buyQty: type === "BUY" ? qty : 0,
      buyPrice: type === "BUY" ? avg : 0,
      sellQty: type === "SELL" ? qty : 0,
      sellPrice: type === "SELL" ? avg : 0,
      pnl: round2(realized + unrealized),
      realized: round2(realized),
      product,
      securityId: String(row.securityId || row.security_id || ""),
      brokerId: "dhan",
      live: true,
      paper: false,
      closed: false,
    };
  });
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
    const qty = Math.abs(Number(row.tradedQuantity || row.traded_quantity || row.filledQty || row.quantity || 0));
    const price = Number(row.tradedPrice || row.traded_price || row.avgTradedPrice || row.price || 0);
    if (!qty || !Number.isFinite(price) || price <= 0) continue;
    const side = String(row.transactionType || row.transaction_type || row.side || "BUY").toUpperCase();
    const symbol = dhanSymbol(row);
    const key = `${row.securityId || symbol}|${brokerProduct(row.productType || row.product_type || row.product)}`;
    const group = groups.get(key) || { symbol, buyQty: 0, buyValue: 0, sellQty: 0, sellValue: 0, product: brokerProduct(row.productType || row.product_type || row.product) };
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
      buyQty: matched,
      sellQty: matched,
      buyPrice: round2(buyAvg),
      sellPrice: round2(sellAvg),
      pnl,
      realized: pnl,
      product: brokerProduct(group.product),
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
  if (positionHas && fromTrades?.closed?.length) {
    return {
      ...fromPositions,
      closed: mergeClosedFromTrades(fromPositions.closed, fromTrades.closed),
      open: fromPositions.open || [],
    };
  }
  if (positionHas) return fromPositions;
  if (fromTrades && (fromTrades.realizedPnl || fromTrades.closed.length)) {
    const unrealized = round2(fromPositions?.unrealizedPnl || 0);
    return {
      realizedPnl: fromTrades.realizedPnl,
      unrealizedPnl: unrealized,
      mtm: round2(fromTrades.realizedPnl + unrealized),
      source: "dhan",
      closed: (fromTrades.closed || []).map(withClosedSides),
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
  const closed = Array.isArray(book.closed) ? book.closed : [];
  const paperBook = (Array.isArray(report.tradeBook) ? report.tradeBook : []).filter((row) => row?.paper || row?.brokerId === "paper");
  const brokerBook = closed.map((row) => {
    const filled = withClosedSides(row);
    return {
      id: String(filled.id || ""),
      symbol: String(filled.symbol || ""),
      side: String(filled.side || filled.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
      qty: Number(filled.qty) || 0,
      entry: Number(filled.entry || filled.buyPrice || filled.avg || 0),
      exit: Number(filled.exit || filled.sellPrice || filled.ltp || 0),
      buyQty: Number(filled.buyQty) || 0,
      buyPrice: Number(filled.buyPrice) || 0,
      sellQty: Number(filled.sellQty) || 0,
      sellPrice: Number(filled.sellPrice) || 0,
      product: brokerProduct(filled.product),
      pnl: Number(filled.realized != null ? filled.realized : filled.pnl || 0),
      strategy: String(filled.strategy || ""),
      role: String(filled.role || ""),
      exitReason: String(filled.exitReason || ""),
      reason: String(filled.reason || filled.exitReason || ""),
      brokerId: String(filled.brokerId || "dhan"),
      closedAt: filled.closedAt || filled.updatedAt || new Date().toISOString(),
      status: "CLOSED",
    };
  });
  const tradeBook = brokerBook.length ? [...paperBook, ...brokerBook] : report.tradeBook;
  return {
    ...report,
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    grossPnl: net,
    charges: 0,
    netPnl: net,
    brokerPnl: true,
    brokerPnlSource: book.source || "",
    trades: brokerBook.length ? brokerBook.length + paperBook.length : report.trades,
    tradeBook,
    daily: buildDailyPnl(tradeBook),
  };
}

export function liveUnrealizedFromPositions(positions = []) {
  return round2((positions || []).reduce((sum, row) => sum + Number(row.pnl || 0), 0));
}

function usableLiveMark(row) {
  if (isOptionContract(row?.symbol, row?.option)) {
    const ltp = Number(row?.ltp || 0);
    const avg = Number(row?.avg || 0);
    if (!isSaneOptionLtp(ltp, avg)) return false;
    return Math.abs(ltp - avg) > 0.04;
  }
  return Number.isFinite(Number(row?.pnl));
}

export function overlayLiveUnrealized(report, positions = [], wallet) {
  const open = (positions || []).filter((row) => Number(row.qty) > 0);
  if (!report || !open.length) return report;
  if (open.some((row) => isOptionContract(row.symbol, row.option) && !isSaneOptionLtp(Number(row.ltp || 0), Number(row.avg || 0)))) {
    return report;
  }
  if (report.brokerPnl && open.some((row) => isOptionContract(row.symbol, row.option) && !usableLiveMark(row))) {
    return report;
  }
  const unrealized = liveUnrealizedFromPositions(open);
  const realized = round2(report.realizedPnl);
  const charges = report.brokerPnl ? 0 : round2(report.charges || 0);
  const gross = round2(realized + unrealized);
  const next = {
    ...report,
    unrealizedPnl: unrealized,
    grossPnl: gross,
    netPnl: round2(gross - charges),
    liveMtm: true,
  };
  if (wallet && typeof wallet === "object") {
    const balance = round2(wallet.balance || 0);
    wallet.mtm = unrealized;
    wallet.equity = round2(balance + unrealized);
  }
  return next;
}

export function overlayDeskLiveMtm(desk) {
  if (!desk) return desk;
  const report = overlayLiveUnrealized(desk.report, desk.positions, desk.wallet);
  if (report) desk.report = report;
  return desk;
}

function copyLocals(desk) {
  return [
    ...(desk?.positions || []),
    ...(desk?.closedTrades || []),
    ...(desk?.orders || []),
    ...(desk?.orderHistory || []),
    ...(desk?.report?.tradeBook || []),
  ].filter((row) => row && (row.strategy || row.role || row.exitReason || row.reason));
}

function matchCopyLocal(locals, row) {
  const want = optionContractKey(row?.symbol);
  return (locals || []).find((item) => optionContractKey(item.symbol) === want);
}

export function applyBrokerPnl(desk, pnl) {
  if (!desk || !pnl) return desk;
  const realized = round2(pnl.realizedPnl);
  const unrealized = round2(pnl.unrealizedPnl);
  if (!Number.isFinite(realized) || !Number.isFinite(unrealized)) return desk;
  const locals = copyLocals(desk);
  const report = desk.report && typeof desk.report === "object" ? desk.report : {};
  if (Array.isArray(pnl.closed)) {
    pnl = {
      ...pnl,
      closed: pnl.closed.map((row) => overlayMemberCopyMeta(row, matchCopyLocal(locals, row))),
    };
  }
  desk.report = applyBrokerBookToReport(report, pnl);
  if (Array.isArray(desk.report?.tradeBook)) {
    desk.report.tradeBook = desk.report.tradeBook.map((row) => overlayMemberCopyMeta(row, matchCopyLocal(locals, row)));
  }
  if (Array.isArray(pnl.open)) {
    const paper = (desk.positions || []).filter((row) => row?.paper || row?.brokerId === "paper");
    desk.positions = [
      ...paper,
      ...pnl.open.map((row) => {
        const local = matchCopyLocal(locals, row);
        const next = overlayMemberCopyMeta(row, local);
        return {
          id: String(next.id || row.id || ""),
          symbol: String(next.symbol || row.symbol || ""),
          type: String(next.type || next.side || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
          qty: Number(next.qty || row.qty) || 0,
          avg: Number(next.avg || next.entry || row.avg || row.entry || row.buyPrice || 0),
          ltp: Number(next.ltp || row.ltp || row.avg || 0),
          pnl: Number(next.pnl || row.unrealized || 0),
          product: next.product || row.product || "MIS",
          strategy: next.strategy || "",
          role: next.role || "",
          exitReason: next.exitReason || "",
          reason: next.reason || "",
          brokerId: next.brokerId || row.brokerId || desk.brokerId,
          live: true,
          paper: false,
        };
      }),
    ];
  }
  desk.orders = (desk.orders || []).filter(
    (row) => row?.paper || row?.brokerId === "paper" || (row?.live && !/^mo/i.test(String(row.id || ""))),
  );
  const balance = round2(desk.wallet?.balance || 0);
  desk.wallet = {
    ...(desk.wallet || {}),
    balance,
    mtm: unrealized,
    equity: round2(balance + unrealized),
  };
  return desk;
}

export function kotakTradeSession(creds = {}) {
  const sid = String(creds.sessionToken || "").trim();
  const auth = String(creds.token || creds.accessToken || "").trim();
  const key = String(creds.apiKey || "").trim();
  const clientId = String(creds.clientId || "").trim();
  if (!sid || !auth || !key) return null;
  if (sid === clientId || sid === key || sid === auth || auth === key) return null;
  return { brokerId: "kotak", token: auth, clientId, apiKey: key, sessionToken: sid };
}

export function kotakNeedsTradeLogin(creds = {}) {
  if (!creds || creds.brokerId !== "kotak") return false;
  if (kotakTradeSession(creds)) return false;
  const mobile = String(creds.mobile || "").trim();
  const mpin = String(creds.mpin || "").trim();
  const totpSecret = String(creds.totpSecret || "").trim();
  const clientId = String(creds.clientId || "").trim();
  const token = String(creds.token || creds.accessToken || "").trim();
  const apiKey = String(creds.apiKey || "").trim();
  return Boolean(mobile && mpin && totpSecret && clientId && (token || apiKey));
}

export function applyKotakTradeSession(creds, trade) {
  const token = String(trade?.tradeToken || "").trim();
  const sid = String(trade?.tradeSid || "").trim();
  if (!token || !sid) return creds;
  return { ...creds, token, sessionToken: sid };
}

async function memberBrokerCredentials(userId) {
  const { brokerAccountForLiveCopy, peekClientSecrets } = await import("./memberDesk.js");
  const desk = peekClientSecrets(userId);
  const brokerId = String(desk.brokerId || "").trim().toLowerCase();
  if (brokerId !== "dhan" && brokerId !== "upstox" && brokerId !== "kotak") return null;
  const slot = brokerAccountForLiveCopy(userId, brokerId);
  if (slot.leftoverToken) return null;
  const token = String(slot.brokerToken || desk.brokerToken || "").trim();
  const clientId = String(slot.accountId || desk.accountId || "").trim();
  if (brokerId === "kotak") {
    const apiKey = String(slot.brokerApiKey || desk.brokerApiKey || "").trim();
    const sessionToken = String(slot.brokerSessionToken || desk.brokerSessionToken || "").trim();
    const { getPublicUser } = await import("./auth.js");
    const { firstKotakMobile } = await import("./liveBrokers.js");
    const login = {
      mobile: firstKotakMobile(slot.brokerMobile, desk.brokerMobile, getPublicUser(userId)?.mobile),
      mpin: String(slot.brokerMpin || desk.brokerMpin || "").trim(),
      totpSecret: String(slot.brokerTotpSecret || desk.brokerTotpSecret || "").trim(),
    };
    const session = kotakTradeSession({ token, apiKey, sessionToken, clientId });
    if (session) return { ...session, ...login };
    if ((!token || token === apiKey) && !apiKey && !login.mobile) return null;
    if (!token && !apiKey && !login.mobile) return null;
    return { brokerId: "kotak", token, clientId, apiKey, sessionToken, ...login };
  }
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

const KOTAK_TRADE_HOSTS = [
  "https://mis.kotaksecurities.com",
  "https://e21.kotaksecurities.com",
  "https://e22.kotaksecurities.com",
  "https://e41.kotaksecurities.com",
  "https://e43.kotaksecurities.com",
];

function distinctKotakValue(value, ...blocked) {
  const text = String(value || "").trim();
  if (!text) return "";
  return blocked.some((item) => text === String(item || "").trim()) ? "" : text;
}

export function kotakLimitHeaderSets(creds = {}) {
  const token = String(creds.token || creds.accessToken || "").trim();
  const sid = String(creds.sessionToken || "").trim();
  const key = String(creds.apiKey || "").trim();
  const clientId = String(creds.clientId || "").trim();
  const tradeAuth = distinctKotakValue(token, key);
  const tradeSid = distinctKotakValue(sid, clientId, key, token);
  const sets = [];
  const add = (headers) => {
    const auth = String(headers.Auth || "");
    const session = String(headers.Sid || "");
    const authorization = String(headers.Authorization || "");
    const id = `${auth}|${session}|${authorization}`;
    if (sets.some((row) => row.id === id)) return;
    sets.push({
      id,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "neo-fin-key": "neotradeapi",
        ...headers,
      },
    });
  };
  if (tradeAuth && tradeSid) {
    add({ Auth: tradeAuth, Sid: tradeSid });
    add({ Auth: tradeSid, Sid: tradeAuth });
  }
  if (tradeAuth) add({ Authorization: tradeAuth });
  if (distinctKotakValue(key, token)) add({ Authorization: key });
  return sets;
}

async function kotakTradePost(creds, path, jData, headers = null, hosts = KOTAK_TRADE_HOSTS) {
  const body = new URLSearchParams({ jData: JSON.stringify(jData || {}) }).toString();
  const requestHeaders = headers || {
    Auth: creds.token,
    Sid: creds.sessionToken,
    "neo-fin-key": "neotradeapi",
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  let last = null;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}${path}`, {
        method: "POST",
        headers: requestHeaders,
        body,
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        last = new Error(json?.errMsg || json?.message || `Kotak ${res.status}`);
        if (res.status === 401 || res.status === 403) throw last;
        continue;
      }
      const stat = String(json?.stat || "").toLowerCase();
      if (stat === "not_ok" || stat === "not ok" || stat === "error") {
        last = new Error(json?.errMsg || json?.emsg || "Kotak refused this request.");
        continue;
      }
      return json;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("Kotak trade request failed.");
}

async function withKotakTradeLogin(creds) {
  if (!kotakNeedsTradeLogin(creds)) return creds;
  try {
    const { openKotakTradeSession } = await import("./liveBrokers.js");
    const trade = await openKotakTradeSession({
      clientId: creds.clientId,
      apiKey: creds.apiKey,
      accessToken: creds.token || creds.apiKey,
      mobile: creds.mobile,
      mpin: creds.mpin,
      totpSecret: creds.totpSecret,
    });
    return applyKotakTradeSession(creds, trade);
  } catch {
    return creds;
  }
}

async function fetchBrokerPnl(userId) {
  const creds = await withKotakTradeLogin(await memberBrokerCredentials(userId));
  if (!creds) return null;
  if (creds.brokerId === "dhan") {
    const { fetchMemberDhanPositions, fetchMemberDhanTrades } = await import("./dhan.js");
    const [positionsRaw, tradesRaw] = await Promise.all([
      fetchMemberDhanPositions(creds.token, creds.clientId),
      fetchMemberDhanTrades(creds.token, creds.clientId).catch(() => null),
    ]);
    return adminBookFromDhan(positionsRaw, tradesRaw);
  }
  if (creds.brokerId === "kotak") {
    return kotakMasterBook(await kotakTradePost(creds, "/quick/user/positions", {}));
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

export function dhanAvailableBalance(funds) {
  const n = firstFinite(funds, ["availabelBalance", "availableBalance", "availablBalance", "sodLimit"]);
  return n == null ? null : round2(n);
}

function kotakMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function kotakMoneyField(row, keys) {
  for (const key of keys) {
    const n = kotakMoney(row?.[key]);
    if (n != null) return n;
  }
  return null;
}

function kotakLimitRows(body) {
  const rows = [];
  const push = (value) => {
    if (value == null) return;
    if (typeof value === "string") {
      try {
        push(JSON.parse(value));
      } catch {
        /* Kotak sometimes wraps jData as text. Ignore text that is not JSON. */
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) push(item);
      return;
    }
    if (typeof value === "object") rows.push(value);
  };
  push(body);
  if (body && typeof body === "object" && !Array.isArray(body)) {
    push(body.data);
    if (body.data && typeof body.data === "object") push(body.data.data);
  }
  return rows;
}

function kotakLimitCategory(row) {
  return String(row?.Category || row?.category || "").toLowerCase();
}

function kotakPnlLimitCategory(category) {
  return /mtm|pnl|dpnl|dpnp|unreal|realiz/.test(String(category || ""));
}

function kotakPreferredLimitCategory(category) {
  const kind = String(category || "");
  return !kind || kind === "all" || kind === "net" || kind === "rms" || kind.includes("client");
}

export function kotakAvailableBalance(body) {
  const rows = kotakLimitRows(body);
  const usable = rows.filter((row) => !kotakPnlLimitCategory(kotakLimitCategory(row)));
  const preferred = usable.filter((row) => kotakPreferredLimitCategory(kotakLimitCategory(row)));
  const pool = preferred.length ? preferred : usable;
  for (const row of pool) {
    const net = kotakMoneyField(row, ["Net", "net", "AvailableCash", "availableCash", "CshBal", "cashBal"]);
    if (net != null) return round2(net);
  }
  let fallback = null;
  for (const row of pool) {
    const cash = kotakMoneyField(row, ["NotionalCash", "notionalCash", "Cash", "cash", "CollateralValue", "collateralValue"]);
    if (cash == null || fallback != null) continue;
    const used = kotakMoneyField(row, ["MarginUsed", "marginUsed"]) || 0;
    fallback = round2(cash - used);
  }
  return fallback;
}

function kotakEmptyBook() {
  return { realizedPnl: 0, unrealizedPnl: 0, mtm: 0, source: "kotak", closed: [], open: [], empty: true };
}

function kotakPositionRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  if (Array.isArray(raw?.data?.positions)) return raw.data.positions;
  return null;
}

function kotakSignedQty(row) {
  const net = finite(row.netQty ?? row.qty);
  if (net != null && net !== 0) return net;
  const buy = Math.abs(Number(row.flBuyQty || row.buyQty || 0));
  const sell = Math.abs(Number(row.flSellQty || row.sellQty || 0));
  if (!buy && !sell) return 0;
  return buy - sell;
}

export function kotakMasterBook(raw) {
  const rows = kotakPositionRows(raw);
  if (!rows) {
    if (raw && typeof raw === "object" && (raw.stat || raw.data != null || raw.stCode != null)) return kotakEmptyBook();
    return null;
  }
  if (!rows.length) return kotakEmptyBook();
  const closed = [];
  const open = [];
  let realized = 0;
  let unrealized = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (String(row.stat || "Ok").toLowerCase() === "not_ok") continue;
    const qty = kotakSignedQty(row);
    const realizedLeg = firstFinite(row, ["rlMtom", "realizedMtom", "realisedMtom", "realizedGain", "realizedProfit"]) || 0;
    const quotedUnreal = firstFinite(row, ["urMtom", "unrealizedMtom", "unRealizedMtom", "unrealizedGain", "unrealizedProfit"]);
    const totalMtm = firstFinite(row, ["mTom", "mtom", "Mtom"]);
    const unrealizedLeg = quotedUnreal != null ? quotedUnreal : qty && totalMtm != null ? totalMtm - realizedLeg : 0;
    if (!qty && !realizedLeg && !unrealizedLeg) continue;
    realized += realizedLeg;
    unrealized += unrealizedLeg;
    const symbol = String(row.trdSym || row.sym || row.tradingSymbol || "");
    const side = qty < 0 ? "SELL" : "BUY";
    const avg = Number(row.avgPrc || row.avgPrice || 0);
    const ltp = Number(row.ltp || row.LTP || avg);
    const leg = {
      id: `kotak-${row.tok || symbol || open.length + closed.length}-${row.prod || "MIS"}`,
      symbol,
      side,
      type: side,
      qty: Math.abs(qty),
      avg,
      ltp,
      entry: avg,
      exit: ltp,
      pnl: round2(realizedLeg + unrealizedLeg),
      realized: round2(realizedLeg),
      product: row.prod || "MIS",
      brokerId: "kotak",
      live: true,
      paper: false,
    };
    if (!qty) closed.push({ ...leg, closed: true });
    else open.push({ ...leg, closed: false });
  }
  return {
    realizedPnl: round2(realized),
    unrealizedPnl: round2(unrealized),
    mtm: round2(realized + unrealized),
    source: "kotak",
    closed,
    open,
  };
}

export function upstoxFundsSnapshot(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : body || {};
  const segments = [data.equity, data.commodity, data].filter((row) => row && typeof row === "object");
  let best = null;
  for (const seg of segments) {
    const available = finite(seg.available_margin);
    const used = finite(seg.used_margin);
    if (available == null && used == null) continue;
    const availN = available || 0;
    const usedN = used || 0;
    const total = availN + usedN;
    if (!best || total > best.total) best = { available: availN, used: usedN, total };
  }
  if (!best) return null;
  return { balance: round2(best.available), used: round2(best.used), source: "upstox" };
}

export function upstoxAvailableBalance(body) {
  const snap = upstoxFundsSnapshot(body);
  return snap ? snap.balance : null;
}

export function dhanFundsSnapshot(funds) {
  const available = dhanAvailableBalance(funds);
  if (available == null) return null;
  const used = firstFinite(funds, ["utilizedAmount", "usedMargin"]) || 0;
  return { balance: available, used: round2(used), source: "dhan" };
}

export function kotakFundsSnapshot(body) {
  const available = kotakAvailableBalance(body);
  if (available == null) return null;
  const rows = kotakLimitRows(body);
  const usable = rows.filter((row) => !kotakPnlLimitCategory(kotakLimitCategory(row)));
  const preferred = usable.filter((row) => kotakPreferredLimitCategory(kotakLimitCategory(row)));
  const pool = preferred.length ? preferred : usable;
  let used = 0;
  for (const row of pool) {
    const hit = kotakMoneyField(row, ["MarginUsed", "marginUsed"]);
    if (hit != null) {
      used = hit;
      break;
    }
  }
  return { balance: available, used: round2(used), source: "kotak" };
}

async function upstoxFunds(token) {
  const { ipv4Request } = await import("./ipv4.js");
  const res = await ipv4Request("https://api.upstox.com/v2/user/get-funds-and-margin", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
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
    const message = json?.errors?.[0]?.message || json?.message || `Upstox funds ${res.status}`;
    throw new Error(message);
  }
  return json;
}

async function fetchBrokerBalance(userId) {
  const creds = await withKotakTradeLogin(await memberBrokerCredentials(userId));
  if (!creds) return null;
  if (creds.brokerId === "dhan") {
    const { fetchMemberDhanFunds } = await import("./dhan.js");
    return dhanFundsSnapshot(await fetchMemberDhanFunds(creds.token, creds.clientId));
  }
  if (creds.brokerId === "kotak") {
    const sets = kotakLimitHeaderSets(creds);
    if (!sets.length) return null;
    let last = null;
    for (const set of sets) {
      try {
        const hosts = set.headers.Auth ? KOTAK_TRADE_HOSTS : ["https://mis.kotaksecurities.com"];
        const snap = kotakFundsSnapshot(
          await kotakTradePost(creds, "/quick/user/limits", { seg: "ALL", exch: "ALL", prod: "ALL" }, set.headers, hosts),
        );
        if (snap) return snap;
      } catch (error) {
        last = error;
      }
    }
    if (last) throw last;
    return null;
  }
  return upstoxFundsSnapshot(await upstoxFunds(creds.token));
}

export async function readMemberBrokerBalance(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  const hit = balanceCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (balanceInflight.has(key)) return balanceInflight.get(key);
  const job = fetchBrokerBalance(key)
    .then((value) => {
      balanceCache.set(key, { at: Date.now(), value: value || null });
      return value || null;
    })
    .catch((error) => {
      balanceCache.set(key, { at: Date.now(), value: null });
      console.log(`member broker balance kept local ${key}: ${error?.message || error}`);
      return null;
    })
    .finally(() => {
      balanceInflight.delete(key);
    });
  balanceInflight.set(key, job);
  return job;
}

export function applyBrokerBalance(desk, balance) {
  if (!desk || !balance || !Number.isFinite(Number(balance.balance))) return desk;
  const wallet = desk.wallet && typeof desk.wallet === "object" ? desk.wallet : {};
  const used = Number(balance.used);
  desk.wallet = {
    ...wallet,
    brokerBalance: round2(balance.balance),
    brokerUsed: Number.isFinite(used) ? round2(Math.max(0, used)) : 0,
    brokerBalanceSource: String(balance.source || ""),
  };
  return desk;
}

export async function attachMemberBrokerBalance(desk, userId, load = readMemberBrokerBalance) {
  if (!desk || !userId) return desk;
  try {
    const balance = await load(userId);
    if (balance) applyBrokerBalance(desk, balance);
  } catch (error) {
    console.log(`member broker balance kept local ${userId}: ${error?.message || error}`);
  }
  return desk;
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
