import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, isKnownLiveBroker, isLiveBrokerReady, publicBrokers } from "./brokers.js";
import { buildReport } from "./desk.js";
import { buildUpiLinks, listEnrollments, publicPayments } from "./subscriptions.js";

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

export const DEFAULT_CLIENT_GROUPS = [
  "ALICE TESTING",
  "ANGEL TESTING",
  "Cash Market",
  "DHAN TESTING",
  "F&O",
  "KITE TESTING",
  "KOTAK TESTING",
  "SHAREKHAN TESTING",
  "UPSTOX TESTING",
];

export const CLIENT_BROKERS = [
  { id: "dhan", name: "DHAN", color: "#0f9d58", segments: ["All segments", "EQ", "F&O"] },
  { id: "upstox", name: "UPSTOX", color: "#5b2d8e", segments: ["All segments", "UPSTOX"] },
  { id: "zerodha", name: "ZERODHA", color: "#f6461a", segments: ["All segments", "EQ", "F&O"] },
  { id: "kotak", name: "KOTAK", color: "#0033a0", segments: ["All segments", "EQ", "F&O"] },
  { id: "angelone", name: "ANGELONE", color: "#c2410c", segments: ["All segments", "EQ", "F&O"] },
  { id: "aliceblue", name: "ALICEBLUE", color: "#1d4ed8", segments: ["All segments", "EQ", "F&O"] },
  { id: "sharekhan", name: "SHAREKHAN", color: "#0f766e", segments: ["All segments", "EQ", "F&O"] },
  { id: "fyers", name: "FYERS", color: "#111827", segments: ["All segments", "EQ", "F&O"] },
  { id: "groww", name: "GROWW", color: "#00b386", segments: ["All segments", "EQ", "F&O"] },
  { id: "incred", name: "INCRED", color: "#e11d48", segments: ["All segments", "EQ", "F&O"] },
  { id: "motilal", name: "MOTILAL", color: "#1e3a8a", segments: ["All segments", "EQ", "F&O"] },
  { id: "choice", name: "CHOICE", color: "#7c3aed", segments: ["All segments", "EQ", "F&O"] },
  { id: "delta", name: "DELTA", color: "#0891b2", segments: ["All segments", "CRYPTO"] },
  { id: "coindcx", name: "COINDCX", color: "#2563eb", segments: ["All segments", "CRYPTO"] },
  { id: "binance", name: "BINANCE", color: "#f59e0b", segments: ["All segments", "CRYPTO"] },
  { id: "paper", name: "PAPER", color: "#2f54eb", segments: ["All segments"] },
];

function knownBroker(id) {
  return CLIENT_BROKERS.some((row) => row.id === id) || catalog.some((row) => row.id === id);
}

function deskBrokerLive(id) {
  if (!id || id === "paper") return false;
  const row = publicBrokers().brokers.find((item) => item.id === id);
  return Boolean(row?.liveFeed || row?.status === "LIVE");
}

function canPlaceLiveOn(id) {
  const wanted = String(id || "").trim().toLowerCase();
  if (!wanted || wanted === "paper") return false;
  if (wanted === "dhan") return deskBrokerLive("dhan");
  return isKnownLiveBroker(wanted) && isLiveBrokerReady(wanted);
}

function rowBrokerId(row) {
  if (row?.paper || row?.brokerId === "paper") return "paper";
  return String(row?.brokerId || "dhan").trim().toLowerCase() || "dhan";
}

