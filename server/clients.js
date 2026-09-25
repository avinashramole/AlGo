import { catalog } from "./brokers.js";
import { adminCreateMember, adminUpdateUser, deleteRegisteredUser, getPublicUser, listPublicUsers } from "./auth.js";
import {
  assignedEgressIps,
  brokerInstallFields,
  CLIENT_BROKERS,
  defaultSubscriptionUntil,
  getMemberDesk,
  knownEgressIps,
  listClientGroups,
  listTopups,
  peekClientBook,
  peekClientSettings,
  removeDesk,
  removeOrphanDesks,
  saveClientSettings,
} from "./memberDesk.js";
import { deleteOrphanEnrollments, deleteUserEnrollments, listEnrollments } from "./subscriptions.js";
import { inventoryAddresses } from "./ipManagement.js";
import { messagingHandleForUser, removeMessagingUser, removeOrphanMessaging, upsertMessagingContact } from "./messaging.js";

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
    accountId: desk.accountId,
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
    apiKeyHint: desk.apiKeyHint,
    credentialsInstalled: Boolean(desk.credentialsInstalled),
    tokenUpdatedAt: desk.tokenUpdatedAt || "",
    brokerAccounts: desk.brokerAccounts || {},
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
    brokerApiKey: patch.brokerApiKey,
    brokerSessionToken: patch.brokerSessionToken,
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
    brokers: CLIENT_BROKERS.map((row) => ({ ...row, fields: brokerInstallFields(row.id) })),
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
  if (String(patch.brokerToken || "").trim() && !String(patch.accountId || "").trim()) {
    throw fail("Paste the client ID with the access token.");
  }
  if (tradeMode === "real" && !String(patch.accountId || "").trim()) {
    throw fail("Paste the client ID before enabling real orders.");
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
  const current = peekClientSettings(userId);
  const targetBroker = String(patch.brokerId || current.brokerId || "").trim().toLowerCase();
  const targetAccount =
    String(patch.accountId || "").trim() ||
    (targetBroker && targetBroker === current.brokerId ? String(current.accountId || "").trim() : "") ||
    String(current.brokerAccounts?.[targetBroker]?.accountId || "").trim();
  if (String(patch.brokerToken || "").trim() && !targetAccount) {
    throw fail("Paste the client ID with the access token.");
  }
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

export function knownAccountIds(users = listPublicUsers()) {
  const ids = new Set((users || []).map((row) => String(row?.id || "").trim()).filter(Boolean));
  ids.add("admin");
  return ids;
}

export function purgeOrphanMemberData(users = listPublicUsers()) {
  const known = knownAccountIds(users);
  removeOrphanDesks(known);
  deleteOrphanEnrollments(known);
  removeOrphanMessaging(known);
  return known;
}

export function deleteClient(userId, { actorId } = {}) {
  const result = deleteRegisteredUser(userId, { actorId });
  const id = result.id;
  removeDesk(id);
  removeMessagingUser(id);
  deleteUserEnrollments(id);
  purgeOrphanMemberData();
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
    closed: false,
  };
}

