import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, isKnownLiveBroker, isLiveBrokerReady, publicBrokers } from "./brokers.js";
import { buildReport } from "./desk.js";
import { LIVE_BROKER_CATALOG } from "./liveBrokers.js";
import { buildCopyAlertText, queueMemberCopyNotify } from "./copyNotify.js";
import { buildUpiLinks, enrollmentActive, listEnrollments, publicPayments } from "./subscriptions.js";

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
  try {
    writeStore(store);
  } catch (error) {
    console.log(`Could not save client ID / access token: ${error.message || error}`);
    throw fail("Could not save client ID and access token.");
  }
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
  return `${raw.slice(0, 2)}••••${raw.slice(-4)}`;
}

function enableLiveCopyFromToken(desk, patch = {}) {
  if (!desk?.brokerId || desk.brokerId === "paper") return;
  if (patch.tradeMode == null) desk.tradeMode = "real";
  if (patch.copy == null) desk.copy = true;
  if (patch.subscriptionUntil == null && !String(desk.subscriptionUntil || "").trim()) {
    desk.subscriptionUntil = defaultSubscriptionUntil();
  }
}

function writeBrokerToken(desk, token) {
  const next = String(token || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!next) return false;
  desk.brokerToken = next;
  desk.brokerTokenUpdatedAt = new Date().toISOString();
  return true;
}

function emptyBrokerAccount() {
  return { accountId: "", brokerToken: "", brokerApiKey: "", brokerSessionToken: "", tokenUpdatedAt: "" };
}

function brokerAccountsMap(desk = {}) {
  const raw = desk.brokerAccounts && typeof desk.brokerAccounts === "object" && !Array.isArray(desk.brokerAccounts) ? desk.brokerAccounts : {};
  const next = {};
  for (const [id, row] of Object.entries(raw)) {
    const brokerId = String(id || "").trim().toLowerCase();
    if (!brokerId || brokerId === "paper" || !knownBroker(brokerId)) continue;
    next[brokerId] = {
      accountId: String(row?.accountId || "").trim(),
      brokerToken: String(row?.brokerToken || "").trim(),
      brokerApiKey: String(row?.brokerApiKey || "").trim(),
      brokerSessionToken: String(row?.brokerSessionToken || "").trim(),
      tokenUpdatedAt: String(row?.tokenUpdatedAt || "").trim(),
    };
  }
  return next;
}

function snapshotSelectedBrokerAccount(desk) {
  return {
    accountId: String(desk.accountId || "").trim(),
    brokerToken: String(desk.brokerToken || "").trim(),
    brokerApiKey: String(desk.brokerApiKey || "").trim(),
    brokerSessionToken: String(desk.brokerSessionToken || "").trim(),
    tokenUpdatedAt: String(desk.brokerTokenUpdatedAt || "").trim(),
  };
}

function syncSelectedBrokerAccount(desk) {
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  desk.brokerAccounts = brokerAccountsMap(desk);
  if (!brokerId || brokerId === "paper") return desk.brokerAccounts;
  desk.brokerAccounts[brokerId] = snapshotSelectedBrokerAccount(desk);
  return desk.brokerAccounts;
}

function migrateLegacyBrokerAccount(desk) {
  desk.brokerAccounts = brokerAccountsMap(desk);
  if (Object.keys(desk.brokerAccounts).length) return;
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  if (!brokerId || brokerId === "paper") return;
  const snap = snapshotSelectedBrokerAccount(desk);
  if (snap.accountId || snap.brokerToken || snap.brokerApiKey || snap.brokerSessionToken) {
    desk.brokerAccounts[brokerId] = snap;
  }
}

function slotCopiedFromAnotherBroker(map, brokerId) {
  const slot = map[brokerId];
  if (!slot || (!slot.accountId && !slot.brokerToken)) return false;
  return Object.entries(map).some(([id, other]) => {
    if (id === brokerId) return false;
    const sameId = slot.accountId && slot.accountId === other.accountId;
    const sameToken = slot.brokerToken && slot.brokerToken === other.brokerToken;
    return Boolean(sameId || sameToken);
  });
}

