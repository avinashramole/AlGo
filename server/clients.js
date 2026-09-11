import { catalog } from "./brokers.js";
import { adminCreateMember, adminUpdateUser, deleteRegisteredUser, getPublicUser } from "./auth.js";
import {
  assignedEgressIps,
  CLIENT_BROKERS,
  defaultSubscriptionUntil,
  knownEgressIps,
  listClientGroups,
  peekClientBook,
  peekClientSettings,
  removeDesk,
  saveClientSettings,
} from "./memberDesk.js";
import { inventoryAddresses } from "./ipManagement.js";
import { messagingHandleForUser, removeMessagingUser, upsertMessagingContact } from "./messaging.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function brokerLabel(id) {
  const row = CLIENT_BROKERS.find((item) => item.id === id) || catalog.find((item) => item.id === id);
  return String(row?.name || id || "PAPER").toUpperCase();
}

function asClient(user, desk, handle = {}) {
  const paper = !desk.brokerId || desk.brokerId === "paper";
  const broker = CLIENT_BROKERS.find((row) => row.id === desk.brokerId) || catalog.find((row) => row.id === desk.brokerId);
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    mobile: user.mobile || handle.mobile || "",
    telegramId: handle.telegramId || "",
    group: desk.group,
    groups: desk.groups || [desk.group || "ALL"],
    brokerId: desk.brokerId,
    brokerName: brokerLabel(desk.brokerId),
    brokerColor: broker?.color || "#64748b",
    accountId: paper ? "" : desk.accountId,
    linked: !paper,
    sizingKind: desk.sizingKind,
    sizingValue: desk.sizingValue,
    tradeMode: desk.tradeMode,
    copy: desk.copy,
    staticIp: desk.staticIp,
    status: desk.tradeMode === "real" ? "LIVE" : "PAPER ONLY",
    subscriptionMode: desk.subscriptionMode,
    subscriptionUntil: desk.subscriptionUntil,
    mappedStrategy: desk.mappedStrategy,
    segments: desk.segments,
    notifications: desk.notifications,
    tokenHint: desk.tokenHint,
    notes: desk.notes,
    margin: desk.margin,
    createdAt: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || "",
  };
}

function settingsPatch(patch = {}) {
  return {
    copy: patch.copy,
    brokerId: patch.brokerId,
    accountId: patch.accountId,
    sizingKind: patch.sizingKind,
    sizingValue: patch.sizingValue,
    tradeMode: patch.tradeMode,
    subscriptionMode: patch.subscriptionMode,
    subscriptionUntil: patch.subscriptionUntil,
    group: patch.group,
    groups: patch.groups,
    mappedStrategy: patch.mappedStrategy,
    segments: patch.segments,
    notifications: patch.notifications,
    brokerToken: patch.brokerToken,
    notes: patch.notes,
    staticIp: patch.staticIp,
  };
}

