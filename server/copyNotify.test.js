import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-copy-notify-"));
process.env.T2S_MESSAGING_FILE = path.join(dir, "messaging.json");
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");

const { buildCopyAlertText, copyNotifyChannels, notifyMemberCopy } = await import("./copyNotify.js");
const { resetMessagingStore, saveMessagingConfig, upsertMessagingContact } = await import("./messaging.js");

resetMessagingStore();

test("buildCopyAlertText describes copied and rejected orders", () => {
  assert.equal(buildCopyAlertText({ side: "BUY", qty: 65, symbol: "NIFTY 24600 CE", strategy: "NIFTY VWAP ATM", status: "FILLED" }), "Copied BUY 65 NIFTY 24600 CE · NIFTY VWAP ATM · FILLED");
  assert.match(buildCopyAlertText({ side: "SELL", qty: 30, symbol: "CRUDEOIL", error: new Error("token expired") }), /Copy failed: SELL 30 CRUDEOIL/);
});

test("copyNotifyChannels follow instant, WhatsApp, and Telegram flags", () => {
  assert.deepEqual(copyNotifyChannels({}), ["whatsapp"]);
  assert.deepEqual(copyNotifyChannels({ instantAlerts: false, whatsapp: true, telegram: true }), []);
  assert.deepEqual(copyNotifyChannels({ instantAlerts: true, whatsapp: false, telegram: true }), ["telegram"]);
  assert.deepEqual(copyNotifyChannels({ instantAlerts: true, whatsapp: true, telegram: true }), ["whatsapp", "telegram"]);
});

test("notifyMemberCopy sends WhatsApp when the channel is ready", async () => {
  saveMessagingConfig({
    sendVia: "whatsapp",
    whatsappToken: "EAAB-test-token",
    phoneNumberId: "123456789012345",
  });
  upsertMessagingContact({
    id: "u-notify",
    userId: "u-notify",
    name: "Notify Member",
    mobile: "9876543210",
  });
  const calls = [];
  const result = await notifyMemberCopy({
    userId: "u-notify",
    text: "Copied BUY 65 NIFTY 24600 CE · FILLED",
    notifications: { instantAlerts: true, whatsapp: true, telegram: false },
    fetchImpl: async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) };
    },
  });
  assert.equal(result.sent, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /graph\.facebook\.com/);
  assert.equal(calls[0].body.to, "919876543210");
  assert.match(calls[0].body.text.body, /Copied BUY 65/);
});