function rowOnBroker(row, brokerId) {
  const wanted = String(brokerId || "paper").trim().toLowerCase() || "paper";
  return rowBrokerId(row) === wanted;
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 2)}••••${raw.slice(-2)}`;
}

function asGroups(value, fallback = "ALL") {
  const rows = Array.isArray(value)
    ? value
    : String(value || fallback)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = [...new Set(rows.map((item) => String(item).trim()).filter(Boolean))];
  return unique.length ? unique : fallback ? [fallback] : [];
}

function asSegments(value) {
  const rows = Array.isArray(value) ? value : String(value || "All segments").split(",");
  const unique = [...new Set(rows.map((item) => String(item).trim()).filter(Boolean))];
  return unique.length ? unique : ["All segments"];
}

function asNotifications(value = {}) {
  return {
    instantAlerts: value.instantAlerts !== false,
    eveningPnl: Boolean(value.eveningPnl),
    whatsapp: value.whatsapp !== false,
    telegram: Boolean(value.telegram),
  };
}

export function defaultSubscriptionUntil(from = new Date()) {
  return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function emptyDesk(userId) {
  return {
    userId,
    brokerId: "paper",
    group: "ALL",
    groups: ["ALL"],
    sizingKind: "multiplier",
    sizingValue: 1,
    tradeMode: "paper",
    copy: false,
    staticIp: "",
    accountId: "",
    subscriptionMode: "copy",
    subscriptionUntil: "",
    mappedStrategy: "",
    segments: ["All segments"],
    notifications: asNotifications(),
    brokerToken: "",
    notes: "",
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
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  const subscriptionMode = SUBSCRIPTION_MODES.includes(desk.subscriptionMode) ? desk.subscriptionMode : "copy";
  const groups = asGroups(desk.groups || desk.group);
  return {
    group: groups[0] || "ALL",
    groups,
    sizingKind,
    sizingValue,
    tradeMode,
    copy: Boolean(desk.copy),
    staticIp: String(desk.staticIp || "").trim(),
    accountId: String(desk.accountId || "").trim(),
    brokerId,
    subscriptionMode,
    subscriptionUntil: String(desk.subscriptionUntil || "").trim(),
    mappedStrategy: String(desk.mappedStrategy || "").trim(),
    segments: asSegments(desk.segments),
    notifications: asNotifications(desk.notifications),
    tokenHint: maskSecret(desk.brokerToken),
    notes: String(desk.notes || "").trim(),
    margin: round2(desk.wallet?.balance || 0),
  };
}

export function peekClientSettings(userId) {
  const desk = store[userId];
  if (!desk) return normalizeClientSettings({ brokerId: "paper", wallet: { balance: 0 } });
  return normalizeClientSettings(desk);
}

export function peekClientBook(userId) {
  const desk = store[userId];
  if (!desk) {
    return { positions: [], closedTrades: [], tradeMode: "paper", segments: ["All segments"], brokerId: "paper" };
  }
  return {
    positions: Array.isArray(desk.positions) ? desk.positions : [],
    closedTrades: Array.isArray(desk.closedTrades) ? desk.closedTrades : [],
    tradeMode: desk.tradeMode === "real" ? "real" : "paper",
    segments: asSegments(desk.segments),
    brokerId: desk.brokerId || "paper",
  };
}

export function saveClientSettings(userId, patch = {}) {
  if (!userId) throw fail("Client required.");
  const desk = loadDesk(userId);
  if (patch.group != null || patch.groups != null) {
    const groups = asGroups(patch.groups != null ? patch.groups : patch.group);
    desk.groups = groups;
    desk.group = groups[0] || "ALL";
  }
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
    const nextIp = ip.toLowerCase() === "default" ? "" : ip;
    if (nextIp) {
      const broker = String(patch.brokerId || desk.brokerId || "");
      const taken = assignedEgressIps(broker, userId);
      if (taken.includes(nextIp)) throw fail("That egress IP is already assigned to another account on this broker.");
    }
    desk.staticIp = nextIp;
  }
  if (patch.accountId != null) desk.accountId = String(patch.accountId || "").trim();
  if (patch.brokerId != null) {
    const id = String(patch.brokerId || "").trim().toLowerCase();
    if (!knownBroker(id)) throw fail("Unknown broker.");
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
  if (patch.mappedStrategy != null) desk.mappedStrategy = String(patch.mappedStrategy || "").trim();
  if (patch.segments != null) desk.segments = asSegments(patch.segments);
  if (patch.notifications != null && typeof patch.notifications === "object") {
    desk.notifications = asNotifications({ ...asNotifications(desk.notifications), ...patch.notifications });
  }
  if (patch.brokerToken != null && String(patch.brokerToken).trim()) {
    desk.brokerToken = String(patch.brokerToken).trim();
  }
  if (patch.notes != null) desk.notes = String(patch.notes || "").trim();
  persist();
  return normalizeClientSettings(desk);
}

export function assignedEgressIps(brokerId, exceptUserId = "") {
  const broker = String(brokerId || "").trim();
  const taken = [];
  for (const [id, desk] of Object.entries(store)) {
    if (id === exceptUserId) continue;
    if (String(desk?.brokerId || "") !== broker) continue;
    const ip = String(desk?.staticIp || "").trim();
    if (ip) taken.push(ip);
  }
  return taken;
}

export function knownEgressIps(exceptUserId = "") {
  const rows = [];
  for (const [id, desk] of Object.entries(store)) {
    if (id === exceptUserId) continue;
    const ip = String(desk?.staticIp || "").trim();
    if (ip && !rows.includes(ip)) rows.push(ip);
  }
  return rows;
}

export function listClientGroups() {
  const groups = new Set(DEFAULT_CLIENT_GROUPS);
  groups.add("ALL");
  for (const desk of Object.values(store)) {
    for (const name of asGroups(desk?.groups || desk?.group, "")) {
      if (name) groups.add(name);
    }
  }
  return [...groups];
}

export function listDeskRecords() {
  return Object.keys(store).map((id) => ({ userId: id, ...normalizeClientSettings(store[id] || emptyDesk(id)) }));
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
  if (!knownBroker(desk.brokerId)) desk.brokerId = "paper";
  return desk;
}

export function memberBrokerCatalog(selectedId = "paper") {
  return catalog.map((row) => {
    const virtual = row.id === "paper";
    const live = deskBrokerLive(row.id);
    const selected = row.id === selectedId;
    return {
      id: row.id,
      name: row.name,
      vendor: row.vendor,
      color: row.color,
      segments: row.segments,
      virtual,
      live,
      selectable: true,
      selected,
      autoTrade: selected && !virtual,
      mode: virtual ? "paper" : live ? "live" : "desk-managed",
      note: virtual
        ? "Virtual paper book. Signals stay on the T2S desk."
        : live
          ? "Live auto trading uses the desk account. You do not enter API keys."
          : "Desk-managed. Auto trading starts on this broker when the desk is LIVE. You do not enter API keys.",
    };
  });
}

export function ensurePlanLedger({ user } = {}) {
  if (!user?.id) return null;
  return loadDesk(user.id);
}

function sameStrategy(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function liveBookForPlans(liveBook, enrollments = [], brokerId = "paper") {
  const names = new Set(
    (enrollments || [])
      .filter((row) => row.status === "paid")
      .map((row) => String(row.strategyName || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const match = (row) => names.has(String(row?.strategy || "").trim().toLowerCase()) && rowOnBroker(row, brokerId);
  if (!liveBook || !names.size) return { positions: [], orders: [], closedTrades: [] };
  return {
    positions: (liveBook.positions || []).filter(match),
    orders: (liveBook.orders || []).filter(match),
    closedTrades: (liveBook.closedTrades || []).filter(match),
  };
}

export function liveAutoTradeBrokers({ strategyName, strategyId, algoBrokerId } = {}) {
  const assigned = String(algoBrokerId || "dhan").trim().toLowerCase() || "dhan";
  const targets = new Set();
  if (assigned !== "paper") targets.add(assigned);
  const paid = listEnrollments({ admin: true }).filter((row) => {
    if (row.status !== "paid") return false;
    if (strategyId && row.strategyId === strategyId) return true;
    return sameStrategy(row.strategyName, strategyName);
  });
  for (const row of paid) {
    const desk = peekClientSettings(row.userId);
    if (desk.tradeMode !== "real") continue;
    if (desk.copy === false) continue;
    const id = String(desk.brokerId || "").trim().toLowerCase();
    if (!id || id === "paper" || id === assigned) continue;
    if (id !== "dhan" && !isKnownLiveBroker(id)) continue;
    if (!canPlaceLiveOn(id)) continue;
    targets.add(id);
  }
  return [...targets];
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

function planRows(book, enrollments = []) {
  const paid = (enrollments || []).filter((row) => row.status === "paid");
  return paid.map((row) => {
    const open = (book.positions || []).filter((item) => sameStrategy(item.strategy, row.strategyName));
    const closed = (book.closedTrades || []).filter((item) => sameStrategy(item.strategy, row.strategyName));
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

export function getMemberDesk({ user, enrollments = [], algos = [], quote, admins = [], liveBook } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = loadDesk(user.id);
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  const book = liveBookForPlans(liveBook, enrollments, brokerId);
  if (!book.positions.length && typeof quote === "function") {
    markMtm(book, quote);
  }
  const report = buildReport({
    closedTrades: book.closedTrades,
    positions: book.positions,
    orders: book.orders,
  });
  const unrealized = Number(report.unrealizedPnl || 0);
  const balance = round2(desk.wallet.balance || 0);
  const autoTrade = brokerId !== "paper" && desk.tradeMode === "real";
  return {
    wallet: {
      balance,
      mtm: unrealized,
      equity: round2(balance + unrealized),
      updatedAt: desk.wallet.updatedAt,
    },
    brokerId,
    tradeMode: autoTrade ? "real" : "paper",
    autoTrade,
    brokers: memberBrokerCatalog(brokerId),
    plans: planRows(book, enrollments),
    report,
    positions: book.positions,
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
  desk.tradeMode = wanted === "paper" ? "paper" : "real";
  desk.copy = wanted !== "paper";
  desk.positions = desk.positions.map((row) => ({ ...row, brokerId: wanted }));
  persist();
  const autoTrade = wanted !== "paper";
  return {
    brokerId: wanted,
    tradeMode: desk.tradeMode,
    autoTrade,
    brokers: memberBrokerCatalog(wanted),
  };
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
