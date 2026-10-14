import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-default-broker-"));
const file = path.join(dir, "active-broker.json");
fs.writeFileSync(file, `${JSON.stringify({ activeBrokerId: "kotak" })}\n`);
process.env.T2S_ACTIVE_BROKER_FILE = file;
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const { activateBroker, ensureAdminDefaultBroker, markDhanLive, orderBrokerForDesk, publicBrokers, reloadDefaultBroker } = await import("./brokers.js");

test.after(() => {
  fs.writeFileSync(file, `${JSON.stringify({ activeBrokerId: "dhan" })}\n`);
  process.env.T2S_ACTIVE_BROKER_FILE = file;
  reloadDefaultBroker();
  delete process.env.T2S_ACTIVE_BROKER_FILE;
});

test("a Dhan-stamped strategy stays on Dhan; an empty stamp uses the selected default", () => {
  assert.equal(reloadDefaultBroker(), "kotak");
  assert.equal(publicBrokers().activeBrokerId, "kotak");
  assert.equal(orderBrokerForDesk("dhan"), "dhan");
  assert.equal(orderBrokerForDesk(""), "kotak");
  assert.equal(orderBrokerForDesk("zerodha"), "zerodha");
  markDhanLive({ clientId: "1100", funds: 10, marginUsed: 0, keyHint: "••••", displayName: "Dhan" });
  assert.equal(publicBrokers().activeBrokerId, "kotak");
  assert.equal(orderBrokerForDesk("dhan"), "dhan");
});

test("activating one broker leaves every other broker inactive", () => {
  const result = activateBroker("dhan");
  assert.equal(result.error, undefined);
  const actives = (result.brokers || []).filter((row) => row.active).map((row) => row.id);
  assert.deepEqual(actives, ["dhan"]);
  assert.equal((result.brokers || []).every((row) => row.id === "dhan" || row.active === false), true);
});

test("setting Dhan as the default is saved and used for the next order", () => {
  const result = activateBroker("dhan");
  assert.equal(result.error, undefined);
  assert.equal(result.activeBrokerId, "dhan");
  assert.equal(orderBrokerForDesk("dhan"), "dhan");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).activeBrokerId, "dhan");
  delete process.env.T2S_ACTIVE_BROKER_FILE;
});

test("ensureAdminDefaultBroker writes Dhan over a saved Kotak file", () => {
  process.env.T2S_ACTIVE_BROKER_FILE = file;
  fs.writeFileSync(file, `${JSON.stringify({ activeBrokerId: "kotak" })}\n`);
  assert.equal(reloadDefaultBroker(), "kotak");
  assert.equal(ensureAdminDefaultBroker(), "dhan");
  assert.equal(publicBrokers().activeBrokerId, "dhan");
  assert.equal(publicBrokers().mainBrokerId, "dhan");
  assert.equal(orderBrokerForDesk(""), "dhan");
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).activeBrokerId, "dhan");
});

test("a live boot writes Dhan over a saved Kotak default", async () => {
  const bootFile = path.join(dir, "boot-active-broker.json");
  fs.writeFileSync(bootFile, `${JSON.stringify({ activeBrokerId: "kotak" })}\n`);
  const brokersUrl = new URL("./brokers.js", import.meta.url).href;
  const env = { ...process.env, NODE_ENV: "production", T2S_ACTIVE_BROKER_FILE: bootFile, T2S_BROKER_SESSIONS_FILE: path.join(dir, "boot-sessions.json") };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const { publicBrokers } = await import(${JSON.stringify(brokersUrl)}); process.stdout.write(publicBrokers().activeBrokerId);`,
    ],
    { env },
  );
  const out = await new Promise((resolve, reject) => {
    let text = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      text += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(text.trim());
      else reject(new Error(err || `boot child exited ${code}`));
    });
  });
  assert.equal(out, "dhan");
  assert.equal(JSON.parse(fs.readFileSync(bootFile, "utf8")).activeBrokerId, "dhan");
});

test("admin boot keeps Dhan as the default broker", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
  assert.match(src, /ensureAdminDefaultBroker/);
});
