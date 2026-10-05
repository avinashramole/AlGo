const CACHE_MS = 9000;
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

function asMemberBrokerPosition(row = {}, index = 0) {
  const type = String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const qty = Math.abs(Number(row.qty) || 0);
  const avg = Number(row.avg || row.entry || 0);
  const ltp = Number(row.ltp || row.exit || avg || 0);
  return {
    id: String(row.id || `broker-open-${index}`),
    symbol: String(row.symbol || ""),
    type,
    qty,
    avg,
    ltp,
    pnl: round2(row.pnl),
    product: row.product || "MIS",
    strategy: String(row.strategy || ""),
    brokerId: row.brokerId || "",
    paper: false,
    live: true,
    brokerBook: true,
  };
}

function asMemberBrokerTrade(row = {}, index = 0) {
  return {
    id: String(row.id || `broker-closed-${index}`),
    symbol: String(row.symbol || ""),
    side: String(row.side || row.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    type: String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    qty: Math.abs(Number(row.qty) || 0),
    entry: Number(row.entry || row.avg || 0),
    exit: Number(row.exit || row.ltp || 0),
    pnl: round2(row.pnl != null ? row.pnl : row.realized),
    product: row.product || "MIS",
    strategy: String(row.strategy || ""),
    brokerId: row.brokerId || "",
    paper: false,
    live: true,
    closedAt: row.closedAt || "",
    status: "CLOSED",
  };
}

function stampBrokerDaily(report, realized, unrealized) {
  const net = round2(realized + unrealized);
  const daily = Array.isArray(report.daily) ? report.daily.map((row) => ({ ...row })) : [];
  const today = String(report.date || "").trim();
  if (!today) return daily;
  const idx = daily.findIndex((row) => row.date === today);
  const next = {
    date: today,
    pnl: net,
    trades: idx >= 0 ? Number(daily[idx].trades || 0) : 0,
    unrealized,
  };
  if (idx >= 0) daily[idx] = { ...daily[idx], ...next };
  else daily.push(next);
  return daily;
}

function brokerPnlHasMarks(pnl) {
  if (!pnl) return false;
  if (pnl.empty) return true;
  if (Number(pnl.realizedPnl) || Number(pnl.unrealizedPnl) || Number(pnl.mtm)) return true;
  if ((pnl.open || []).some((row) => Number(row.avg) > 0 || Number(row.ltp) > 0 || Number(row.pnl))) return true;
  if ((pnl.closed || []).some((row) => Number(row.pnl) || Number(row.realized))) return true;
  return false;
}

function deskAlreadyMarked(desk) {
  if (Number(desk?.wallet?.mtm)) return true;
  return (desk?.positions || []).some((row) => Number(row.avg) > 0 || Number(row.pnl) || Number(row.ltp) > 0);
}

export function applyBrokerPnl(desk, pnl) {
  if (!desk || !pnl) return desk;
  if (!brokerPnlHasMarks(pnl) && deskAlreadyMarked(desk)) return desk;
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
    daily: stampBrokerDaily(report, realized, unrealized),
  };
  if (Array.isArray(pnl.open) && (pnl.open.length || (pnl.closed || []).length)) {
    const paper = (desk.positions || []).filter((row) => row?.paper || row?.brokerId === "paper");
    desk.positions = [...paper, ...pnl.open.map(asMemberBrokerPosition)];
    desk.report.openPositions = desk.positions.length;
  }
  if (Array.isArray(pnl.closed) && pnl.closed.length) {
    desk.report.tradeBook = pnl.closed.map(asMemberBrokerTrade);
  }
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
      const stat = String(json?.stat || json?.data?.stat || "").toLowerCase();
      if (stat === "not_ok" || stat === "not ok" || stat === "error") {
        if (kotakPositionRows(json)?.some((row) => row && typeof row === "object")) return json;
        last = new Error(json?.errMsg || json?.emsg || json?.data?.emsg || "Kotak refused this request.");
        continue;
      }
      return json;
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("Kotak trade request failed.");
}

