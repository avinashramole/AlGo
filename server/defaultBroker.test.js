import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-default-broker-"));
const file = path.join(dir, "active-broker.json");
fs.writeFileSync(file, `${JSON.stringify({ activeBrokerId: "kotak" })}\n`);
process.env.T2S_ACTIVE_BROKER_FILE = file;
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const { activateBroker, markDhanLive, orderBrokerForDesk, publicBrokers, reloadDefaultBroker } = await import("./brokers.js");

test.after(() => {
  fs.writeFileSync(file, `${JSON.stringify({ activeBrokerId: "dhan" })}\n`);
  process.env.T2S_ACTIVE_BROKER_FILE = file;
  reloadDefaultBroker();
  delete process.env.T2S_ACTIVE_BROKER_FILE;
});

test("a Dhan strategy uses the selected default broker, and another named broker stays", () => {
  assert.equal(reloadDefaultBroker(), "kotak");
  assert.equal(publicBrokers().activeBrokerId, "kotak");
  assert.equal(orderBrokerForDesk("dhan"), "kotak");
  assert.equal(orderBrokerForDesk(""), "kotak");
  assert.equal(orderBrokerForDesk("zerodha"), "zerodha");
  markDhanLive({ clientId: "1100", funds: 10, marginUsed: 0, keyHint: "••••", displayName: "Dhan" });
  assert.equal(publicBrokers().activeBrokerId, "kotak");
  assert.equal(orderBrokerForDesk("dhan"), "kotak");
});

test("setting Dhan as the default is saved and used for the next order", () => {
  const result = activateBroker("dhan");
  assert.equal(result.error, undefined);
  assert.equal(result.activeBrokerId, "dhan");
  assert.equal(orderBrokerForDesk("dhan"), "dhan");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).activeBrokerId, "dhan");
  delete process.env.T2S_ACTIVE_BROKER_FILE;
});
