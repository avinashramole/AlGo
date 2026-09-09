import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGING_FILE = process.env.T2S_MESSAGING_FILE || path.join(__dirname, "data", "messaging.json");

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJson(file, fallback) {
  try {
    const row = JSON.parse(fs.readFileSync(file, "utf8"));
    return row && typeof row === "object" ? row : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

export function normalizeMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function isMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value));
}

function e164(value) {
  const digits = normalizeMobile(value);
  return isMobile(digits) ? `91${digits}` : "";
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "••••";
  return `${raw.slice(0, 3)}…${raw.slice(-4)}`;
}

function emptyStore() {
  return {
    sendVia: "both",
    whatsapp: { token: "", phoneNumberId: "" },
    telegram: { token: "" },
    contacts: [],
    threads: {},
  };
}

function loadStore() {
  const row = readJson(MESSAGING_FILE, {});
  const sendVia = ["both", "whatsapp", "telegram"].includes(row.sendVia) ? row.sendVia : "both";
  return {
    sendVia,
    whatsapp: {
      token: String(row.whatsapp?.token || process.env.WHATSAPP_TOKEN || "").trim(),
      phoneNumberId: String(row.whatsapp?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    },
    telegram: {
      token: String(row.telegram?.token || process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    },
    contacts: Array.isArray(row.contacts) ? row.contacts : [],
    threads: row.threads && typeof row.threads === "object" ? row.threads : {},
  };
}

let store = loadStore();

function persist() {
  writeJson(MESSAGING_FILE, store);
}

export function whatsappReady(env = process.env, row = store) {
  const token = String(row.whatsapp?.token || env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = String(row.whatsapp?.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  return Boolean(token && phoneNumberId);
}

export function telegramReady(env = process.env, row = store) {
  return Boolean(String(row.telegram?.token || env.TELEGRAM_BOT_TOKEN || "").trim());
}

function channelStatus(kind, ready, hint) {
  return {
    kind,
    ready,
    label: ready ? "CONNECTED" : "SETUP REQUIRED",
    hint: ready ? hint : "",
  };
}

function lastThread(id) {
  const rows = Array.isArray(store.threads[id]) ? store.threads[id] : [];
  return rows[rows.length - 1] || null;
}

function contactChannels(contact) {
  const channels = [];
  if (isMobile(contact.mobile)) channels.push("whatsapp");
  if (String(contact.telegramId || "").trim()) channels.push("telegram");
  return channels;
}

function asConversation(contact) {
  const last = lastThread(contact.id);
  const channels = contactChannels(contact);
  return {
    id: contact.id,
    name: contact.name || "Client",
    mobile: contact.mobile || "",
    telegramId: contact.telegramId || "",
    broker: contact.broker || contact.desk || "T2S",
    source: contact.source || "user",
    channels,
    preview: last?.text || (channels.length ? "No messages yet" : "Add WhatsApp or Telegram"),
    lastAt: last?.at || contact.updatedAt || contact.createdAt || "",
  };
}

function userContacts(users = []) {
  return (users || [])
    .filter((row) => row && row.id)
    .map((row) => {
      const extra = store.contacts.find((item) => item.userId === row.id || item.id === row.id);
      return {
        id: row.id,
        userId: row.id,
        name: extra?.name || row.name || row.email || "Member",
        mobile: extra?.mobile || row.mobile || "",
        telegramId: extra?.telegramId || "",
        broker: extra?.broker || row.desk || "T2S",
        desk: row.desk || "T2S",
        source: "user",
        createdAt: row.createdAt || extra?.createdAt || "",
        updatedAt: extra?.updatedAt || row.lastLoginAt || "",
      };
    });
}

export function listConversations(users = []) {
  const fromUsers = userContacts(users);
  const seen = new Set(fromUsers.map((row) => row.id));
  const extras = store.contacts.filter((row) => row.id && !seen.has(row.id) && !seen.has(row.userId));
  return [...fromUsers, ...extras]
    .map(asConversation)
    .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
}

export function messagingStatus(users = [], env = process.env) {
  const wa = whatsappReady(env);
  const tg = telegramReady(env);
  const conversations = listConversations(users);
  return {
    sendVia: store.sendVia,
    whatsapp: channelStatus("whatsapp", wa, maskSecret(store.whatsapp.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID)),
    telegram: channelStatus("telegram", tg, maskSecret(store.telegram.token || env.TELEGRAM_BOT_TOKEN)),
    conversations,
  };
}

export function saveMessagingConfig(patch = {}, env = process.env) {
  const sendVia = String(patch.sendVia || store.sendVia || "both").trim();
  if (!["both", "whatsapp", "telegram"].includes(sendVia)) throw fail("Send via must be Both, WhatsApp, or Telegram.");
  store.sendVia = sendVia;
  if (patch.whatsappToken != null) store.whatsapp.token = String(patch.whatsappToken || "").trim();
  if (patch.phoneNumberId != null) store.whatsapp.phoneNumberId = String(patch.phoneNumberId || "").trim();
  if (patch.telegramToken != null) store.telegram.token = String(patch.telegramToken || "").trim();
  persist();
  return messagingStatus([], env);
}

export function upsertMessagingContact(patch = {}) {
  const name = String(patch.name || "").trim();
  if (name.length < 2) throw fail("Enter the client name.");
  const mobile = normalizeMobile(patch.mobile);
  if (mobile && !isMobile(mobile)) throw fail("Enter a 10-digit Indian mobile, or leave it blank.");
  const telegramId = String(patch.telegramId || "").trim();
  if (!mobile && !telegramId) throw fail("Add a WhatsApp mobile or a Telegram chat id.");
  const now = new Date().toISOString();
  const id = String(patch.id || "").trim() || `c${crypto.randomBytes(6).toString("hex")}`;
  let row = store.contacts.find((item) => item.id === id);
  if (!row) {
    row = { id, createdAt: now, source: "manual" };
    store.contacts.push(row);
  }
  row.name = name;
  row.mobile = mobile;
  row.telegramId = telegramId;
  row.broker = String(patch.broker || "T2S").trim() || "T2S";
  row.updatedAt = now;
  persist();
  return asConversation(row);
}

function findContact(id, users = []) {
  const conversations = listConversations(users);
  const listed = conversations.find((row) => row.id === id);
  if (listed) {
    const extra = store.contacts.find((item) => item.id === id || item.userId === id);
    return {
      ...listed,
      mobile: extra?.mobile || listed.mobile,
      telegramId: extra?.telegramId || listed.telegramId,
      broker: extra?.broker || listed.broker,
    };
  }
  throw fail("Client not found.", 404);
}

export function getThread(id) {
  return Array.isArray(store.threads[id]) ? store.threads[id] : [];
}

function pushThread(id, message) {
  if (!Array.isArray(store.threads[id])) store.threads[id] = [];
  store.threads[id].push(message);
  if (store.threads[id].length > 200) store.threads[id] = store.threads[id].slice(-200);
}

function resolveVia(requested, contact) {
  const want = String(requested || store.sendVia || "both").toLowerCase();
  const hasWa = isMobile(contact.mobile);
  const hasTg = Boolean(String(contact.telegramId || "").trim());
  const channels = [];
  if ((want === "both" || want === "whatsapp") && hasWa) channels.push("whatsapp");
  if ((want === "both" || want === "telegram") && hasTg) channels.push("telegram");
  return channels;
}

async function sendWhatsApp({ to, text, fetchImpl = fetch, env = process.env }) {
  const token = String(store.whatsapp.token || env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = String(store.whatsapp.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneNumberId) throw fail("WhatsApp is not configured. Add the Cloud API token and phone number ID.", 503);
  const dest = e164(to);
  if (!dest) throw fail("WhatsApp needs a 10-digit Indian mobile.");
  const res = await fetchImpl(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: dest,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw fail(json.error?.message || json.error?.error_user_msg || "WhatsApp send failed.", res.status || 400);
  }
  return { via: "whatsapp", id: json.messages?.[0]?.id || "" };
}

async function sendTelegram({ to, text, fetchImpl = fetch, env = process.env }) {
  const token = String(store.telegram.token || env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw fail("Telegram is not configured. Add the bot token from BotFather.", 503);
  const chatId = String(to || "").trim();
  if (!chatId) throw fail("Telegram needs a chat id. Ask the client to message your bot, then paste their chat id.");
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw fail(json.description || "Telegram send failed.", res.status || 400);
  }
  return { via: "telegram", id: String(json.result?.message_id || "") };
}

export async function sendMessaging({ contactId, text, via, users = [], fetchImpl = fetch, env = process.env } = {}) {
  const body = String(text || "").trim();
  if (!body) throw fail("Message required.");
  const contact = findContact(contactId, users);
  const channels = resolveVia(via, contact);
  if (!channels.length) throw fail("This client has no WhatsApp mobile or Telegram chat id for the selected channel.");
  const results = [];
  const errors = [];
  for (const channel of channels) {
    try {
      if (channel === "whatsapp") {
        results.push(await sendWhatsApp({ to: contact.mobile, text: body, fetchImpl, env }));
      } else {
        results.push(await sendTelegram({ to: contact.telegramId, text: body, fetchImpl, env }));
      }
    } catch (error) {
      errors.push(`${channel}: ${error.message}`);
    }
  }
  if (!results.length) throw fail(errors.join(" ") || "Send failed.");
  const message = {
    id: `m${crypto.randomBytes(5).toString("hex")}`,
    from: "You",
    text: body,
    via: results.map((row) => row.via).join("+"),
    at: new Date().toISOString(),
    mine: true,
    status: errors.length ? "partial" : "sent",
    error: errors.join(" ") || "",
  };
  pushThread(contact.id, message);
  persist();
  return { ok: true, message, results, warnings: errors };
}

export async function broadcastMessaging({ text, via, users = [], fetchImpl = fetch, env = process.env } = {}) {
  const body = String(text || "").trim();
  if (!body) throw fail("Message required.");
  const conversations = listConversations(users);
  const sent = [];
  const failed = [];
  for (const row of conversations) {
    try {
      const result = await sendMessaging({ contactId: row.id, text: body, via, users, fetchImpl, env });
      sent.push({ id: row.id, name: row.name, via: result.message.via });
    } catch (error) {
      failed.push({ id: row.id, name: row.name, error: error.message });
    }
  }
  if (!sent.length) throw fail(failed[0]?.error || "No clients received the broadcast.");
  return { ok: true, sent: sent.length, failed: failed.length, results: sent, errors: failed };
}

export function resetMessagingStore() {
  store = emptyStore();
  persist();
  return store;
}