function slotTokenCopiedFromAnotherBroker(map, brokerId) {
  const slot = map[brokerId];
  if (!slot?.brokerToken) return false;
  return Object.entries(map).some(([id, other]) => {
    if (id === brokerId) return false;
    return Boolean(slot.brokerToken && other.brokerToken && slot.brokerToken === other.brokerToken);
  });
}

function selectedBrokerAccount(desk = {}) {
  const map = brokerAccountsMap(desk);
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  if (!brokerId || brokerId === "paper") return emptyBrokerAccount();
  const slot = map[brokerId] || emptyBrokerAccount();
  if (slotCopiedFromAnotherBroker(map, brokerId)) {
    return { ...slot, accountId: "" };
  }
  if (slot.accountId || slot.brokerToken) return slot;
  const snap = snapshotSelectedBrokerAccount(desk);
  if (snap.accountId || snap.brokerToken) return snap;
  return slot;
}

function hydrateBrokerAccount(desk, brokerId) {
  const id = String(brokerId || "").trim().toLowerCase();
  desk.brokerAccounts = brokerAccountsMap(desk);
  if (!id || id === "paper" || !knownBroker(id)) {
    desk.accountId = "";
    desk.brokerToken = "";
    desk.brokerApiKey = "";
    desk.brokerSessionToken = "";
    desk.brokerTokenUpdatedAt = "";
    return;
  }
  const slot = desk.brokerAccounts[id] || emptyBrokerAccount();
  const copied = slotCopiedFromAnotherBroker(desk.brokerAccounts, id);
  desk.accountId = copied ? "" : slot.accountId;
  desk.brokerToken = slot.brokerToken;
  desk.brokerApiKey = slot.brokerApiKey;
  desk.brokerSessionToken = slot.brokerSessionToken;
  desk.brokerTokenUpdatedAt = slot.tokenUpdatedAt;
}

function switchDeskBroker(desk, brokerId) {
  const wanted = String(brokerId || "").trim().toLowerCase();
  if (!knownBroker(wanted)) throw fail("Unknown broker.");
  migrateLegacyBrokerAccount(desk);
  syncSelectedBrokerAccount(desk);
  desk.brokerId = wanted;
  hydrateBrokerAccount(desk, wanted);
  return wanted;
}

export function publicBrokerAccounts(desk = {}) {
  const map = brokerAccountsMap(desk);
  const selected = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  if (selected && selected !== "paper") {
    const snap = snapshotSelectedBrokerAccount(desk);
    if (!map[selected] && (snap.accountId || snap.brokerToken || snap.brokerApiKey)) {
      map[selected] = snap;
    }
  }
  const out = {};
  for (const [id, slot] of Object.entries(map)) {
    if (!slot.accountId && !slot.brokerToken && !slot.brokerApiKey) continue;
    const copied = slotCopiedFromAnotherBroker(map, id);
    out[id] = {
      accountId: copied ? "" : slot.accountId,
      tokenHint: maskSecret(slot.brokerToken),
      apiKeyHint: maskSecret(slot.brokerApiKey),
      sessionHint: maskSecret(slot.brokerSessionToken),
      installed: Boolean(slot.brokerToken),
      oauthReady: Boolean(slot.brokerApiKey && slot.brokerSessionToken),
      tokenUpdatedAt: slot.tokenUpdatedAt,
    };
  }
  return out;
}

export function peekBrokerAccount(userId, brokerId) {
  const desk = store[userId] || emptyDesk(userId);
  migrateLegacyBrokerAccount(desk);
  const id = String(brokerId || desk.brokerId || "").trim().toLowerCase();
  if (!id || id === "paper") return emptyBrokerAccount();
  return desk.brokerAccounts[id] || emptyBrokerAccount();
}