export function listClients(users = []) {
  return (users || [])
    .filter((row) => row && row.id && row.role !== "admin")
    .map((user) => asClient(user, peekClientSettings(user.id), messagingHandleForUser(user.id)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export function clientStatus(users = []) {
  const clients = listClients(users);
  const assignedIps = {};
  for (const broker of CLIENT_BROKERS) {
    assignedIps[broker.id] = assignedEgressIps(broker.id);
  }
  return {
    clients,
    groups: listClientGroups(),
    brokers: CLIENT_BROKERS,
    assignedIps,
    knownIps: [...new Set([...inventoryAddresses(), ...knownEgressIps()])],
    defaultUntil: defaultSubscriptionUntil(),
    live: clients.filter((row) => row.status === "LIVE").length,
    paper: clients.filter((row) => row.status !== "LIVE").length,
  };
}

export function createClient(patch = {}) {
  const brokerId = String(patch.brokerId || "dhan").trim().toLowerCase() || "dhan";
  const tradeMode = String(patch.tradeMode || "paper").trim().toLowerCase() === "real" ? "real" : "paper";
  if (tradeMode === "real" && (brokerId === "paper" || !brokerId)) {
    throw fail("Add a broker before enabling real orders. New clients stay PAPER.");
  }
  if (tradeMode === "real" && !String(patch.brokerToken || "").trim()) {
    throw fail("Paste the broker access token before enabling real orders.");
  }
  const user = adminCreateMember({
    name: patch.name,
    mobile: patch.mobile,
    email: patch.email,
  });
  saveClientSettings(user.id, {
    ...settingsPatch(patch),
    copy: patch.copy == null ? true : Boolean(patch.copy),
    brokerId,
    sizingKind: patch.sizingKind || "multiplier",
    sizingValue: patch.sizingValue == null ? 1 : patch.sizingValue,
    tradeMode,
    subscriptionMode: patch.subscriptionMode || "copy",
    subscriptionUntil: patch.subscriptionUntil || defaultSubscriptionUntil(),
    groups: patch.groups || patch.group || "ALL",
  });
  const mobile = String(user.mobile || "").trim();
  const telegramId = String(patch.telegramId || "").trim();
  if (mobile || telegramId) {
    upsertMessagingContact({
      id: user.id,
      userId: user.id,
      name: user.name,
      mobile,
      telegramId,
      broker: brokerLabel(peekClientSettings(user.id).brokerId),
    });
  }
  return asClient(user, peekClientSettings(user.id), messagingHandleForUser(user.id));
}

export function saveClient(userId, patch = {}) {
  const existing = getPublicUser(userId);
  if (!existing) throw fail("Client not found.", 404);
  if (existing.role === "admin") throw fail("Desk admins are not edited on All clients.");
  if (patch.name != null || patch.mobile != null) {
    adminUpdateUser(userId, {
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.mobile != null ? { mobile: patch.mobile } : {}),
    });
  }
  saveClientSettings(userId, settingsPatch(patch));
  const next = getPublicUser(userId);
  const handle = messagingHandleForUser(userId);
  const telegramId = patch.telegramId != null ? String(patch.telegramId).trim() : handle.telegramId;
  const mobile = patch.mobile != null ? String(next.mobile || "").trim() : handle.mobile || next.mobile;
  if (telegramId || mobile) {
    upsertMessagingContact({
      id: userId,
      userId,
      name: next.name,
      mobile,
      telegramId,
      broker: brokerLabel(peekClientSettings(userId).brokerId),
    });
  }
  return asClient(next, peekClientSettings(userId), messagingHandleForUser(userId));
}

export function deleteClient(userId, { actorId } = {}) {
  const result = deleteRegisteredUser(userId, { actorId });
  removeDesk(userId);
  removeMessagingUser(userId);
  return result;
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function isCryptoSymbol(symbol) {
  return /BTC|ETH|USDT|USDC|CRYPTO|BINANCE|DOGE|SOL/i.test(String(symbol || ""));
}

export function asLedgerPosition(row = {}) {
  const type = String(row.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const qty = Math.abs(Number(row.qty) || 0);
  const avg = Number(row.avg) || 0;
  const ltp = Number(row.ltp) || avg;
  const marked = Number(row.pnl);
  const mtm = Number.isFinite(marked) ? marked : (ltp - avg) * qty * (type === "SELL" ? -1 : 1);
  return {
    id: String(row.id || ""),
    symbol: String(row.symbol || ""),
    product: String(row.product || "MIS").toUpperCase(),
    type,
    buyQty: type === "BUY" ? qty : 0,
    buyPrice: type === "BUY" ? avg : 0,
    sellQty: type === "SELL" ? qty : 0,
    sellPrice: type === "SELL" ? avg : 0,
    netQty: type === "SELL" ? -qty : qty,
    ltp,
    realized: round2(row.realized),
    mtm: round2(mtm),
    paper: Boolean(row.paper || row.brokerId === "paper"),
    segment: isCryptoSymbol(row.symbol) ? "crypto" : "indian",
    strategy: String(row.strategy || ""),
  };
}

function bookTotals(positions = [], closedTrades = []) {
  const rows = positions || [];
  return {
    positions: rows,
    mtm: round2(rows.reduce((sum, row) => sum + Number(row.mtm || 0), 0)),
    realized: round2((closedTrades || []).reduce((sum, row) => sum + Number(row.pnl || 0), 0)),
    open: rows.length,
  };
}

export function listPositionDesk(users = [], masterPositions = [], masterClosed = []) {
  const masterRows = (masterPositions || []).map(asLedgerPosition);
  const master = {
    id: "master",
    name: "Master",
    kind: "master",
    title: "Master",
    subtitle: "PRIMARY MASTER ACCOUNT",
    tradeMode: masterRows.some((row) => !row.paper) ? "real" : "paper",
    ...bookTotals(masterRows, masterClosed),
  };
  const clients = listClients(users).map((client) => {
    const book = peekClientBook(client.id);
    const positions = (book.positions || []).map(asLedgerPosition);
    return {
      id: client.id,
      name: client.name,
      kind: "client",
      title: client.name,
      subtitle: "CLIENT ACCOUNT",
      tradeMode: client.tradeMode,
      ...bookTotals(positions, book.closedTrades),
    };
  });
  return {
    master,
    clients,
    masterMtm: master.mtm,
    clientMtm: round2(clients.reduce((sum, row) => sum + Number(row.mtm || 0), 0)),
    totalMtm: round2(master.mtm + clients.reduce((sum, row) => sum + Number(row.mtm || 0), 0)),
    openPositions: master.open + clients.reduce((sum, row) => sum + Number(row.open || 0), 0),
  };
}
