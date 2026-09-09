import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog } from "./brokers.js";
import { buildReport } from "./desk.js";
import { buildUpiLinks, publicPayments } from "./subscriptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESK_FILE = process.env.T2S_MEMBER_DESK_FILE || path.join(__dirname, "data", "member-desk.json");
const MIN_TOPUP = 100;
const MAX_TOPUP = 200000;
const DEFAULT_TOPUP = 5000;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function readStore() {
  try {
    const row = JSON.parse(fs.readFileSync(DESK_FILE, "utf8"));
    return row && typeof row === "object" && !Array.isArray(row) ? row : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(DESK_FILE), { recursive: true });
  fs.writeFileSync(DESK_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

let store = readStore();

function persist() {
  writeStore(store);
}

const SIZING_KINDS = ["multiplier", "lots", "fixed"];
const TRADE_MODES = ["paper", "real"];
const SUBSCRIPTION_MODES = ["copy", "strategy", "both"];

function emptyDesk(userId) {
  return {
    userId,
    brokerId: "paper",
    group: "ALL",
    sizingKind: "multiplier",
    sizingValue: 1,
    tradeMode: "paper",
    copy: false,
    staticIp: "",
    accountId: "",
    subscriptionMode: "copy",
    subscriptionUntil: "",
    wallet: { balance: 0, updatedAt: new Date().toISOString() },
    topups: [],
    positions: [],
    closedTrades: [],
    orders: [],
    seededPlans: [],
  };
}

export function isStaticIp(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "default") return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    return raw.split(".").every((part) => {
      const n = Number(part);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  if (raw.includes(":") && /^[0-9a-fA-F:]+$/.test(raw) && raw.length <= 45) return true;
  return false;
}

export function normalizeClientSettings(desk = {}) {
  const sizingKind = SIZING_KINDS.includes(desk.sizingKind) ? desk.sizingKind : "multiplier";
  const rawSize = Number(desk.sizingValue);
  const sizingValue = Number.isFinite(rawSize) ? Math.min(100, Math.max(0.1, rawSize)) : 1;
  const tradeMode = desk.tradeMode === "real" ? "real" : "paper";
  const brokerId = catalog.some((row) => row.id === desk.brokerId) ? desk.brokerId : "paper";
  const subscriptionMode = SUBSCRIPTION_MODES.includes(desk.subscriptionMode) ? desk.subscriptionMode : "copy";
  return {
    group: String(desk.group || "ALL").trim() || "ALL",
    sizingKind,
    sizingValue,
    tradeMode,
    copy: Boolean(desk.copy),
    staticIp: String(desk.staticIp || "").trim(),
    accountId: String(desk.accountId || "").trim(),
    brokerId,
    subscriptionMode,
    subscriptionUntil: String(desk.subscriptionUntil || "").trim(),
    margin: round2(desk.wallet?.balance || 0),
  };
}

export function peekClientSettings(userId) {
  const desk = store[userId];
  if (!desk) return normalizeClientSettings({ brokerId: "paper", wallet: { balance: 0 } });
  return normalizeClientSettings(desk);
}

export function saveClientSettings(userId, patch = {}) {
  if (!userId) throw fail("Client required.");
  const desk = loadDesk(userId);
  if (patch.group != null) desk.group = String(patch.group || "ALL").trim() || "ALL";
  if (patch.sizingKind != null) {
    const kind = String(patch.sizingKind || "").trim().toLowerCase();
    if (!SIZING_KINDS.includes(kind)) throw fail("Order sizing must be Multiplier, Lots, or Fixed.");
    desk.sizingKind = kind;
  }
  if (patch.sizingValue != null) {
    const n = Number(patch.sizingValue);
    if (!Number.isFinite(n) || n < 0.1 || n > 100) throw fail("Order size must be between 0.1 and 100.");
    desk.sizingValue = n;
  }
  if (patch.tradeMode != null) {
    const mode = String(patch.tradeMode || "").trim().toLowerCase();
    if (!TRADE_MODES.includes(mode)) throw fail("Mode must be PAPER or REAL.");
    desk.tradeMode = mode;
  }
  if (patch.copy != null) desk.copy = Boolean(patch.copy);
  if (patch.staticIp != null) {
    const ip = String(patch.staticIp || "").trim();
    if (!isStaticIp(ip)) throw fail("Enter an IPv4 or IPv6 address, or leave Default.");
    desk.staticIp = ip.toLowerCase() === "default" ? "" : ip;
  }
  if (patch.accountId != null) desk.accountId = String(patch.accountId || "").trim();
  if (patch.brokerId != null) {
    const id = String(patch.brokerId || "").trim().toLowerCase();
    if (!catalog.some((row) => row.id === id)) throw fail("Unknown broker.");
    desk.brokerId = id;
  }
  if (patch.subscriptionMode != null) {
    const mode = String(patch.subscriptionMode || "").trim().toLowerCase();
    if (!SUBSCRIPTION_MODES.includes(mode)) throw fail("Subscription must be Copy Master, mapped strategies, or both.");
    desk.subscriptionMode = mode;
  }
  if (patch.subscriptionUntil != null) {
    const until = String(patch.subscriptionUntil || "").trim();
    if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw fail("Use a valid through date (YYYY-MM-DD).");
    desk.subscriptionUntil = until;
  }
  persist();
  return normalizeClientSettings(desk);
}

export function listClientGroups() {
  const groups = new Set(["ALL"]);
  for (const desk of Object.values(store)) {
    const name = String(desk?.group || "").trim();
    if (name) groups.add(name);
  }
  return [...groups];
}

export function removeDesk(userId) {
  if (!userId || !store[userId]) return false;
  delete store[userId];
  persist();
  return true;
}

function loadDesk(userId) {
  if (!store[userId]) store[userId] = emptyDesk(userId);
  const desk = store[userId];
  desk.topups = Array.isArray(desk.topups) ? desk.topups : [];
  desk.positions = Array.isArray(desk.positions) ? desk.positions : [];
  desk.closedTrades = Array.isArray(desk.closedTrades) ? desk.closedTrades : [];
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.seededPlans = Array.isArray(desk.seededPlans) ? desk.seededPlans : [];
  if (!desk.wallet || typeof desk.wallet !== "object") desk.wallet = { balance: 0, updatedAt: new Date().toISOString() };
  if (!catalog.some((row) => row.id === desk.brokerId)) desk.brokerId = "paper";
  return desk;
}

export function memberBrokerCatalog(selectedId = "paper") {
  return catalog.map((row) => ({
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    color: row.color,
    segments: row.segments,
    virtual: row.id === "paper",
    selectable: true,
    selected: row.id === selectedId,
    mode: row.id === "paper" ? "paper" : "desk-managed",
    note: row.id === "paper" ? "Virtual paper book. MTM updates here." : "Desk will use this broker for your plan. No API keys on the member side.",
  }));
}

function seedPlanBook(algo, brokerId) {
  const name = algo?.name || "Strategy";
  const reversal = /15m|reversal/i.test(name);
  const openSymbol = reversal ? "NIFTY 24650 CE" : "NIFTY 24600 CE";
  const closedSymbol = reversal ? "NIFTY 24550 PE" : "NIFTY 24500 CE";
  const avg = reversal ? 62.4 : 74.1;
  const ltp = round2(avg * 1.08);
  const qty = 65;
  const now = Date.now();
  return {
    position: {
      id: `mp${crypto.randomBytes(6).toString("hex")}`,
      symbol: openSymbol,
      type: "BUY",
      qty,
      avg,
      ltp,
      pnl: round2((ltp - avg) * qty),
      brokerId,
      strategy: name,
      paper: true,
      sim: true,
    },
    trade: {
      id: `mt${crypto.randomBytes(6).toString("hex")}`,
      symbol: closedSymbol,
      side: "BUY",
      qty,
      entry: reversal ? 88 : 118.2,
      exit: reversal ? 104.5 : 141.6,
      pnl: reversal ? 1072.5 : 1521,
      product: "MIS",
      strategy: name,
      brokerId,
      closedAt: new Date(now - 36 * 3600 * 1000).toISOString(),
      paper: true,
      sim: true,
    },
    order: {
      id: `mo${crypto.randomBytes(6).toString("hex")}`,
      symbol: openSymbol,
      side: "BUY",
      qty,
      filledQty: qty,
      price: avg,
      product: "MIS",
      type: "MARKET",
      status: "FILLED",
      strategy: name,
      brokerId,
      createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      paper: true,
      sim: true,
    },
  };
}

export function ensurePlanLedger({ user, algo } = {}) {
  if (!user?.id || !algo?.id) return null;
  const desk = loadDesk(user.id);
  if (desk.seededPlans.includes(algo.id)) return desk;
  const book = seedPlanBook(algo, desk.brokerId);
  desk.positions.unshift(book.position);
  desk.closedTrades.unshift(book.trade);
  desk.orders.unshift(book.order);
  desk.seededPlans.push(algo.id);
  persist();
  return desk;
}

function syncPaidPlans(desk, enrollments = [], algos = []) {
  const paid = (enrollments || []).filter((row) => row.status === "paid" && row.strategyId);
  for (const row of paid) {
    if (desk.seededPlans.includes(row.strategyId)) continue;
    const algo = (algos || []).find((item) => item.id === row.strategyId) || {
      id: row.strategyId,
      name: row.strategyName,
    };
    const book = seedPlanBook(algo, desk.brokerId);
    desk.positions.unshift(book.position);
    desk.closedTrades.unshift(book.trade);
    desk.orders.unshift(book.order);
    desk.seededPlans.push(row.strategyId);
  }
}

function markMtm(desk, quote) {
  desk.positions = (desk.positions || []).map((row) => {
    const ltp = Number(typeof quote === "function" ? quote(row.symbol) : 0);
    const nextLtp = ltp > 0 ? ltp : Number(row.ltp || row.avg || 0);
    const dir = row.type === "SELL" ? -1 : 1;
    return {
      ...row,
      ltp: nextLtp,
      pnl: round2((nextLtp - Number(row.avg || 0)) * Number(row.qty || 0) * dir),
      brokerId: row.brokerId || desk.brokerId,
    };
  });
}

function publicTopup(row) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    amount: row.amount,
    channel: row.channel,
    status: row.status,
    createdAt: row.createdAt,
    paidAt: row.paidAt || "",
  };
}

function planRows(desk, enrollments = []) {
  const paid = (enrollments || []).filter((row) => row.status === "paid");
  return paid.map((row) => {
    const open = desk.positions.filter((item) => item.strategy === row.strategyName);
    const closed = desk.closedTrades.filter((item) => item.strategy === row.strategyName);
    const realizedPnl = round2(closed.reduce((sum, item) => sum + Number(item.pnl || 0), 0));
    const unrealizedPnl = round2(open.reduce((sum, item) => sum + Number(item.pnl || 0), 0));
    return {
      strategyId: row.strategyId,
      strategyName: row.strategyName,
      status: row.status,
      realizedPnl,
      unrealizedPnl,
      netPnl: round2(realizedPnl + unrealizedPnl),
      openPositions: open.length,
      trades: closed.length,
    };
  });
}

export function getMemberDesk({ user, enrollments = [], algos = [], quote, admins = [] } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = loadDesk(user.id);
  syncPaidPlans(desk, enrollments, algos);
  markMtm(desk, quote);
  persist();
  const report = buildReport({
    closedTrades: desk.closedTrades,
    positions: desk.positions,
    orders: desk.orders,
  });
  const unrealized = Number(report.unrealizedPnl || 0);
  const balance = round2(desk.wallet.balance || 0);
  return {
    wallet: {
      balance,
      mtm: unrealized,
      equity: round2(balance + unrealized),
      updatedAt: desk.wallet.updatedAt,
    },
    brokerId: desk.brokerId,
    brokers: memberBrokerCatalog(desk.brokerId),
    plans: planRows(desk, enrollments),
    report,
    positions: desk.positions,
    topups: desk.topups.map(publicTopup),
    payments: publicPayments(admins),
  };
}

export function selectMemberBroker({ user, brokerId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const wanted = String(brokerId || "").trim().toLowerCase();
  if (!catalog.some((row) => row.id === wanted)) throw fail("Unknown broker.");
  const desk = loadDesk(user.id);
  desk.brokerId = wanted;
  desk.positions = desk.positions.map((row) => ({ ...row, brokerId: wanted }));
  persist();
  return { brokerId: wanted, brokers: memberBrokerCatalog(wanted) };
}

export function startWalletTopup({ user, amount, channel, admins = [] } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const pub = publicPayments(admins);
  if (!pub.ready) throw fail("Admin has not set a GPay / PhonePe mobile yet. Ask the desk to add it in Settings.");
  const rupees = Number(amount);
  if (!Number.isFinite(rupees) || rupees < MIN_TOPUP) throw fail(`Add at least ₹${MIN_TOPUP}.`);
  if (rupees > MAX_TOPUP) throw fail(`Add at most ₹${MAX_TOPUP.toLocaleString("en-IN")}.`);
  const wanted = channel === "phonepe" ? "phonepe" : "gpay";
  const desk = loadDesk(user.id);
  const row = {
    id: `tp${crypto.randomBytes(8).toString("hex")}`,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    amount: Math.round(rupees),
    channel: wanted,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  desk.topups.unshift(row);
  persist();
  const links = buildUpiLinks({
    vpa: pub.upiId,
    payeeName: pub.payeeName,
    amount: row.amount,
    note: `T2S wallet ${row.amount}`.slice(0, 50),
  });
  return { topup: publicTopup(row), payments: pub, links };
}

export function markTopupPaid({ user, topupId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = loadDesk(user.id);
  const row = desk.topups.find((item) => item.id === topupId);
  if (!row) throw fail("Top-up not found.", 404);
  if (row.status !== "paid") {
    row.status = "paid";
    row.paidAt = new Date().toISOString();
    desk.wallet.balance = round2((desk.wallet.balance || 0) + Number(row.amount || 0));
    desk.wallet.updatedAt = row.paidAt;
    persist();
  }
  return {
    topup: publicTopup(row),
    wallet: { balance: desk.wallet.balance, updatedAt: desk.wallet.updatedAt },
  };
}

export function listTopups({ userId, admin } = {}) {
  const rows = [];
  for (const desk of Object.values(store)) {
    for (const row of desk.topups || []) {
      if (admin || row.userId === userId) rows.push(publicTopup(row));
    }
  }
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export { DEFAULT_TOPUP, MIN_TOPUP };