export function brokerAccountForLiveCopy(userId, brokerId) {
  const desk = store[userId] || emptyDesk(userId);
  migrateLegacyBrokerAccount(desk);
  const id = String(brokerId || desk.brokerId || "").trim().toLowerCase();
  if (!id || id === "paper") return { ...emptyBrokerAccount(), leftoverToken: false };
  const map = brokerAccountsMap(desk);
  const leftoverToken = slotTokenCopiedFromAnotherBroker(map, id);
  const slot = map[id] || emptyBrokerAccount();
  if (leftoverToken) {
    return {
      ...emptyBrokerAccount(),
      leftoverToken: true,
      brokerApiKey: slot.brokerApiKey,
      brokerSessionToken: slot.brokerSessionToken,
    };
  }
  return { ...slot, leftoverToken: false };
}

export function listUpstoxOauthTargets() {
  const out = [];
  for (const userId of Object.keys(store)) {
    const desk = store[userId] || {};
    const slot = peekBrokerAccount(userId, "upstox");
    const apiKey = String(slot.brokerApiKey || "").trim() || (desk.brokerId === "upstox" ? String(desk.brokerApiKey || "").trim() : "");
    const apiSecret = String(slot.brokerSessionToken || "").trim() || (desk.brokerId === "upstox" ? String(desk.brokerSessionToken || "").trim() : "");
    if (apiKey.length < 8 || apiSecret.length < 8) continue;
    const leftover = Boolean(brokerAccountForLiveCopy(userId, "upstox").leftoverToken);
    const token = leftover ? "" : String(slot.brokerToken || (desk.brokerId === "upstox" ? desk.brokerToken : "") || "").trim();
    out.push({
      userId,
      accountId: leftover ? "" : String(slot.accountId || (desk.brokerId === "upstox" ? desk.accountId : "") || "").trim(),
      hasTradingToken: Boolean(token),
      tokenUpdatedAt: leftover ? "" : String(slot.tokenUpdatedAt || (desk.brokerId === "upstox" ? desk.brokerTokenUpdatedAt : "") || "").trim(),
    });
  }
  return out;
}

export function noteMemberUpstoxTokenAsk(userId, { text } = {}) {
  if (!userId) return null;
  const desk = loadDesk(userId);
  const message = String(text || "Approve today's Upstox trading token in the Upstox app or WhatsApp notification.").trim();
  const alert = {
    id: `ut${crypto.randomBytes(6).toString("hex")}`,
    kind: "upstox_token",
    text: message,
    brokerId: "upstox",
    createdAt: new Date().toISOString(),
  };
  desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
  desk.alerts.unshift(alert);
  if (desk.alerts.length > 40) desk.alerts = desk.alerts.slice(0, 40);
  queueMemberCopyNotify({
    userId,
    text: message,
    notifications: asNotifications(desk.notifications),
  });
  persist();
  return alert;
}

export function findUserIdByUpstoxApiKey(apiKey) {
  const wanted = String(apiKey || "").trim();
  if (!wanted) return "";
  for (const userId of Object.keys(store)) {
    const slot = peekBrokerAccount(userId, "upstox");
    if (String(slot.brokerApiKey || "").trim() === wanted) return userId;
    const desk = store[userId];
    if (String(desk?.brokerId || "") === "upstox" && String(desk?.brokerApiKey || "").trim() === wanted) return userId;
  }
  return "";
}

export function saveMemberUpstoxAccessToken(userId, { accessToken, accountId, expiresAt } = {}) {
  const token = String(accessToken || "").trim();
  if (!userId || !token) throw fail("Upstox access token is missing.");
  const desk = loadDesk(userId);
  if (desk.brokerId !== "upstox") switchDeskBroker(desk, "upstox");
  else syncSelectedBrokerAccount(desk);
  if (accountId && !String(desk.accountId || "").trim()) desk.accountId = String(accountId).trim();
  writeBrokerToken(desk, token);
  if (expiresAt) desk.brokerTokenExpiresAt = String(expiresAt);
  desk.tradeMode = "real";
  syncSelectedBrokerAccount(desk);
  persist();
  return { ok: true, userId, install: publicBrokerInstall(desk) };
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
    brokerApiKey: "",
    brokerSessionToken: "",
    brokerAccounts: {},
    notes: "",
    wallet: { balance: 0, updatedAt: new Date().toISOString() },
    topups: [],
    positions: [],
    closedTrades: [],
    orders: [],
    alerts: [],
    seededPlans: [],
  };
}