export function asClosedLedgerPosition(row = {}) {
  const type = String(row.type || row.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const qty = Math.abs(Number(row.qty) || 0);
  const entry = Number(row.entry ?? row.avg ?? 0);
  const exit = Number(row.exit ?? row.ltp ?? entry);
  const marked = Number(row.pnl);
  const realized = Number.isFinite(marked)
    ? round2(marked)
    : round2((exit - entry) * qty * (type === "SELL" ? -1 : 1));
  return {
    id: String(row.id || ""),
    symbol: String(row.symbol || ""),
    product: String(row.product || "MIS").toUpperCase(),
    type,
    buyQty: qty,
    buyPrice: type === "BUY" ? entry : exit,
    sellQty: qty,
    sellPrice: type === "BUY" ? exit : entry,
    netQty: 0,
    ltp: exit,
    realized,
    mtm: realized,
    paper: Boolean(row.paper || row.brokerId === "paper"),
    segment: isCryptoSymbol(row.symbol) ? "crypto" : "indian",
    strategy: String(row.strategy || ""),
    closed: true,
  };
}

function ledgerBook(openRows = [], closedTrades = []) {
  const open = (openRows || []).map(asLedgerPosition);
  const closed = (closedTrades || []).map(asClosedLedgerPosition);
  const positions = [...open, ...closed];
  return {
    positions,
    mtm: round2(positions.reduce((sum, row) => sum + Number(row.mtm || 0), 0)),
    realized: round2(closed.reduce((sum, row) => sum + Number(row.realized || 0), 0)),
    open: open.length,
  };
}

export function getClientDetail({ userId, users = [], algos = [], quote, admins = [], liveBook } = {}) {
  const user = getPublicUser(userId) || (users || []).find((row) => row.id === userId);
  if (!user?.id || user.role === "admin") throw fail("Client not found.", 404);
  const enrollments = listEnrollments({ userId: user.id });
  const desk = getMemberDesk({
    user,
    enrollments,
    algos,
    quote,
    admins,
    liveBook,
  });
  const topups = listTopups({ userId: user.id });
  const transactions = [
    ...enrollments.map((row) => ({
      id: row.id,
      kind: "subscription",
      label: row.strategyName,
      amount: row.amount,
      channel: row.channel,
      status: row.status,
      term: row.term || "",
      at: row.paidAt || row.claimedAt || row.createdAt || "",
    })),
    ...topups.map((row) => ({
      id: row.id,
      kind: "wallet",
      label: "Wallet top-up",
      amount: row.amount,
      channel: row.channel,
      status: row.status,
      term: "",
      at: row.paidAt || row.createdAt || "",
    })),
  ].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return {
    client: asClient(user, peekClientSettings(user.id), messagingHandleForUser(user.id)),
    enrollments,
    transactions,
    wallet: desk.wallet,
    plans: desk.plans,
    report: desk.report,
    positions: desk.positions,
    copyReady: Boolean(desk.copyReady),
  };
}

function isPaperLedgerRow(row) {
  return Boolean(row?.paper || row?.brokerId === "paper");
}

function asBrokerClosedLeg(row = {}) {
  const realized = round2(row.realized);
  const leg = asClosedLedgerPosition({ ...row, pnl: Number.isFinite(Number(row.realized)) ? row.realized : row.pnl });
  return {
    ...leg,
    realized,
    mtm: round2(row.pnl != null ? row.pnl : realized),
    closed: true,
    paper: false,
    brokerBook: true,
  };
}

function asBrokerOpenLeg(row = {}) {
  const leg = asLedgerPosition({
    ...row,
    avg: row.avg || row.entry,
    ltp: row.ltp || row.exit || row.avg,
    pnl: row.pnl,
    realized: row.realized,
  });
  return {
    ...leg,
    mtm: round2(row.pnl),
    realized: round2(row.realized),
    closed: false,
    paper: false,
    brokerBook: true,
  };
}

function applyBrokerBookToLedger(ledger, brokerBook) {
  const paperRows = (ledger.positions || []).filter(isPaperLedgerRow);
  const paperMtm = round2(paperRows.reduce((sum, row) => sum + Number(row.mtm || 0), 0));
  const brokerRows = [
    ...(brokerBook.open || []).map(asBrokerOpenLeg),
    ...(brokerBook.closed || []).map(asBrokerClosedLeg),
  ];
  const mtm = round2(paperMtm + Number(brokerBook.mtm));
  return {
    ...ledger,
    positions: [...paperRows, ...brokerRows],
    mtm,
    brokerMtm: mtm,
    realized: round2(brokerBook.realizedPnl),
    open: paperRows.filter((row) => !row.closed).length + (brokerBook.open || []).length,
    tradeMode: "real",
  };
}

export function applyBrokerBooksToDesk(desk, booksByUserId = {}) {
  if (!desk) return desk;
  const clients = (desk.clients || []).map((client) => {
    const book = booksByUserId?.[client.id];
    if (!book || !Number.isFinite(Number(book.mtm))) return client;
    return applyBrokerBookToLedger(client, book);
  });
  const clientMtm = round2(clients.reduce((sum, row) => sum + Number(row.mtm || 0), 0));
  const masterMtm = Number(desk.masterMtm ?? desk.master?.mtm ?? 0);
  return {
    ...desk,
    clients,
    clientMtm,
    totalMtm: round2(masterMtm + clientMtm),
  };
}

export function listPositionDesk(users = [], masterPositions = [], masterClosed = [], brokerBook = null) {
  const useBroker = brokerBook && Number.isFinite(Number(brokerBook.mtm));
  const localClosed = useBroker ? (masterClosed || []).filter(isPaperLedgerRow) : masterClosed;
  const masterBook = ledgerBook(masterPositions, localClosed);
  if (useBroker) {
    const brokerClosed = (brokerBook.closed || []).map(asBrokerClosedLeg);
    const paperMtm = ledgerBook(
      (masterPositions || []).filter(isPaperLedgerRow),
      (masterClosed || []).filter(isPaperLedgerRow),
    ).mtm;
    masterBook.positions = [...masterBook.positions, ...brokerClosed];
    masterBook.mtm = round2(paperMtm + Number(brokerBook.mtm));
    masterBook.realized = round2(brokerBook.realizedPnl);
    masterBook.brokerMtm = masterBook.mtm;
  }
  const master = {
    id: "master",
    name: "Master",
    kind: "master",
    title: "Master",
    subtitle: "PRIMARY MASTER ACCOUNT",
    tradeMode: masterBook.positions.some((row) => !row.paper) ? "real" : "paper",
    ...masterBook,
  };
  const clients = listClients(users).map((client) => {
    const book = peekClientBook(client.id);
    return {
      id: client.id,
      name: client.name,
      kind: "client",
      title: client.name,
      subtitle: "CLIENT ACCOUNT",
      tradeMode: client.tradeMode,
      ...ledgerBook(book.positions, book.closedTrades),
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
