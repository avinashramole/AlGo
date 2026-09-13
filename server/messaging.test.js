import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-msg-"));
process.env.T2S_MESSAGING_FILE = path.join(dir, "messaging.json");

const {
  broadcastMessaging,
  listConversations,
  messagingStatus,
  resetMessagingStore,
  saveMessagingConfig,
  sendMessaging,
  upsertMessagingContact,
  whatsappReady,
  telegramReady,
} = await import("./messaging.js");

resetMessagingStore();

test("messaging starts with WhatsApp and Telegram setup required", () => {
  const status = messagingStatus([]);
  assert.equal(status.whatsapp.ready, false);
  assert.equal(status.telegram.ready, false);
  assert.equal(status.whatsapp.label, "SETUP REQUIRED");
  assert.equal(status.telegram.label, "SETUP REQUIRED");
  assert.equal(whatsappReady({}), false);
  assert.equal(telegramReady({}), false);
});

test("saveMessagingConfig stores tokens without echoing the secret", () => {
  const status = saveMessagingConfig({
    sendVia: "both",
    whatsappToken: "EAAB-secret-token-value",
    phoneNumberId: "123456789012345",
    telegramToken: "123456:ABC-def_secret",
  });
  assert.equal(status.whatsapp.ready, true);
  assert.equal(status.telegram.ready, true);
  assert.equal(status.whatsapp.label, "CONNECTED");
  assert.match(status.whatsapp.hint, /123/);
  assert.equal(status.whatsapp.hint.includes("secret-token-value"), false);
});

test("listConversations includes registered members and extra contacts", () => {
  upsertMessagingContact({ name: "Arpit", mobile: "9876543210", broker: "DHAN" });
  const rows = listConversations([
    { id: "u1", name: "Zeenat", mobile: "9123456789", desk: "Index Options", role: "user" },
    { id: "admin1", name: "Avinash", role: "admin" },
  ]);
  assert.equal(rows.some((row) => row.name === "Arpit" && row.channels.includes("whatsapp")), true);
  assert.equal(rows.some((row) => row.name === "Zeenat"), true);
  assert.equal(rows.some((row) => row.name === "Avinash"), false);
});

test("sendMessaging posts WhatsApp Cloud API text to the Indian mobile", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
  };
  const contact = upsertMessagingContact({ name: "Gagan", mobile: "9988776655", broker: "DHAN" });
  const result = await sendMessaging({
    contactId: contact.id,
    text: "NIFTY PE filled 1 lot",
    via: "whatsapp",
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].body.to, "919988776655");
  assert.equal(calls[0].body.text.body, "NIFTY PE filled 1 lot");
  assert.match(calls[0].url, /123456789012345\/messages/);
});

test("broadcastMessaging skips clients that cannot receive the selected channel", async () => {
  resetMessagingStore();
  saveMessagingConfig({
    sendVia: "telegram",
    telegramToken: "123456:ABC",
    whatsappToken: "",
    phoneNumberId: "",
  });
  const waOnly = upsertMessagingContact({ name: "WA Only", mobile: "9000000001" });
  const tgOnly = upsertMessagingContact({ name: "TG Only", telegramId: "777" });
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, result: { message_id: 9 } }) });
  const result = await broadcastMessaging({ text: "Desk is live", via: "telegram", fetchImpl });
  assert.equal(result.sent, 1);
  assert.equal(result.results[0].id, tgOnly.id);
  assert.equal(result.errors.some((row) => row.id === waOnly.id), true);
});
