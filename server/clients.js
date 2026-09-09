import { catalog } from "./brokers.js";
import { adminUpdateUser, deleteRegisteredUser, getPublicUser } from "./auth.js";
import { listClientGroups, peekClientSettings, removeDesk, saveClientSettings } from "./memberDesk.js";
import { messagingHandleForUser, removeMessagingUser, upsertMessagingContact } from "./messaging.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const BROKER_LABEL = {
  dhan: "DHAN",
  zerodha: "ZERODHA",
  kotak: "KOTAK",
  fyers: "FYERS",
  paper: "PAPER",
};

export function brokerLabel(id) {
  return BROKER_LABEL[id] || String(id || "PAPER").toUpperCase();
}

function asClient(user, desk, handle = {}) {
  const paper = !desk.brokerId || desk.brokerId === "paper";
  const broker = catalog.find((row) => row.id === desk.brokerId) || catalog.find((row) => row.id === "paper");
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    mobile: handle.mobile || user.mobile || "",
    telegramId: handle.telegramId || "",
    group: desk.group,
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
    margin: desk.margin,
    createdAt: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || "",
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
  return {
    clients,
    groups: listClientGroups(),
    live: clients.filter((row) => row.status === "LIVE").length,
    paper: clients.filter((row) => row.status !== "LIVE").length,
  };
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
  saveClientSettings(userId, patch);
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