function publicAlerts(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: String(row.id || ""),
      kind: String(row.kind || "copy_order"),
      text: String(row.text || ""),
      symbol: String(row.symbol || ""),
      side: row.side === "SELL" ? "SELL" : "BUY",
      qty: Number(row.qty || 0),
      status: String(row.status || ""),
      strategy: String(row.strategy || ""),
      brokerId: String(row.brokerId || ""),
      createdAt: String(row.createdAt || ""),
    }))
    .filter((row) => row.id && row.text)
    .slice(0, 40);
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
    accountId: selectedBrokerAccount(desk).accountId,
    brokerId,
    subscriptionMode,
    subscriptionUntil: String(desk.subscriptionUntil || "").trim(),
    mappedStrategy: String(desk.mappedStrategy || "").trim(),
    segments: asSegments(desk.segments),
    notifications: asNotifications(desk.notifications),
    tokenHint: maskSecret(desk.brokerToken),
    apiKeyHint: maskSecret(desk.brokerApiKey),
    credentialsInstalled: Boolean(String(desk.brokerToken || "").trim()),
    tokenUpdatedAt: String(desk.brokerTokenUpdatedAt || "").trim(),
    brokerAccounts: publicBrokerAccounts(desk),
    notes: String(desk.notes || "").trim(),
    margin: round2(desk.wallet?.balance || 0),
  };
}

export function brokerInstallFields(brokerId) {
  const id = String(brokerId || "").trim().toLowerCase();
  if (!id || id === "paper") return [];
  const meta = LIVE_BROKER_CATALOG.find((row) => row.id === id);
  const fields = Array.isArray(meta?.fields) && meta.fields.length
    ? meta.fields
    : [
        { id: "clientId", label: "Client ID", placeholder: "Broker client id" },
        { id: "apiKey", label: "API key", placeholder: "API key" },
        { id: "accessToken", label: "Access token", secret: true, placeholder: "Access token" },
      ];
  return fields.map((row) => ({
    id: row.id,
    label: row.label,
    secret: Boolean(row.secret),
    placeholder: row.placeholder || "",
  }));
}