function kotakBookHasMarks(book) {
  if (!book) return false;
  if (Number(book.mtm) || Number(book.realizedPnl) || Number(book.unrealizedPnl)) return true;
  if ((book.open || []).some((row) => Number(row.avg) > 0 || Number(row.ltp) > 0 || Number(row.pnl))) return true;
  if ((book.closed || []).some((row) => Number(row.pnl) || Number(row.realized))) return true;
  return false;
}

export function bookFromMemberPositions(positions = [], closed = [], source = "kotak") {
  const open = [];
  let unrealized = 0;
  let realized = 0;
  for (const row of closed || []) {
    const pnl = Number(row.pnl || row.realized || 0);
    if (!Number.isFinite(pnl)) continue;
    realized += pnl;
  }
  for (const row of positions || []) {
    const qty = Math.abs(Number(row.qty || 0));
    if (!qty) continue;
    const type = String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const avg = Number(row.avg || row.entry || 0);
    const ltp = Number(row.ltp || row.exit || avg || 0);
    const marked = Number(row.pnl);
    const pnl = Number.isFinite(marked) ? marked : round2((ltp - avg) * qty * (type === "SELL" ? -1 : 1));
    unrealized += pnl;
    open.push({
      id: String(row.id || `local-${open.length}`),
      symbol: String(row.symbol || ""),
      side: type,
      type,
      qty,
      avg,
      ltp,
      entry: avg,
      exit: ltp,
      pnl: round2(pnl),
      realized: 0,
      product: row.product || "MIS",
      brokerId: row.brokerId || source,
      live: true,
      paper: false,
      closed: false,
    });
  }
  return {
    realizedPnl: round2(realized),
    unrealizedPnl: round2(unrealized),
    mtm: round2(realized + unrealized),
    source,
    closed: (closed || [])
      .filter((row) => Number(row.pnl || row.realized))
      .map((row, index) => ({
        id: String(row.id || `local-closed-${index}`),
        symbol: String(row.symbol || ""),
        side: String(row.side || row.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        type: String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
        qty: Math.abs(Number(row.qty) || 0),
        entry: Number(row.entry || row.avg || 0),
        exit: Number(row.exit || row.ltp || 0),
        pnl: round2(row.pnl != null ? row.pnl : row.realized),
        realized: round2(row.realized != null ? row.realized : row.pnl),
        product: row.product || "MIS",
        brokerId: row.brokerId || source,
        live: true,
        paper: false,
        closed: true,
      })),
    open,
  };
}

export function mergeKotakBooks(broker, local) {
  if (kotakBookHasMarks(broker)) {
    const open = (broker.open || []).map((row, index) => {
      const hit = (local?.open || []).find((item) => String(item.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "") === String(row.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
      const avg = Number(row.avg) > 0 ? Number(row.avg) : Number(hit?.avg || 0);
      const ltp = Number(row.ltp) > 0 ? Number(row.ltp) : Number(hit?.ltp || avg || 0);
      const qty = Math.abs(Number(row.qty || hit?.qty || 0));
      const type = String(row.type || row.side || hit?.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
      const pnl = Number(row.pnl) || round2((ltp - avg) * qty * (type === "SELL" ? -1 : 1));
      return { ...row, avg, ltp, entry: avg, exit: ltp, pnl, qty };
    });
    const unrealized = round2(open.reduce((sum, row) => sum + Number(row.pnl || 0), 0));
    const realized = round2(broker.realizedPnl);
    return {
      ...broker,
      open,
      unrealizedPnl: Number(broker.unrealizedPnl) || unrealized,
      mtm: round2(realized + (Number(broker.unrealizedPnl) || unrealized)),
    };
  }
  return local && (local.open?.length || local.closed?.length) ? { ...local, source: local.source || "kotak" } : broker || local || null;
}

async function fetchKotakMasterBook(creds) {
  const sets = kotakLimitHeaderSets(creds);
  const bodies = [{}, { st: "DAY" }, { st: "ALL" }, { seg: "ALL" }];
  if (!sets.length) {
    for (const body of bodies) {
      try {
        const book = kotakMasterBook(await kotakTradePost(creds, "/quick/user/positions", body));
        if (book) return book;
      } catch {
        /* next body */
      }
    }
    return kotakMasterBook(await kotakTradePost(creds, "/quick/user/positions", {}));
  }
  let last = null;
  for (const set of sets) {
    const hosts = set.headers.Auth ? KOTAK_TRADE_HOSTS : ["https://mis.kotaksecurities.com"];
    for (const body of bodies) {
      try {
        const book = kotakMasterBook(await kotakTradePost(creds, "/quick/user/positions", body, set.headers, hosts));
        if (book) return book;
      } catch (error) {
        last = error;
      }
    }
  }
  if (last) throw last;
  return null;
}

async function fillKotakBookLtps(book, creds) {
  if (!book?.open?.length) return book;
  const missing = book.open.filter((row) => !(Number(row.ltp) > 0));
  if (!missing.length) return book;
  const { fetchKotakSymbolLtp } = await import("./memberBrokerQuotes.js");
  const tokens = [creds.apiKey, creds.token, creds.accessToken];
  const open = [];
  for (const row of book.open) {
    let ltp = Number(row.ltp || 0);
    if (!(ltp > 0) && row.symbol) ltp = await fetchKotakSymbolLtp(row.symbol, tokens);
    const avg = Number(row.avg || 0);
    const qty = Math.abs(Number(row.qty || 0));
    const type = String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const pnl = Number(row.pnl) || round2((ltp - avg) * qty * (type === "SELL" ? -1 : 1));
    open.push({ ...row, ltp: ltp || avg, pnl });
  }
  const unrealized = round2(open.reduce((sum, row) => sum + Number(row.pnl || 0), 0));
  return {
    ...book,
    open,
    unrealizedPnl: unrealized,
    mtm: round2(Number(book.realizedPnl || 0) + unrealized),
  };
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
    const { fetchMemberDhanPositions } = await import("./dhan.js");
    return dhanMasterBook(await fetchMemberDhanPositions(creds.token, creds.clientId));
  }
  if (creds.brokerId === "kotak") {
    const { repairMemberPositionMarks, peekClientBook } = await import("./memberDesk.js");
    const localDesk = repairMemberPositionMarks(userId);
    const local = bookFromMemberPositions(localDesk.positions, localDesk.closedTrades, "kotak");
    let broker = null;
    try {
      broker = await fetchKotakMasterBook(creds);
    } catch (error) {
      console.log(`member Kotak positions ${userId}: ${error?.message || error}`);
    }
    const merged = mergeKotakBooks(broker, local);
    const marked = await fillKotakBookLtps(merged, creds);
    if (marked?.open?.length) {
      const ltpBySymbol = Object.fromEntries(marked.open.map((row) => [row.symbol, row.ltp]));
      repairMemberPositionMarks(userId, ltpBySymbol);
      const refreshed = peekClientBook(userId);
      return mergeKotakBooks(marked, bookFromMemberPositions(refreshed.positions, refreshed.closedTrades, "kotak"));
    }
    return marked;
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

export function kotakAvailableBalance(body) {
  const rows = kotakLimitRows(body);
  let firstNet = null;
  for (const row of rows) {
    const net = kotakMoneyField(row, ["Net", "net"]);
    if (net == null) continue;
    if (firstNet == null) firstNet = net;
    const category = String(row.Category || row.category || "").toLowerCase();
    if (!category || category === "net" || category.includes("client")) return round2(net);
  }
  if (firstNet != null) return round2(firstNet);
  let fallback = null;
  for (const row of rows) {
    const cash = kotakMoneyField(row, ["NotionalCash", "notionalCash", "Cash", "cash"]);
    if (cash == null || fallback != null) continue;
    const used = kotakMoneyField(row, ["MarginUsed", "marginUsed"]) || 0;
    fallback = round2(Math.max(0, cash - used));
  }
  return fallback;
}

function kotakRowValue(row, keys) {
  if (!row || typeof row !== "object") return undefined;
  const lower = Object.create(null);
  for (const [key, value] of Object.entries(row)) {
    lower[String(key).toLowerCase()] = value;
  }
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
    const hit = lower[String(key).toLowerCase()];
    if (hit != null && hit !== "") return hit;
  }
  return undefined;
}

function kotakLookField(row, keys) {
  const n = finite(kotakRowValue(row, keys));
  if (n != null) return n;
  return kotakMoneyField(row, keys);
}

export function kotakPositionRows(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return kotakPositionRows(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  if (Array.isArray(raw?.data?.positions)) return raw.data.positions;
  if (Array.isArray(raw?.positions)) return raw.positions;
  if (Array.isArray(raw?.data)) return raw.data;
  if (typeof raw?.data === "string" || typeof raw?.data?.data === "string") {
    return kotakPositionRows(raw.data?.data ?? raw.data);
  }
  if (
    raw &&
    typeof raw === "object" &&
    (raw.trdSym ||
      raw.tSym ||
      raw.tsym ||
      raw.tradingSymbol ||
      raw.flBuyQty != null ||
      raw.netQty != null ||
      raw.tok)
  ) {
    return [raw];
  }
  return null;
}

function kotakSignedQty(row) {
  const net = kotakLookField(row, ["netQty", "qty", "netQuantity"]);
  if (net != null && net !== 0) return net;
  const buy =
    Math.abs(Number(kotakRowValue(row, ["flBuyQty", "buyQty"]) || 0)) +
    Math.abs(Number(kotakRowValue(row, ["cfBuyQty"]) || 0));
  const sell =
    Math.abs(Number(kotakRowValue(row, ["flSellQty", "sellQty"]) || 0)) +
    Math.abs(Number(kotakRowValue(row, ["cfSellQty"]) || 0));
  if (!buy && !sell) return 0;
  return buy - sell;
}

function kotakAvgPrice(row, qty, side) {
  const direct = kotakLookField(row, ["avgPrc", "avgPrice", "buyAvgPrc", "sellAvgPrc", "upldPrc"]);
  if (direct != null && direct > 0) return direct;
  const buyQty = Math.abs(Number(kotakRowValue(row, ["flBuyQty", "buyQty"]) || 0));
  const sellQty = Math.abs(Number(kotakRowValue(row, ["flSellQty", "sellQty"]) || 0));
  const buyAmt = kotakLookField(row, ["buyAmt", "buyAmount", "buyVal"]);
  const sellAmt = kotakLookField(row, ["sellAmt", "sellAmount", "sellVal"]);
  if (side === "SELL" && sellQty && sellAmt != null) return sellAmt / sellQty;
  if (buyQty && buyAmt != null) return buyAmt / buyQty;
  if (qty && buyAmt != null && side !== "SELL") return buyAmt / Math.abs(qty);
  return direct || 0;
}

function kotakLastPrice(row, avg) {
  const ltp = kotakLookField(row, ["ltp", "LTP", "lp", "lastPx", "lastPrice", "clsPrc", "close"]);
  return ltp != null && ltp > 0 ? ltp : avg;
}

export function kotakMasterBook(raw) {
  const rows = kotakPositionRows(raw);
  if (!rows) return null;
  const closed = [];
  const open = [];
  let realized = 0;
  let unrealized = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (String(row.stat || "Ok").toLowerCase() === "not_ok") continue;
    const qty = kotakSignedQty(row);
    const realizedLeg =
      kotakLookField(row, ["rlMtom", "rlmtom", "realizedMtom", "realisedMtom", "realizedGain", "realizedProfit", "rPnl"]) || 0;
    const quotedUnreal = kotakLookField(row, [
      "urMtom",
      "urmtom",
      "unrealizedMtom",
      "unRealizedMtom",
      "unrealizedGain",
      "unrealizedProfit",
      "uPnl",
    ]);
    const totalMtm = kotakLookField(row, ["mTom", "mtom", "Mtom", "mtm"]);
    const side = qty < 0 ? "SELL" : "BUY";
    const avg = kotakAvgPrice(row, qty, side);
    const ltp = kotakLastPrice(row, avg);
    const computedUnreal =
      quotedUnreal != null
        ? quotedUnreal
        : qty && totalMtm != null
          ? totalMtm - realizedLeg
          : qty && avg
            ? (ltp - avg) * qty
            : 0;
    const unrealizedLeg = computedUnreal;
    if (!qty && !realizedLeg && !unrealizedLeg) continue;
    realized += realizedLeg;
    unrealized += unrealizedLeg;
    const symbol = String(kotakRowValue(row, ["trdSym", "tSym", "tsym", "trdSYm", "tradingSymbol", "sym", "trdSymbol"]) || "");
    const product = String(kotakRowValue(row, ["prod", "product", "prd"]) || "MIS");
    const token = kotakRowValue(row, ["tok", "token"]) || symbol || open.length + closed.length;
    const leg = {
      id: `kotak-${token}-${product}`,
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
      product,
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

export function upstoxAvailableBalance(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : body || {};
  const equity = finite(data.equity?.available_margin);
  const commodity = finite(data.commodity?.available_margin);
  if (equity == null && commodity == null) return null;
  if (equity != null && equity > 0) return round2(equity);
  if (commodity != null) return round2(commodity);
  return round2(equity || 0);
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
    const available = dhanAvailableBalance(await fetchMemberDhanFunds(creds.token, creds.clientId));
    return available == null ? null : { balance: available, source: "dhan" };
  }
  if (creds.brokerId === "kotak") {
    const sets = kotakLimitHeaderSets(creds);
    if (!sets.length) return null;
    let last = null;
    for (const set of sets) {
      try {
        const hosts = set.headers.Auth ? KOTAK_TRADE_HOSTS : ["https://mis.kotaksecurities.com"];
        const available = kotakAvailableBalance(
          await kotakTradePost(creds, "/quick/user/limits", { seg: "ALL", exch: "ALL", prod: "ALL" }, set.headers, hosts),
        );
        if (available != null) return { balance: available, source: "kotak" };
      } catch (error) {
        last = error;
      }
    }
    if (last) throw last;
    return null;
  }
  const available = upstoxAvailableBalance(await upstoxFunds(creds.token));
  return available == null ? null : { balance: available, source: "upstox" };
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
  desk.wallet = {
    ...wallet,
    brokerBalance: round2(balance.balance),
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

export async function syncMemberKotakOrders(userId = "") {
  const { memberWorkingKotakCopies, applyMemberDhanOrderStatuses } = await import("./memberDesk.js");
  const { refreshCopyOrdersFromBroker } = await import("./market.js");
  const { kotakOrderRows, normalizeKotakBrokerOrder } = await import("./liveBrokers.js");
  const wanted = String(userId || "").trim();
  const targets = memberWorkingKotakCopies().filter((row) => !wanted || row.userId === wanted);
  const updates = [];
  for (const target of targets) {
    try {
      const creds = await withKotakTradeLogin({
        brokerId: "kotak",
        token: target.token,
        accessToken: target.token,
        apiKey: target.apiKey,
        sessionToken: target.sessionToken,
        clientId: target.clientId,
        mobile: target.mobile,
        mpin: target.mpin,
        totpSecret: target.totpSecret,
      });
      if (!creds) continue;
      const report = await kotakTradePost(creds, "/quick/user/orders", {});
      const rows = kotakOrderRows(report).map(normalizeKotakBrokerOrder).filter((row) => row.orderId);
      const changed = applyMemberDhanOrderStatuses(target.userId, rows);
      if (changed.length) {
        refreshCopyOrdersFromBroker(target.userId, changed);
        updates.push(...changed);
      }
    } catch (error) {
      console.log(`member Kotak order status ${target.userId}: ${error?.message || error}`);
    }
  }
  return updates;
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
