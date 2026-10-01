import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomicWrite.js";
import { catalog, isKnownLiveBroker, isLiveBrokerReady, publicBrokers } from "./brokers.js";
import { buildReport, closedTradesToday } from "./desk.js";
import { lastDailyResetAt, msUntilDailyRenewal, TOKEN_RENEW_HOUR_IST } from "./dhanToken.js";
import { sessionUsesAdminKotak } from "./brokerIsolation.js";
import { LIVE_BROKER_CATALOG, kotakMobileNumber, liveBrokerSession } from "./liveBrokers.js";
import { buildCopyAlertText, queueCopyAlertToMemberAndAdmin, queueMemberCopyNotify } from "./copyNotify.js";
import { buildUpiLinks, enrollmentActive, listEnrollments, publicPayments } from "./subscriptions.js";
import { sessionKeyIST } from "./niftyVwap/VwapSignalEngine.js";

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
    if (!fs.existsSync(DESK_FILE)) return {};
    const row = JSON.parse(fs.readFileSync(DESK_FILE, "utf8"));
    return row && typeof row === "object" && !Array.isArray(row) ? row : {};
  } catch {
    return {};
  }
}

function keepSavedBrokerSecrets(nextStore, disk) {
  for (const [userId, saved] of Object.entries(disk || {})) {
    if (!saved || typeof saved !== "object") continue;
    const mem = nextStore[userId];
    if (!mem || typeof mem !== "object") continue;
    const savedAccounts = saved.brokerAccounts && typeof saved.brokerAccounts === "object" ? saved.brokerAccounts : {};
    mem.brokerAccounts = mem.brokerAccounts && typeof mem.brokerAccounts === "object" ? mem.brokerAccounts : {};
    for (const [brokerId, slot] of Object.entries(savedAccounts)) {
      if (!slot || typeof slot !== "object") continue;
      const cur = mem.brokerAccounts[brokerId] && typeof mem.brokerAccounts[brokerId] === "object" ? mem.brokerAccounts[brokerId] : {};
      const next = { ...cur };
      let kept = false;
      if (!String(next.brokerToken || "").trim() && String(slot.brokerToken || "").trim()) {
        next.brokerToken = slot.brokerToken;
        if (!next.tokenUpdatedAt) next.tokenUpdatedAt = slot.tokenUpdatedAt || "";
        kept = true;
      }
      if (!String(next.brokerApiKey || "").trim() && String(slot.brokerApiKey || "").trim()) {
        next.brokerApiKey = slot.brokerApiKey;
        kept = true;
      }
      if (!String(next.brokerSessionToken || "").trim() && String(slot.brokerSessionToken || "").trim()) {
        next.brokerSessionToken = slot.brokerSessionToken;
        kept = true;
      }
      if (!String(next.brokerMobile || "").trim() && String(slot.brokerMobile || "").trim()) {
        next.brokerMobile = slot.brokerMobile;
        kept = true;
      }
      if (!String(next.brokerMpin || "").trim() && String(slot.brokerMpin || "").trim()) {
        next.brokerMpin = slot.brokerMpin;
        kept = true;
      }
      if (!String(next.brokerTotpSecret || "").trim() && String(slot.brokerTotpSecret || "").trim()) {
        next.brokerTotpSecret = slot.brokerTotpSecret;
        kept = true;
      }
      if (kept) mem.brokerAccounts[brokerId] = next;
    }
  }
  return nextStore;
}

function writeStore(nextStore) {
  let disk = {};
  let readable = true;
  try {
    if (fs.existsSync(DESK_FILE)) {
      const row = JSON.parse(fs.readFileSync(DESK_FILE, "utf8"));
      if (!row || typeof row !== "object" || Array.isArray(row)) readable = false;
      else disk = row;
    }
  } catch {
    readable = false;
  }
  if (!readable) {
    console.log("member-desk.json is unreadable; refusing to replace saved broker tokens.");
    return;
  }
  keepSavedBrokerSecrets(nextStore, disk);
  writeFileAtomic(DESK_FILE, `${JSON.stringify(nextStore, null, 2)}\n`);
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
  return {
    accountId: "",
    brokerToken: "",
    brokerApiKey: "",
    brokerSessionToken: "",
    brokerMobile: "",
    brokerMpin: "",
    brokerTotpSecret: "",
    tokenUpdatedAt: "",
  };
}

function tradeLoginFields(row = {}) {
  return {
    brokerMobile: String(row.brokerMobile || "").trim(),
    brokerMpin: String(row.brokerMpin || "").trim(),
    brokerTotpSecret: String(row.brokerTotpSecret || "").trim(),
  };
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
      ...tradeLoginFields(row),
      tokenUpdatedAt: String(row?.tokenUpdatedAt || "").trim(),
      memberAdded: Boolean(row?.memberAdded),
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
    ...tradeLoginFields(desk),
    tokenUpdatedAt: String(desk.brokerTokenUpdatedAt || "").trim(),
  };
}