export function publicBrokerInstall(desk = {}) {
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  return {
    brokerId,
    accountId: selectedBrokerAccount(desk).accountId,
    tokenHint: maskSecret(desk.brokerToken),
    apiKeyHint: maskSecret(desk.brokerApiKey),
    sessionHint: maskSecret(desk.brokerSessionToken),
    hasApiKey: Boolean(String(desk.brokerApiKey || "").trim()),
    hasApiSecret: Boolean(String(desk.brokerSessionToken || "").trim()),
    oauthReady: Boolean(String(desk.brokerApiKey || "").trim() && String(desk.brokerSessionToken || "").trim()),
    installed: Boolean(String(desk.brokerToken || "").trim()),
    tokenUpdatedAt: String(desk.brokerTokenUpdatedAt || "").trim(),
    fields: brokerInstallFields(brokerId),
    help:
      brokerId === "paper"
        ? "Paper is virtual. No API key or access token."
        : brokerId === "upstox"
          ? "Store API key + API secret from the Upstox developer app. At 8:00 AM IST we ask Upstox for today's trading token — approve the app / WhatsApp notification. You can also tap Get today's trading token. Do not paste the Analytics token. Set the app notifier URL to this site /api/upstox/token."
          : "Each broker keeps its own client ID and access token. Saving DHAN does not overwrite UPSTOX. This does not start desk LIVE.",
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
  if (patch.copy != null) {
    desk.copy = Boolean(patch.copy);
    if (desk.copy && !String(desk.subscriptionUntil || "").trim()) {
      desk.subscriptionUntil = defaultSubscriptionUntil();
    }
  }
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
  if (patch.brokerId != null) {
    const id = String(patch.brokerId || "").trim().toLowerCase();
    if (!knownBroker(id)) throw fail("Unknown broker.");
    if (id !== desk.brokerId) switchDeskBroker(desk, id);
  }
  if (patch.accountId != null) desk.accountId = String(patch.accountId || "").trim();
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
  const tokenWritten = writeBrokerToken(desk, patch.brokerToken);
  if (patch.brokerApiKey != null && String(patch.brokerApiKey).trim()) {
    desk.brokerApiKey = String(patch.brokerApiKey).trim();
  }
  if (patch.brokerSessionToken != null && String(patch.brokerSessionToken).trim()) {
    desk.brokerSessionToken = String(patch.brokerSessionToken).trim();
  }
  if (patch.notes != null) desk.notes = String(patch.notes || "").trim();
  if (tokenWritten) enableLiveCopyFromToken(desk, patch);
  syncSelectedBrokerAccount(desk);
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
  desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
  desk.seededPlans = Array.isArray(desk.seededPlans) ? desk.seededPlans : [];
  if (!desk.wallet || typeof desk.wallet !== "object") desk.wallet = { balance: 0, updatedAt: new Date().toISOString() };
  if (!knownBroker(desk.brokerId)) desk.brokerId = "paper";
  migrateLegacyBrokerAccount(desk);
  return desk;
}

export function memberBrokerCatalog(selectedId = "paper", desk = {}) {
  const accounts = publicBrokerAccounts(desk);
  return catalog.map((row) => {
    const virtual = row.id === "paper";
    const live = deskBrokerLive(row.id);
    const selected = row.id === selectedId;
    const saved = accounts[row.id] || {};
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
      installed: Boolean(saved.installed),
      oauthReady: Boolean(saved.oauthReady),
      accountId: saved.accountId || "",
      mode: virtual ? "paper" : live ? "live" : "desk-managed",
      note: virtual
        ? "Virtual paper book. Signals stay on the T2S desk."
        : saved.installed
          ? `This user's ${row.name} token is saved${saved.accountId ? ` · ${saved.accountId}` : ""}. Select it to update the ID or token.`
          : saved.oauthReady
            ? `API key and secret saved for ${row.name}. Generate today's trading token.`
            : "Install this broker's own client ID and access token. It stays saved when you switch to another broker.",
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
      .filter((row) => enrollmentActive(row))
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

export function liveAutoTradeBrokers({ algoBrokerId } = {}) {
  const assigned = String(algoBrokerId || "dhan").trim().toLowerCase() || "dhan";
  if (assigned === "paper") return [];
  return [assigned];
}

export function peekClientSecrets(userId) {
  const desk = store[userId] || emptyDesk(userId);
  return {
    userId,
    ...normalizeClientSettings(desk),
    brokerToken: String(desk.brokerToken || "").trim(),
    brokerApiKey: String(desk.brokerApiKey || "").trim(),
    brokerSessionToken: String(desk.brokerSessionToken || "").trim(),
  };
}

export function sizeCopyQty(masterQty, { sizingKind, sizingValue, lotSize } = {}) {
  const master = Math.max(0, Math.round(Number(masterQty) || 0));
  const size = Number(sizingValue);
  const lot = Math.max(1, Math.round(Number(lotSize) || master || 1));
  if (sizingKind === "fixed") return Math.max(1, Math.round(Number.isFinite(size) && size >= 1 ? size : 1));
  if (sizingKind === "lots") return Math.max(1, Math.round(lot * (Number.isFinite(size) && size > 0 ? size : 1)));
  const mult = Number.isFinite(size) && size > 0 ? size : 1;
  return Math.max(1, Math.round((master || lot) * mult));
}

export function recordMemberCopyFill({ userId, payload = {}, live, error, paper = false } = {}) {
  if (!userId) return null;
  const desk = loadDesk(userId);
  const now = new Date().toISOString();
  const qty = Math.max(1, Math.round(Number(payload.qty) || 1));
  const price = Number(live?.price || payload.price || 0);
  const side = payload.side === "SELL" ? "SELL" : "BUY";
  const brokerId = String(payload.brokerId || desk.brokerId || "paper");
  const status = error ? "REJECTED" : paper || !live ? "FILLED" : String(live.status || "PENDING").toUpperCase();
  const mapped = status === "TRANSIT" || status === "OPEN" ? "PENDING" : status === "TRADED" ? "FILLED" : status;
  const order = {
    id: live?.orderId ? String(live.orderId) : `mo${crypto.randomBytes(6).toString("hex")}`,
    userId,
    symbol: payload.symbol || "",
    side,
    qty,
    filledQty: mapped === "FILLED" ? qty : Number(live?.filledQty || 0),
    price,
    status: mapped,
    strategy: payload.strategy || "",
    brokerId,
    paper: Boolean(paper),
    live: Boolean(live?.orderId) && !paper,
    reason: error ? String(error.message || error) : "",
    createdAt: now,
  };
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.positions = Array.isArray(desk.positions) ? desk.positions : [];
  desk.closedTrades = Array.isArray(desk.closedTrades) ? desk.closedTrades : [];
  desk.orders.unshift(order);
  const alert = {
    id: `na${crypto.randomBytes(6).toString("hex")}`,
    kind: error ? "copy_rejected" : "copy_order",
    text: buildCopyAlertText({
      side,
      qty,
      symbol: order.symbol,
      strategy: order.strategy,
      status: mapped,
      error,
    }),
    symbol: order.symbol,
    side,
    qty,
    status: mapped,
    strategy: order.strategy,
    brokerId,
    createdAt: now,
  };
  desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
  desk.alerts.unshift(alert);
  if (desk.alerts.length > 40) desk.alerts = desk.alerts.slice(0, 40);
  queueMemberCopyNotify({
    userId,
    text: alert.text,
    notifications: asNotifications(desk.notifications),
  });
  if (!error && (paper || mapped === "FILLED" || mapped === "PENDING")) {
    applyMemberPosition(desk, {
      symbol: order.symbol,
      side,
      qty,
      price: price || Number(payload.price || 0),
      strategy: order.strategy,
      brokerId,
      paper,
      openedAt: now,
    });
  }
  persist();
  return order;
}

function applyMemberPosition(desk, fill) {
  const price = Number(fill.price || 0);
  if (fill.side === "SELL") {
    const open = desk.positions.find(
      (row) => sameStrategy(row.symbol, fill.symbol) && String(row.strategy || "") === String(fill.strategy || "") && row.type !== "SELL",
    );
    if (open) {
      const closeQty = Math.min(Number(open.qty || 0), Number(fill.qty || 0));
      const pnl = round2((price - Number(open.avg || 0)) * closeQty);
      desk.closedTrades.unshift({
        id: `mt${crypto.randomBytes(6).toString("hex")}`,
        sourcePositionId: open.id,
        symbol: fill.symbol,
        side: open.type || "BUY",
        type: open.type || "BUY",
        qty: closeQty,
        entry: Number(open.avg || 0),
        exit: price,
        pnl,
        product: open.product || "MIS",
        strategy: fill.strategy,
        brokerId: fill.brokerId,
        paper: Boolean(fill.paper),
        live: !fill.paper,
        closedAt: fill.openedAt,
      });
      open.qty = Number(open.qty || 0) - closeQty;
      if (open.qty <= 0) desk.positions = desk.positions.filter((row) => row !== open);
      return;
    }
  }
  desk.positions.unshift({
    id: `mp${crypto.randomBytes(6).toString("hex")}`,
    symbol: fill.symbol,
    type: fill.side,
    qty: fill.qty,
    avg: price,
    ltp: price,
    pnl: 0,
    strategy: fill.strategy,
    brokerId: fill.brokerId,
    paper: Boolean(fill.paper),
    live: !fill.paper,
    openedAt: fill.openedAt,
  });
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
  const paid = (enrollments || []).filter((row) => enrollmentActive(row));
  return paid.map((row) => {
    const open = (book.positions || []).filter((item) => sameStrategy(item.strategy, row.strategyName));
    const closed = (book.closedTrades || []).filter((item) => sameStrategy(item.strategy, row.strategyName));
    const realizedPnl = round2(closed.reduce((sum, item) => sum + Number(item.pnl || 0), 0));
    const unrealizedPnl = round2(open.reduce((sum, item) => sum + Number(item.pnl || 0), 0));
    return {
      strategyId: row.strategyId,
      strategyName: row.strategyName,
      status: row.status,
      term: row.term || "monthly",
      startedAt: row.startedAt || row.paidAt || "",
      endsAt: row.endsAt || "",
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
  const own = {
    positions: Array.isArray(desk.positions) ? desk.positions : [],
    orders: Array.isArray(desk.orders) ? desk.orders : [],
    closedTrades: Array.isArray(desk.closedTrades) ? desk.closedTrades : [],
  };
  const hasOwn = own.positions.length || own.orders.length || own.closedTrades.length;
  const book = hasOwn ? own : liveBookForPlans(liveBook, enrollments, brokerId);
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
    install: publicBrokerInstall(desk),
    brokers: memberBrokerCatalog(brokerId, desk),
    plans: planRows(book, enrollments),
    report,
    positions: book.positions,
    orders: book.orders || [],
    topups: desk.topups.map(publicTopup),
    payments: publicPayments(admins),
    copyReady: Boolean(autoTrade && String(desk.brokerToken || "").trim()),
    alerts: publicAlerts(desk.alerts),
  };
}

export function selectMemberBroker({ user, brokerId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const wanted = String(brokerId || "").trim().toLowerCase();
  if (!catalog.some((row) => row.id === wanted)) throw fail("Unknown broker.");
  const desk = loadDesk(user.id);
  switchDeskBroker(desk, wanted);
  desk.tradeMode = wanted === "paper" ? "paper" : "real";
  desk.copy = wanted !== "paper";
  desk.positions = desk.positions.map((row) => ({ ...row, brokerId: wanted }));
  persist();
  const autoTrade = wanted !== "paper";
  return {
    brokerId: wanted,
    tradeMode: desk.tradeMode,
    autoTrade,
    install: publicBrokerInstall(desk),
    brokers: memberBrokerCatalog(wanted, desk),
  };
}

export function installMemberBroker({ user, brokerId, clientId, apiKey, accessToken, sessionToken } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = loadDesk(user.id);
  const wanted = String(brokerId || desk.brokerId || "paper").trim().toLowerCase();
  if (!catalog.some((row) => row.id === wanted) && !CLIENT_BROKERS.some((row) => row.id === wanted)) {
    throw fail("Unknown broker.");
  }
  if (wanted === "paper") throw fail("Paper is virtual. No API key or access token.");
  const fields = brokerInstallFields(wanted);
  if (wanted !== desk.brokerId) switchDeskBroker(desk, wanted);
  else syncSelectedBrokerAccount(desk);
  const slot = peekBrokerAccount(user.id, wanted);
  const nextClientId = clientId != null ? String(clientId || "").trim() : String(slot.accountId || desk.accountId || "").trim();
  if (!nextClientId) throw fail("Paste the client ID.");
  desk.accountId = nextClientId;
  const token = String(accessToken || "").trim();
  const nextApiKey = String(apiKey || "").trim() || slot.brokerApiKey || desk.brokerApiKey;
  const nextSecret = String(sessionToken || "").trim() || slot.brokerSessionToken || desk.brokerSessionToken;
  const canMintUpstox = wanted === "upstox" && nextApiKey.length >= 8 && nextSecret.length >= 8;
  if (!token && !slot.brokerToken && !desk.brokerToken && !canMintUpstox) {
    throw fail(wanted === "upstox" ? "Paste the trading access token, or API key + API secret to generate it." : "Paste the access token.");
  }
  if (token) {
    if (token.length < 6) throw fail("Access token is too short.");
    writeBrokerToken(desk, token);
  }
  desk.tradeMode = "real";
  const needsApi = fields.some((row) => row.id === "apiKey") && wanted !== "upstox";
  const key = String(apiKey || "").trim();
  if (needsApi && !key && !slot.brokerApiKey && !desk.brokerApiKey) throw fail("Paste the API key.");
  if (key) desk.brokerApiKey = key;
  if (sessionToken != null && String(sessionToken).trim()) {
    desk.brokerSessionToken = String(sessionToken).trim();
  }
  syncSelectedBrokerAccount(desk);
  persist();
  return { ok: true, install: publicBrokerInstall(desk), brokerId: desk.brokerId };
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