function syncSelectedBrokerAccount(desk) {
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  desk.brokerAccounts = brokerAccountsMap(desk);
  if (!brokerId || brokerId === "paper") return desk.brokerAccounts;
  const prev = desk.brokerAccounts[brokerId] || emptyBrokerAccount();
  const snap = snapshotSelectedBrokerAccount(desk);
  desk.brokerAccounts[brokerId] = {
    accountId: snap.accountId || prev.accountId,
    brokerToken: snap.brokerToken || prev.brokerToken,
    brokerApiKey: snap.brokerApiKey || prev.brokerApiKey,
    brokerSessionToken: snap.brokerSessionToken || prev.brokerSessionToken,
    brokerMobile: snap.brokerMobile || prev.brokerMobile,
    brokerMpin: snap.brokerMpin || prev.brokerMpin,
    brokerTotpSecret: snap.brokerTotpSecret || prev.brokerTotpSecret,
    tokenUpdatedAt: snap.brokerToken ? snap.tokenUpdatedAt || prev.tokenUpdatedAt : prev.tokenUpdatedAt || snap.tokenUpdatedAt,
    memberAdded: Boolean(prev.memberAdded),
  };
  if (!snap.brokerToken && prev.brokerToken) desk.brokerToken = prev.brokerToken;
  if (!snap.brokerMobile && prev.brokerMobile) desk.brokerMobile = prev.brokerMobile;
  if (!snap.brokerMpin && prev.brokerMpin) desk.brokerMpin = prev.brokerMpin;
  if (!snap.brokerTotpSecret && prev.brokerTotpSecret) desk.brokerTotpSecret = prev.brokerTotpSecret;
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

function slotMatchesDeskBroker(slot, brokerId) {
  const session = liveBrokerSession(brokerId);
  if (!session || !slot) return false;
  const accountId = String(slot.accountId || "").trim();
  const token = String(slot.brokerToken || "").trim();
  const apiKey = String(slot.brokerApiKey || "").trim();
  const sessionId = String(session.clientId || "").trim();
  const sessionToken = String(session.accessToken || "").trim();
  const sessionKey = String(session.apiKey || "").trim();
  if (token && sessionToken && token === sessionToken) return true;
  return Boolean(accountId && sessionId && accountId === sessionId && apiKey && sessionKey && apiKey === sessionKey);
}

function credentialsCopiedFromAnotherBroker(map, brokerId, slot) {
  if (!slot || (!slot.accountId && !slot.brokerToken && !slot.brokerApiKey)) return false;
  return Object.entries(map).some(([id, other]) => {
    if (id === brokerId) return false;
    const sameId = slot.accountId && other.accountId && slot.accountId === other.accountId;
    const sameToken = slot.brokerToken && other.brokerToken && slot.brokerToken === other.brokerToken;
    const sameKey = slot.brokerApiKey && other.brokerApiKey && slot.brokerApiKey === other.brokerApiKey;
    return Boolean(sameId || sameToken || sameKey);
  });
}

function slotCopiedFromAnotherBroker(map, brokerId) {
  return credentialsCopiedFromAnotherBroker(map, brokerId, map[brokerId]);
}

function kotakHasOwnTradeLogin(slot = {}) {
  return Boolean(
    String(slot.accountId || "").trim() &&
      String(slot.brokerMobile || "").trim() &&
      String(slot.brokerMpin || "").trim() &&
      String(slot.brokerTotpSecret || "").trim(),
  );
}

function kotakSlotIsOwn(slot = {}) {
  const accountId = String(slot.accountId || "").trim();
  const token = String(slot.brokerToken || "").trim();
  const apiKey = String(slot.brokerApiKey || "").trim();
  if (kotakHasOwnTradeLogin(slot)) return true;
  if (!accountId || !token || !apiKey) return false;
  if (sessionUsesAdminKotak({ clientId: accountId, accessToken: token, apiKey })) return false;
  if (slotMatchesDeskBroker({ accountId, brokerToken: token, brokerApiKey: apiKey }, "kotak")) return false;
  return true;
}

function slotTokenCopiedFromAnotherBroker(map, brokerId) {
  const slot = map[brokerId];
  if (!slot?.brokerToken) return false;
  return Object.entries(map).some(([id, other]) => {
    if (id === brokerId) return false;
    return Boolean(slot.brokerToken && other.brokerToken && slot.brokerToken === other.brokerToken);
  });
}

function ownBrokerAccount(desk = {}, brokerId = desk.brokerId) {
  const id = knownBroker(brokerId) ? brokerId : "paper";
  if (!id || id === "paper") return emptyBrokerAccount();
  const map = brokerAccountsMap(desk);
  let slot = map[id] || emptyBrokerAccount();
  if (!slot.accountId && !slot.brokerToken && !slot.brokerApiKey && id === (knownBroker(desk.brokerId) ? desk.brokerId : "")) {
    const snap = snapshotSelectedBrokerAccount(desk);
    slot = {
      accountId: snap.accountId,
      brokerToken: snap.brokerToken,
      brokerApiKey: snap.brokerApiKey,
      brokerSessionToken: snap.brokerSessionToken,
      ...tradeLoginFields(snap),
      tokenUpdatedAt: snap.tokenUpdatedAt,
    };
  }
  if (
    id === "kotak" &&
    !kotakHasOwnTradeLogin(slot) &&
    sessionUsesAdminKotak({ clientId: slot.accountId, accessToken: slot.brokerToken, apiKey: slot.brokerApiKey })
  ) {
    return emptyBrokerAccount();
  }
  if (credentialsCopiedFromAnotherBroker(map, id, slot) || slotMatchesDeskBroker(slot, id)) return emptyBrokerAccount();
  if (id === "kotak" && !slot.memberAdded && !kotakSlotIsOwn(slot)) return emptyBrokerAccount();
  return slot;
}

function selectedBrokerAccount(desk = {}) {
  return ownBrokerAccount(desk);
}

function hydrateBrokerAccount(desk, brokerId) {
  const id = String(brokerId || "").trim().toLowerCase();
  desk.brokerAccounts = brokerAccountsMap(desk);
  if (!id || id === "paper" || !knownBroker(id)) {
    desk.accountId = "";
    desk.brokerToken = "";
    desk.brokerApiKey = "";
    desk.brokerSessionToken = "";
    desk.brokerMobile = "";
    desk.brokerMpin = "";
    desk.brokerTotpSecret = "";
    desk.brokerTokenUpdatedAt = "";
    return;
  }
  const slot = desk.brokerAccounts[id] || emptyBrokerAccount();
  const copied = slotCopiedFromAnotherBroker(desk.brokerAccounts, id);
  desk.accountId = copied ? "" : slot.accountId;
  desk.brokerToken = slot.brokerToken;
  desk.brokerApiKey = slot.brokerApiKey;
  desk.brokerSessionToken = slot.brokerSessionToken;
  desk.brokerMobile = slot.brokerMobile || "";
  desk.brokerMpin = slot.brokerMpin || "";
  desk.brokerTotpSecret = slot.brokerTotpSecret || "";
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
    const own = ownBrokerAccount(desk, id);
    if (!own.accountId && !own.brokerToken && !own.brokerApiKey) continue;
    out[id] = {
      accountId: own.accountId,
      tokenHint: maskSecret(own.brokerToken),
      apiKeyHint: maskSecret(own.brokerApiKey),
      sessionHint: maskSecret(own.brokerSessionToken),
      hasTradeLogin: Boolean(own.brokerMobile && own.brokerMpin && own.brokerTotpSecret),
      hasMpin: Boolean(own.brokerMpin),
      hasTotp: Boolean(own.brokerTotpSecret),
      tradeMobileHint: maskSecret(own.brokerMobile),
      installed: Boolean(own.brokerToken),
      oauthReady: Boolean(own.brokerApiKey && own.brokerSessionToken),
      tokenUpdatedAt: own.brokerToken ? own.tokenUpdatedAt : "",
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
  const slot = map[id] || emptyBrokerAccount();
  const ownTrade = id === "kotak" && kotakHasOwnTradeLogin(slot);
  const waitingForMember = id === "kotak" && !ownTrade && !slot.memberAdded && !kotakSlotIsOwn(slot);
  const adminKotak = id === "kotak" && !ownTrade && sessionUsesAdminKotak({
    clientId: slot.accountId || desk.accountId,
    accessToken: slot.brokerToken || desk.brokerToken,
    apiKey: slot.brokerApiKey || desk.brokerApiKey,
  });
  const leftoverToken = waitingForMember || adminKotak || slotTokenCopiedFromAnotherBroker(map, id) || slotMatchesDeskBroker(slot, id);
  if (leftoverToken) {
    return {
      ...emptyBrokerAccount(),
      leftoverToken: true,
      adminKotak,
      brokerApiKey: waitingForMember || adminKotak ? "" : slot.brokerApiKey,
      brokerSessionToken: waitingForMember || adminKotak ? "" : slot.brokerSessionToken,
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

export function findUserIdByUpstoxAccount(accountId) {
  const wanted = String(accountId || "").trim();
  if (!wanted) return "";
  for (const userId of Object.keys(store)) {
    const slot = peekBrokerAccount(userId, "upstox");
    if (String(slot.accountId || "").trim() === wanted) return userId;
    const desk = store[userId];
    if (String(desk?.brokerId || "") === "upstox" && String(desk?.accountId || "").trim() === wanted) return userId;
  }
  return "";
}

export function saveMemberUpstoxAccessToken(userId, { accessToken, accountId, expiresAt } = {}) {
  const token = String(accessToken || "").trim();
  if (!userId || !token) throw fail("Upstox access token is missing.");
  const desk = loadDesk(userId);
  migrateLegacyBrokerAccount(desk);
  syncSelectedBrokerAccount(desk);
  desk.brokerAccounts = brokerAccountsMap(desk);
  const slot = { ...(desk.brokerAccounts.upstox || emptyBrokerAccount()) };
  slot.brokerToken = token;
  slot.tokenUpdatedAt = new Date().toISOString();
  if (accountId && !String(slot.accountId || "").trim()) slot.accountId = String(accountId).trim();
  desk.brokerAccounts.upstox = slot;
  if (desk.brokerId === "upstox") {
    desk.brokerToken = token;
    desk.brokerTokenUpdatedAt = slot.tokenUpdatedAt;
    if (accountId && !String(desk.accountId || "").trim()) desk.accountId = String(accountId).trim();
    if (expiresAt) desk.brokerTokenExpiresAt = String(expiresAt);
    desk.tradeMode = "real";
  }
  persist();
  const view = {
    ...desk,
    brokerId: "upstox",
    accountId: slot.accountId,
    brokerToken: slot.brokerToken,
    brokerApiKey: slot.brokerApiKey,
    brokerSessionToken: slot.brokerSessionToken,
    brokerTokenUpdatedAt: slot.tokenUpdatedAt,
  };
  return { ok: true, userId, install: publicBrokerInstall(view) };
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
    orderHistory: [],
    bookClearedAt: 0,
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
  const own = selectedBrokerAccount(desk);
  return {
    group: groups[0] || "ALL",
    groups,
    sizingKind,
    sizingValue,
    tradeMode,
    copy: Boolean(desk.copy),
    staticIp: String(desk.staticIp || "").trim(),
    accountId: own.accountId,
    brokerId,
    subscriptionMode,
    subscriptionUntil: String(desk.subscriptionUntil || "").trim(),
    mappedStrategy: String(desk.mappedStrategy || "").trim(),
    segments: asSegments(desk.segments),
    notifications: asNotifications(desk.notifications),
    tokenHint: maskSecret(own.brokerToken),
    apiKeyHint: maskSecret(own.brokerApiKey),
    credentialsInstalled: Boolean(String(own.brokerToken || "").trim()),
    tokenUpdatedAt: own.brokerToken ? String(own.tokenUpdatedAt || "").trim() : "",
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
  const own = ownBrokerAccount(desk);
  return {
    brokerId,
    accountId: own.accountId,
    tokenHint: maskSecret(own.brokerToken),
    apiKeyHint: maskSecret(own.brokerApiKey),
    sessionHint: maskSecret(own.brokerSessionToken),
    hasTradeLogin: Boolean(own.brokerMobile && own.brokerMpin && own.brokerTotpSecret),
    hasMpin: Boolean(own.brokerMpin),
    hasTotp: Boolean(own.brokerTotpSecret),
    tradeMobileHint: maskSecret(own.brokerMobile),
    hasApiKey: Boolean(String(own.brokerApiKey || "").trim()),
    hasApiSecret: Boolean(String(own.brokerSessionToken || "").trim()),
    oauthReady: Boolean(String(own.brokerApiKey || "").trim() && String(own.brokerSessionToken || "").trim()),
    installed: Boolean(String(own.brokerToken || "").trim()),
    tokenUpdatedAt: own.brokerToken ? String(own.tokenUpdatedAt || "").trim() : "",
    fields: brokerInstallFields(brokerId),
    help:
      brokerId === "paper"
        ? "Paper is virtual. No API key or access token."
        : brokerId === "upstox"
          ? "Store API key + API secret from the Upstox developer app. At 8:00 AM IST we ask Upstox for today's trading token and retry every 15 minutes until 4:00 PM if it is still missing — approve the app / WhatsApp notification. You can also tap Get today's trading token. Do not paste the Analytics token. Set the app notifier URL to https://trade2smart.com/api/upstox/token."
          : brokerId === "kotak"
            ? "Quotes use the Neo consumer key. Orders open this user's trade login (mobile, MPIN, and TOTP) with the Neo access token, or use a pasted Neo sid and session token. The client ID is not the sid. This does not start desk LIVE."
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
  assertOwnKotakForSave(desk, patch);
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
  if (patch.brokerMobile != null && String(patch.brokerMobile).trim()) {
    desk.brokerMobile = kotakMobileNumber(patch.brokerMobile);
  }
  if (patch.brokerMpin != null && String(patch.brokerMpin).trim()) {
    desk.brokerMpin = String(patch.brokerMpin).trim();
  }
  if (patch.brokerTotpSecret != null && String(patch.brokerTotpSecret).trim()) {
    desk.brokerTotpSecret = String(patch.brokerTotpSecret).trim();
  }
  if (patch.notes != null) desk.notes = String(patch.notes || "").trim();
  if (tokenWritten) enableLiveCopyFromToken(desk, patch);
  syncSelectedBrokerAccount(desk);
  markOwnKotakAdded(desk, patch);
  persist();
  return normalizeClientSettings(desk);
}

function normalizeBrokerSecret(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function prospectiveKotakLogin(desk = {}, patch = {}) {
  const nextBroker = patch.brokerId != null
    ? String(patch.brokerId || "").trim().toLowerCase()
    : String(desk.brokerId || "").trim().toLowerCase();
  if (nextBroker !== "kotak") return null;
  const offeredId = patch.accountId != null ? String(patch.accountId || "").trim() : "";
  const offeredToken = patch.brokerToken != null ? normalizeBrokerSecret(patch.brokerToken) : "";
  const offeredKey = patch.brokerApiKey != null ? String(patch.brokerApiKey || "").trim() : "";
  if (!offeredId && !offeredToken && !offeredKey) return null;
  const currentBroker = String(desk.brokerId || "").trim().toLowerCase();
  const switching = patch.brokerId != null && String(patch.brokerId || "").trim().toLowerCase() !== currentBroker;
  const prev = brokerAccountsMap(desk).kotak || emptyBrokerAccount();
  const baseId = switching ? String(prev.accountId || "").trim() : String(desk.accountId || prev.accountId || "").trim();
  const baseToken = switching ? String(prev.brokerToken || "").trim() : String(desk.brokerToken || prev.brokerToken || "").trim();
  const baseKey = switching ? String(prev.brokerApiKey || "").trim() : String(desk.brokerApiKey || prev.brokerApiKey || "").trim();
  return {
    accountId: patch.accountId != null ? offeredId : baseId,
    token: offeredToken || baseToken,
    apiKey: offeredKey || baseKey,
  };
}

function prospectiveBrokerLogin(desk = {}, patch = {}) {
  const nextBroker = patch.brokerId != null
    ? String(patch.brokerId || "").trim().toLowerCase()
    : String(desk.brokerId || "").trim().toLowerCase();
  if (!nextBroker || nextBroker === "paper") return null;
  const offeredId = patch.accountId != null ? String(patch.accountId || "").trim() : "";
  const offeredToken = patch.brokerToken != null ? normalizeBrokerSecret(patch.brokerToken) : "";
  const offeredKey = patch.brokerApiKey != null ? String(patch.brokerApiKey || "").trim() : "";
  const offeredSecret = patch.brokerSessionToken != null ? String(patch.brokerSessionToken || "").trim() : "";
  if (!offeredId && !offeredToken && !offeredKey && !offeredSecret) return null;
  const currentBroker = String(desk.brokerId || "").trim().toLowerCase();
  const switching = patch.brokerId != null && String(patch.brokerId || "").trim().toLowerCase() !== currentBroker;
  const prev = brokerAccountsMap(desk)[nextBroker] || emptyBrokerAccount();
  const baseId = switching ? String(prev.accountId || "").trim() : String(desk.accountId || prev.accountId || "").trim();
  const baseToken = switching ? String(prev.brokerToken || "").trim() : String(desk.brokerToken || prev.brokerToken || "").trim();
  const baseKey = switching ? String(prev.brokerApiKey || "").trim() : String(desk.brokerApiKey || prev.brokerApiKey || "").trim();
  const baseSecret = switching ? String(prev.brokerSessionToken || "").trim() : String(desk.brokerSessionToken || prev.brokerSessionToken || "").trim();
  return {
    brokerId: nextBroker,
    accountId: patch.accountId != null ? offeredId : baseId,
    token: offeredToken || baseToken,
    apiKey: offeredKey || baseKey,
    sessionToken: offeredSecret || baseSecret,
  };
}

const BROKER_KEY_REQUIRED = {
  zerodha: "Paste the Zerodha API key.",
  fyers: "Paste the Fyers app ID.",
  kotak: "Paste the Kotak Neo consumer key.",
  angelone: "Paste the Angel SmartAPI key.",
};

export function assertOwnKotakForSave(desk = {}, patch = {}) {
  const login = prospectiveBrokerLogin(desk, patch);
  if (!login) return;
  if (login.brokerId === "kotak") {
    if (sessionUsesAdminKotak({ clientId: login.accountId, accessToken: login.token, apiKey: login.apiKey })) {
      throw fail("That login is the admin Kotak Neo. Add this user's own Kotak Neo client ID, consumer key, and access token.");
    }
    if (slotMatchesDeskBroker({ accountId: login.accountId, brokerToken: login.token, brokerApiKey: login.apiKey }, "kotak")) {
      throw fail("That login is the desk Kotak Neo. Waiting for this user to add their own Kotak Neo.");
    }
  }
  const keyMessage = BROKER_KEY_REQUIRED[login.brokerId];
  if (login.token && keyMessage && !login.apiKey) throw fail(keyMessage);
  if (login.brokerId === "upstox" && login.apiKey && !login.sessionToken && !login.token) {
    throw fail("Paste the Upstox API secret with the API key, or paste today's trading access token.");
  }
}

function markOwnKotakAdded(desk, patch = {}) {
  if (String(desk.brokerId || "").trim().toLowerCase() !== "kotak") return;
  const login = prospectiveKotakLogin(desk, patch);
  if (!login?.accountId || !login.token || !login.apiKey) return;
  if (sessionUsesAdminKotak({ clientId: login.accountId, accessToken: login.token, apiKey: login.apiKey })) return;
  if (slotMatchesDeskBroker({ accountId: login.accountId, brokerToken: login.token, brokerApiKey: login.apiKey }, "kotak")) return;
  const slot = desk.brokerAccounts?.kotak;
  if (!slot?.accountId || !slot.brokerToken || !slot.brokerApiKey) return;
  if (credentialsCopiedFromAnotherBroker(desk.brokerAccounts, "kotak", slot)) return;
  slot.memberAdded = true;
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

const ADMIN_DESK_ID = "admin";

export function persistAdminBrokerSecrets({ brokerId = "dhan", accountId, accessToken } = {}) {
  const wanted = String(brokerId || "dhan").trim().toLowerCase() || "dhan";
  const id = String(accountId || "").trim();
  const token = String(accessToken || "").trim();
  if (!id && !token) return peekBrokerAccount(ADMIN_DESK_ID, wanted);
  const desk = loadDesk(ADMIN_DESK_ID);
  migrateLegacyBrokerAccount(desk);
  desk.brokerAccounts = brokerAccountsMap(desk);
  const slot = { ...(desk.brokerAccounts[wanted] || emptyBrokerAccount()) };
  if (id) slot.accountId = id;
  if (token) {
    slot.brokerToken = token;
    slot.tokenUpdatedAt = new Date().toISOString();
  }
  desk.brokerAccounts[wanted] = slot;
  if (!desk.brokerId || desk.brokerId === "paper" || desk.brokerId === wanted) {
    desk.brokerId = wanted;
    if (id) desk.accountId = id;
    if (token) writeBrokerToken(desk, token);
    if (token) desk.tradeMode = "real";
  }
  persist();
  return slot;
}

export function peekAdminBrokerSecrets(brokerId = "dhan") {
  const wanted = String(brokerId || "dhan").trim().toLowerCase() || "dhan";
  const slot = peekBrokerAccount(ADMIN_DESK_ID, wanted);
  const desk = store[ADMIN_DESK_ID] || {};
  const selected = String(desk.brokerId || "").trim().toLowerCase();
  const useTop = selected === wanted || (wanted === "dhan" && (!selected || selected === "paper" || selected === "dhan"));
  return {
    accountId: String(slot.accountId || (useTop ? desk.accountId : "") || "").trim(),
    brokerToken: String(slot.brokerToken || (useTop ? desk.brokerToken : "") || "").trim(),
    tokenUpdatedAt: String(slot.tokenUpdatedAt || (useTop ? desk.brokerTokenUpdatedAt : "") || "").trim(),
  };
}

function rowBelongsToStrategy(row, strategyId, strategyName) {
  if (!row || typeof row !== "object") return false;
  if (strategyId && String(row.strategyId || "").trim() === strategyId) return true;
  const label = String(row.strategy || row.strategyName || "").trim().toLowerCase();
  if (strategyName && label === strategyName) return true;
  const text = String(row.text || "").toLowerCase();
  return Boolean(strategyName && text.includes(` · ${strategyName}`));
}

function rowBookMs(row) {
  const ms = Date.parse(String(row?.createdAt || row?.openedAt || row?.closedAt || ""));
  return Number.isFinite(ms) ? ms : 0;
}

/** Drop one strategy's previous-day intraday rows. Today's open position stays. */
export function clearPreviousIntradayStrategyBook({ strategyId, strategyName, today } = {}) {
  const id = String(strategyId || "").trim();
  const name = String(strategyName || "").trim().toLowerCase();
  const day = String(today || "").trim();
  if ((!id && !name) || !day) return 0;
  let removed = 0;
  for (const desk of Object.values(store)) {
    if (!desk || typeof desk !== "object") continue;
    for (const key of ["positions", "closedTrades", "orders", "orderHistory", "alerts"]) {
      const rows = Array.isArray(desk[key]) ? desk[key] : [];
      const next = rows.filter((row) => {
        if (!rowBelongsToStrategy(row, id, name)) return true;
        const ms = rowBookMs(row);
        if (!ms) return true;
        return sessionKeyIST(ms) >= day;
      });
      if (next.length !== rows.length) {
        desk[key] = next;
        removed += rows.length - next.length;
      }
    }
  }
  if (removed) persist();
  return removed;
}

/** Clear one strategy's orders on every user desk. Positions, plans, and tokens stay. */
export function clearStrategyOrdersOnMemberDesks({ strategyId, strategyName } = {}) {
  const id = String(strategyId || "").trim();
  const name = String(strategyName || "").trim().toLowerCase();
  if (!id && !name) return 0;
  let removed = 0;
  for (const desk of Object.values(store)) {
    if (!desk || typeof desk !== "object") continue;
    for (const key of ["orders", "orderHistory"]) {
      const rows = Array.isArray(desk[key]) ? desk[key] : [];
      const next = rows.filter((row) => !rowBelongsToStrategy(row, id, name));
      if (next.length !== rows.length) {
        desk[key] = next;
        removed += rows.length - next.length;
      }
    }
  }
  if (removed) persist();
  return removed;
}

function strategySets(algos = []) {
  const ids = new Set();
  const names = new Set();
  for (const row of algos || []) {
    const id = String(row?.id || "").trim();
    const name = String(row?.name || "").trim().toLowerCase();
    if (id) ids.add(id);
    if (name) names.add(name);
  }
  return { ids, names };
}

function rowIsMissingStrategy(row, ids, names) {
  if (!row || typeof row !== "object") return false;
  const id = String(row.strategyId || "").trim();
  const name = String(row.strategy || row.strategyName || "").trim().toLowerCase();
  if (id) return !ids.has(id);
  if (name) return !names.has(name);
  const text = String(row.text || "").toLowerCase();
  const match = text.match(/ · ([^·]+) · /);
  if (!match) return false;
  return !names.has(match[1].trim().toLowerCase());
}

/** Drop orders, positions, alerts, and copy maps for strategies that are no longer on the desk. Tokens stay. */
export function purgeMemberDesksExcept(algos = []) {
  const { ids, names } = strategySets(algos);
  let removed = 0;
  for (const desk of Object.values(store)) {
    if (!desk || typeof desk !== "object") continue;
    for (const key of ["positions", "closedTrades", "orders", "orderHistory", "alerts"]) {
      const rows = Array.isArray(desk[key]) ? desk[key] : [];
      const next = rows.filter((row) => !rowIsMissingStrategy(row, ids, names));
      if (next.length !== rows.length) {
        desk[key] = next;
        removed += rows.length - next.length;
      }
    }
    const mapped = String(desk.mappedStrategy || "").trim().toLowerCase();
    if (mapped && !names.has(mapped)) {
      desk.mappedStrategy = "";
      removed += 1;
    }
  }
  if (removed) persist();
  return removed;
}

/** Remove one strategy's plans, orders, positions, and alerts from every user desk. Broker tokens stay. */
export function dropStrategyFromMemberDesks({ strategyId, strategyName } = {}) {
  const id = String(strategyId || "").trim();
  const name = String(strategyName || "").trim().toLowerCase();
  if (!id && !name) return 0;
  let removed = 0;
  for (const desk of Object.values(store)) {
    if (!desk || typeof desk !== "object") continue;
    for (const key of ["positions", "closedTrades", "orders", "orderHistory", "alerts"]) {
      const rows = Array.isArray(desk[key]) ? desk[key] : [];
      const next = rows.filter((row) => !rowBelongsToStrategy(row, id, name));
      if (next.length !== rows.length) {
        desk[key] = next;
        removed += rows.length - next.length;
      }
    }
    const mapped = String(desk.mappedStrategy || "").trim().toLowerCase();
    if (mapped && (mapped === name || (id && mapped === id.toLowerCase()))) {
      desk.mappedStrategy = "";
      removed += 1;
    }
  }
  if (removed) persist();
  return removed;
}

export function removeDesk(userId) {
  if (!userId || !store[userId]) return false;
  delete store[userId];
  persist();
  return true;
}

export function removeOrphanDesks(knownIds) {
  const allow = knownIds instanceof Set ? knownIds : new Set(knownIds || []);
  allow.add(ADMIN_DESK_ID);
  let removed = 0;
  for (const id of Object.keys(store)) {
    if (allow.has(id)) continue;
    delete store[id];
    removed += 1;
  }
  if (removed) persist();
  return removed;
}

function loadDesk(userId) {
  if (!store[userId]) store[userId] = emptyDesk(userId);
  const desk = store[userId];
  desk.topups = Array.isArray(desk.topups) ? desk.topups : [];
  desk.positions = Array.isArray(desk.positions) ? desk.positions : [];
  desk.closedTrades = Array.isArray(desk.closedTrades) ? desk.closedTrades : [];
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.orderHistory = Array.isArray(desk.orderHistory) ? desk.orderHistory : [];
  desk.bookClearedAt = Number(desk.bookClearedAt || 0) || 0;
  desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
  const before = {
    cleared: desk.bookClearedAt,
    orders: desk.orders.length,
    history: desk.orderHistory.length,
    alerts: desk.alerts.length,
  };
  splitMemberOrderBook(desk);
  clearMemberDailyBook(desk);
  if (
    desk.bookClearedAt !== before.cleared ||
    desk.orders.length !== before.orders ||
    desk.orderHistory.length !== before.history ||
    desk.alerts.length !== before.alerts
  ) {
    persist();
  }
  desk.seededPlans = Array.isArray(desk.seededPlans) ? desk.seededPlans : [];
  if (!desk.wallet || typeof desk.wallet !== "object") desk.wallet = { balance: 0, updatedAt: new Date().toISOString() };
  if (!knownBroker(desk.brokerId)) desk.brokerId = "paper";
  migrateLegacyBrokerAccount(desk);
  return desk;
}

function brokerChoiceNote(row, { selected, saved, virtual }) {
  if (virtual) return "Virtual paper book. Signals stay on the T2S desk.";
  const detail = saved.installed
    ? `This user's ${row.name} token is saved${saved.accountId ? ` · ${saved.accountId}` : ""}.${selected ? "" : " Select it to make it the default."}`
    : saved.oauthReady
      ? `API key and secret saved for ${row.name}. Generate today's trading token.`
      : "Install this broker's own client ID and access token. It stays saved when you switch to another broker.";
  if (!selected) return detail;
  return `Default broker. Quotes, orders, balance, MTM, and P&L use this login${saved.accountId ? ` · ${saved.accountId}` : ""}. ${detail}`;
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
      note: brokerChoiceNote(row, { selected, saved, virtual }),
    };
  });
}

export function ensurePlanLedger({ user } = {}) {
  if (!user?.id) return null;
  return loadDesk(user.id);
}

export function isWorkingMemberOrder(status) {
  const raw = String(status || "").toUpperCase();
  return raw === "PENDING" || raw === "PARTIAL" || raw === "TRANSIT" || raw === "OPEN";
}

export function isExecutedMemberOrder(status) {
  const raw = String(status || "").toUpperCase();
  return raw === "FILLED" || raw === "TRADED";
}

export function isHistoryMemberOrder(status) {
  return isExecutedMemberOrder(status);
}

export function isTerminalMemberOrder(status) {
  const raw = String(status || "").toUpperCase();
  return raw === "REJECTED" || raw === "FAILED" || raw === "CANCELLED";
}

function isStoredHistoryMemberOrder(status) {
  return isExecutedMemberOrder(status) || isTerminalMemberOrder(status);
}

export function mapMemberOrderStatus(status, { error, paper, live } = {}) {
  if (error) return "REJECTED";
  if (paper || !live) return "FILLED";
  const raw = String(status || live.status || "PENDING").toUpperCase();
  if (raw === "TRANSIT" || raw === "OPEN") return "PENDING";
  if (raw === "TRADED") return "FILLED";
  if (raw === "PART_TRADED") return "PARTIAL";
  if (raw === "REJECTED" || raw === "REJECT" || raw === "REJECTION") return "REJECTED";
  if (raw === "FAIL" || raw === "FAILURE") return "FAILED";
  if (raw === "CANCELED" || raw === "EXPIRED") return "CANCELLED";
  return raw;
}

function brokerOrderPrice(row) {
  const n = Number(row?.averageTradedPrice || row?.avgTradedPrice || row?.tradedPrice || row?.price || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function brokerOrderReason(row) {
  return String(row?.omsErrorDescription || row?.rejectedReason || row?.reason || row?.errorMessage || "").trim();
}

function dropUnfilledMemberPosition(desk, order) {
  if (!isTerminalMemberOrder(order?.status) || Number(order?.filledQty || 0) > 0) return;
  const symbol = String(order.symbol || "");
  const strategy = String(order.strategy || "");
  const side = order.side === "SELL" ? "SELL" : "BUY";
  const qty = Number(order.qty || 0);
  const openedAt = String(order.createdAt || "");
  let removed = false;
  desk.positions = (desk.positions || []).filter((row) => {
    if (removed) return true;
    const sameContract =
      row.symbol === symbol &&
      String(row.strategy || "") === strategy &&
      (row.type === side || row.side === side) &&
      Number(row.qty) === qty;
    const sameTime = !openedAt || !row.openedAt || String(row.openedAt) === openedAt;
    if (!sameContract || !sameTime) return true;
    removed = true;
    return false;
  });
}

export function memberWorkingDhanCopies() {
  const out = [];
  for (const userId of Object.keys(store)) {
    if (!userId || userId === "admin") continue;
    const desk = store[userId] || {};
    const working = (Array.isArray(desk.orders) ? desk.orders : []).filter(
      (row) => isWorkingMemberOrder(row?.status) && String(row.brokerId || "").toLowerCase() === "dhan" && !row.paper,
    );
    if (!working.length) continue;
    const slot = brokerAccountForLiveCopy(userId, "dhan");
    if (slot.leftoverToken) continue;
    const token = String(slot.brokerToken || (desk.brokerId === "dhan" ? desk.brokerToken : "") || "").trim();
    const clientId = String(slot.accountId || (desk.brokerId === "dhan" ? desk.accountId : "") || "").trim();
    if (!token || !clientId) continue;
    out.push({ userId, token, clientId });
  }
  return out;
}

function sameCopyIdentity(alert, order) {
  return (
    String(alert?.symbol || "") === String(order?.symbol || "") &&
    String(alert?.side || "BUY").toUpperCase() === String(order?.side || "BUY").toUpperCase() &&
    Number(alert?.qty || 0) === Number(order?.qty || 0) &&
    String(alert?.strategy || "") === String(order?.strategy || "")
  );
}

function pickOrderForAlert(book, alert, used) {
  const id = String(alert?.orderId || "");
  if (id) {
    const byId = book.find((row) => !used.has(row) && String(row.id) === id);
    if (byId) return byId;
  }
  const candidates = book.filter((row) => !used.has(row) && sameCopyIdentity(alert, row));
  const exact = candidates.find(
    (row) => alert.createdAt && row.createdAt && String(row.createdAt) === String(alert.createdAt),
  );
  if (exact) return exact;
  return candidates.length === 1 ? candidates[0] : null;
}

function applyCopyAlertFromOrder(alert, order) {
  const status = String(order?.status || "").toUpperCase();
  if (!status) return false;
  const reason = String(order?.reason || "").trim();
  const text = buildCopyAlertText({
    side: order.side,
    qty: order.qty,
    symbol: order.symbol,
    strategy: order.strategy,
    status,
    reason,
  });
  const changed = alert.status !== status || alert.text !== text || String(alert.orderId || "") !== String(order.id || "");
  alert.orderId = String(order.id || alert.orderId || "");
  alert.status = status;
  alert.text = text;
  if (isTerminalMemberOrder(status)) alert.kind = "copy_rejected";
  return changed;
}

/** Rewrite a PENDING copy alert once the member order is filled, rejected, or cancelled. */
export function reconcileCopyAlerts(desk) {
  if (!desk) return false;
  desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
  const book = [...(desk.orders || []), ...(desk.orderHistory || [])];
  const used = new Set();
  let changed = false;
  for (const alert of desk.alerts) {
    const current = String(alert?.status || "PENDING").toUpperCase();
    if (!isWorkingMemberOrder(current)) continue;
    const order = pickOrderForAlert(book, alert, used);
    if (!order) continue;
    used.add(order);
    if (applyCopyAlertFromOrder(alert, order)) changed = true;
  }
  return changed;
}

/** Replace a stored PENDING copy with the status on that member's Dhan order book. */
export function applyMemberDhanOrderStatuses(userId, brokerOrders = []) {
  if (!userId) return [];
  const desk = loadDesk(userId);
  const byId = new Map();
  for (const row of Array.isArray(brokerOrders) ? brokerOrders : []) {
    const id = String(row?.orderId || row?.dhanOrderId || row?.order_id || row?.id || "").trim();
    if (id) byId.set(id, row);
  }
  const updates = [];
  const working = [];
  for (const order of desk.orders || []) {
    const broker = byId.get(String(order.id || ""));
    if (!broker || !isWorkingMemberOrder(order.status)) {
      working.push(order);
      continue;
    }
    const status = mapMemberOrderStatus(broker.orderStatus || broker.status, { live: broker });
    const reason = brokerOrderReason(broker) || String(order.reason || "");
    const filledQty = Number(broker.filledQty || broker.tradedQuantity || order.filledQty || 0);
    const nextPrice = brokerOrderPrice(broker);
    const same =
      status === String(order.status || "").toUpperCase() &&
      reason === String(order.reason || "") &&
      !(status === "FILLED" && filledQty !== Number(order.filledQty || 0));
    if (same) {
      working.push(order);
      continue;
    }
    const updated = {
      ...order,
      status,
      reason,
      filledQty: status === "FILLED" ? Number(order.qty) || filledQty : filledQty,
      price: nextPrice > 0 ? nextPrice : Number(order.price || 0),
    };
    updates.push({ id: String(order.id), status, reason: updated.reason, filledQty: updated.filledQty });
    if (isWorkingMemberOrder(status)) {
      working.push(updated);
      continue;
    }
    if (isTerminalMemberOrder(status)) dropUnfilledMemberPosition(desk, updated);
    if (isStoredHistoryMemberOrder(status)) desk.orderHistory.unshift(updated);
  }
  if (updates.length) {
    desk.orders = working;
    desk.orderHistory = (desk.orderHistory || []).filter((row) => isStoredHistoryMemberOrder(row?.status)).slice(0, 400);
  }
  const alertsChanged = reconcileCopyAlerts(desk);
  if (!updates.length && !alertsChanged) return [];
  persist();
  return updates;
}

function splitMemberOrderBook(desk) {
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.orderHistory = Array.isArray(desk.orderHistory) ? desk.orderHistory : [];
  const working = [];
  const history = [];
  for (const row of desk.orderHistory) {
    if (isStoredHistoryMemberOrder(row?.status)) history.push(row);
  }
  for (const row of desk.orders) {
    if (isWorkingMemberOrder(row?.status)) working.push(row);
    else if (isStoredHistoryMemberOrder(row?.status)) history.unshift(row);
  }
  desk.orders = working;
  desk.orderHistory = history.slice(0, 400);
}

export function clearMemberDailyBook(desk, now = Date.now()) {
  if (!desk) return desk;
  const resetAt = lastDailyResetAt(now, TOKEN_RENEW_HOUR_IST);
  if ((Number(desk.bookClearedAt) || 0) >= resetAt) return desk;
  splitMemberOrderBook(desk);
  desk.orders = [];
  desk.positions = [];
  desk.alerts = [];
  desk.orderHistory = desk.orderHistory.filter((row) => isExecutedMemberOrder(row?.status)).slice(0, 400);
  desk.bookClearedAt = resetAt;
  return desk;
}

export function sweepMemberDailyBooks(now = Date.now()) {
  let cleared = 0;
  for (const desk of Object.values(store)) {
    if (!desk) continue;
    desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
    desk.orderHistory = Array.isArray(desk.orderHistory) ? desk.orderHistory : [];
    desk.positions = Array.isArray(desk.positions) ? desk.positions : [];
    desk.alerts = Array.isArray(desk.alerts) ? desk.alerts : [];
    const before = {
      cleared: Number(desk.bookClearedAt) || 0,
      orders: desk.orders.length,
      history: desk.orderHistory.length,
      positions: desk.positions.length,
      alerts: desk.alerts.length,
    };
    splitMemberOrderBook(desk);
    clearMemberDailyBook(desk, now);
    if (
      desk.bookClearedAt !== before.cleared ||
      desk.orders.length !== before.orders ||
      desk.orderHistory.length !== before.history ||
      desk.positions.length !== before.positions ||
      desk.alerts.length !== before.alerts
    ) {
      cleared += 1;
    }
  }
  if (cleared) persist();
  return cleared;
}

let bookSweepTimer = null;

export function startMemberDailyBookScheduler() {
  if (bookSweepTimer) clearTimeout(bookSweepTimer);
  const tick = () => {
    try {
      sweepMemberDailyBooks();
    } catch (error) {
      console.log(`Member daily book clear failed: ${error.message || error}`);
    }
    bookSweepTimer = setTimeout(tick, msUntilDailyRenewal());
  };
  try {
    sweepMemberDailyBooks();
  } catch (error) {
    console.log(`Member daily book clear failed: ${error.message || error}`);
  }
  bookSweepTimer = setTimeout(tick, msUntilDailyRenewal());
}

function placeMemberOrder(desk, order) {
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.orderHistory = Array.isArray(desk.orderHistory) ? desk.orderHistory : [];
  if (isWorkingMemberOrder(order.status)) desk.orders.unshift(order);
  else if (isStoredHistoryMemberOrder(order.status)) desk.orderHistory.unshift(order);
  desk.orderHistory = desk.orderHistory.filter((row) => isStoredHistoryMemberOrder(row?.status)).slice(0, 400);
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
  if (!liveBook || !names.size) return { positions: [], orders: [], orderHistory: [], closedTrades: [] };
  return {
    positions: (liveBook.positions || []).filter(match),
    orders: (liveBook.orders || []).filter((row) => match(row) && isWorkingMemberOrder(row.status)),
    orderHistory: (liveBook.orders || []).filter((row) => match(row) && isHistoryMemberOrder(row.status)),
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
  const mapped = mapMemberOrderStatus(live?.status, { error, paper, live });
  const order = {
    id: live?.orderId ? String(live.orderId) : `mo${crypto.randomBytes(6).toString("hex")}`,
    userId,
    symbol: live?.tradingSymbol || payload.symbol || "",
    side,
    qty,
    filledQty: mapped === "FILLED" ? qty : Number(live?.filledQty || 0),
    price,
    status: mapped,
    strategy: payload.strategy || "",
    brokerId,
    paper: Boolean(paper),
    live: Boolean(live?.orderId) && !paper,
    reason: error ? String(error.message || error) : String(live?.reason || ""),
    securityId: payload.securityId ? String(payload.securityId) : "",
    createdAt: now,
  };
  desk.orders = Array.isArray(desk.orders) ? desk.orders : [];
  desk.orderHistory = Array.isArray(desk.orderHistory) ? desk.orderHistory : [];
  desk.positions = Array.isArray(desk.positions) ? desk.positions : [];
  desk.closedTrades = Array.isArray(desk.closedTrades) ? desk.closedTrades : [];
  placeMemberOrder(desk, order);
  const alert = {
    id: `na${crypto.randomBytes(6).toString("hex")}`,
    orderId: String(order.id || ""),
    kind: error ? "copy_rejected" : "copy_order",
    text: buildCopyAlertText({
      side,
      qty,
      symbol: order.symbol,
      strategy: order.strategy,
      status: mapped,
      error,
      reason: error ? "" : order.reason,
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
  queueCopyAlertToMemberAndAdmin({
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

export function getMemberDesk({ user, enrollments = [], algos = [], quote, admins = [], liveBook, ownBookOnly = false } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const desk = loadDesk(user.id);
  if (reconcileCopyAlerts(desk)) persist();
  const brokerId = knownBroker(desk.brokerId) ? desk.brokerId : "paper";
  const own = {
    positions: Array.isArray(desk.positions) ? desk.positions : [],
    orders: Array.isArray(desk.orders) ? desk.orders : [],
    orderHistory: (Array.isArray(desk.orderHistory) ? desk.orderHistory : []).filter((row) => isStoredHistoryMemberOrder(row?.status)),
    closedTrades: Array.isArray(desk.closedTrades) ? desk.closedTrades : [],
  };
  const hasOwn = own.positions.length || own.orders.length || own.orderHistory.length || own.closedTrades.length;
  const book = hasOwn || ownBookOnly ? own : liveBookForPlans(liveBook, enrollments, brokerId);
  if (!book.positions.length && typeof quote === "function") {
    markMtm(book, quote);
  }
  const report = buildReport({
    closedTrades: book.closedTrades,
    positions: book.positions,
    orders: [...(book.orders || []), ...(book.orderHistory || [])],
  });
  report.tradeBook = closedTradesToday(report.tradeBook);
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
    orderHistory: book.orderHistory || [],
    topups: desk.topups.map(publicTopup),
    payments: publicPayments(admins),
    copyReady: Boolean(autoTrade && String(desk.brokerToken || "").trim()),
    alerts: publicAlerts(desk.alerts),
    staticIp: String(desk.staticIp || "").trim(),
  };
}

export function saveMemberStaticIp({ user, staticIp } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const saved = saveClientSettings(user.id, { staticIp: staticIp ?? "" });
  return { ok: true, staticIp: saved.staticIp || "" };
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

export function installMemberBroker({ user, brokerId, clientId, apiKey, accessToken, sessionToken, mobile, mpin, totpSecret } = {}) {
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
  const deskLogin = slotMatchesDeskBroker(slot, wanted) || slotMatchesDeskBroker(snapshotSelectedBrokerAccount(desk), wanted);
  const priorId = deskLogin ? "" : String(slot.accountId || "").trim();
  const priorToken = deskLogin ? "" : String(slot.brokerToken || "").trim();
  const priorKey = deskLogin ? "" : String(slot.brokerApiKey || "").trim();
  const priorSecret = deskLogin ? "" : String(slot.brokerSessionToken || "").trim();
  const nextClientId = clientId != null ? String(clientId || "").trim() : priorId || (deskLogin ? "" : String(desk.accountId || "").trim());
  if (!nextClientId) throw fail("Paste the client ID.");
  const offeredToken = String(accessToken || "").trim() || priorToken;
  const offeredKey = String(apiKey || "").trim() || priorKey;
  const ownKotakTrade =
    wanted === "kotak" &&
    (String(mobile || "").trim() || String(slot.brokerMobile || "").trim()) &&
    (String(mpin || "").trim() || String(slot.brokerMpin || "").trim()) &&
    (String(totpSecret || "").trim() || String(slot.brokerTotpSecret || "").trim());
  if (!ownKotakTrade && slotMatchesDeskBroker({ accountId: nextClientId, brokerToken: offeredToken, brokerApiKey: offeredKey }, wanted)) {
    const name = catalog.find((row) => row.id === wanted)?.name || "broker";
    throw fail(`That login is the desk ${name}. Waiting for this user to add their own ${name}.`);
  }
  if (wanted === "kotak" && !ownKotakTrade && sessionUsesAdminKotak({ clientId: nextClientId, accessToken: offeredToken, apiKey: offeredKey })) {
    throw fail("That login is the admin Kotak Neo. This user needs their own Kotak Neo client ID and access token.");
  }
  desk.accountId = nextClientId;
  const token = String(accessToken || "").trim();
  const nextApiKey = offeredKey;
  const nextSecret = String(sessionToken || "").trim() || priorSecret;
  const canMintUpstox = wanted === "upstox" && nextApiKey.length >= 8 && nextSecret.length >= 8;
  if (!token && !priorToken && !canMintUpstox) {
    throw fail(wanted === "upstox" ? "Paste the trading access token, or API key + API secret to generate it." : "Paste the access token.");
  }
  if (token) {
    if (token.length < 6) throw fail("Access token is too short.");
    writeBrokerToken(desk, token);
  } else if (deskLogin) {
    desk.brokerToken = "";
    desk.brokerTokenUpdatedAt = "";
  }
  desk.tradeMode = "real";
  const needsApi = fields.some((row) => row.id === "apiKey") && wanted !== "upstox";
  const key = String(apiKey || "").trim();
  if (needsApi && !key && !priorKey) throw fail("Paste the API key.");
  if (key) desk.brokerApiKey = key;
  else if (deskLogin) desk.brokerApiKey = "";
  if (sessionToken != null && String(sessionToken).trim()) {
    desk.brokerSessionToken = String(sessionToken).trim();
  }
  if (String(mobile || "").trim()) desk.brokerMobile = kotakMobileNumber(mobile);
  if (String(mpin || "").trim()) desk.brokerMpin = String(mpin).trim();
  if (String(totpSecret || "").trim()) desk.brokerTotpSecret = String(totpSecret).trim();
  syncSelectedBrokerAccount(desk);
  if (desk.brokerAccounts?.[wanted]) desk.brokerAccounts[wanted].memberAdded = true;
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
