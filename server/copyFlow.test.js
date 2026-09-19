import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-copy-flow-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");

const { enrollStrategy, markEnrollmentPaid, savePaymentSettings } = await import("./subscriptions.js");
const { installMemberBroker, saveClientSettings, selectMemberBroker } = await import("./memberDesk.js");
const { createAlgo, drainPendingLiveAlgoOrders, queueLiveAlgoOrder, replaceDhanBook } = await import("./market.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const admin = { id: "admin", name: "Avinash", role: "admin" };
const nifty = createAlgo({
  id: "a-flow-nifty",
  name: "NIFTY VWAP ATM",
  kind: "indicator",
  runMode: "live",
  mappingScope: "both",
  mappedClientIds: [],
});
const crude = createAlgo({
  id: "a-flow-crude",
  name: "CRUDE VWAP",
  kind: "indicator",
  runMode: "live",
  mappingScope: "both",
  mappedClientIds: [],
});

function payMember(user, strategy) {
  const enrolled = enrollStrategy({
    user,
    algo: strategy,
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  return markEnrollmentPaid({ user: admin, enrollmentId: enrolled.enrollment.id });
}

function installLive(user, brokerId, clientId, token, extra = {}) {
  selectMemberBroker({ user, brokerId });
  installMemberBroker({
    user,
    brokerId,
    clientId,
    accessToken: token,
    apiKey: extra.apiKey,
  });
}

function queuedFor(queued, userId) {
  return queued.filter((row) => String(row.copyUserId || "") === String(userId || ""));
}

function adminLegs(queued) {
  return queued.filter((row) => !row.copyUserId);
}

test("same strategy, different brokers: admin Dhan and member Upstox both queue", () => {
  const user = { id: "u-flow-upstox", name: "Upstox Member", email: "upstox@t2s.app", role: "user" };
  installLive(user, "upstox", "UPX1100", "upstox-member-token");
  payMember(user, nifty);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 24600 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued);
  const copy = queuedFor(queued, user.id);
  assert.equal(master.length, 1);
  assert.equal(master[0].brokerId, "dhan");
  assert.equal(master[0].strategy, nifty.name);
  assert.equal(copy.length, 1);
  assert.equal(copy[0].brokerId, "upstox");
  assert.equal(copy[0].account.clientId, "UPX1100");
  assert.equal(copy[0].account.accessToken, "upstox-member-token");
  assert.equal(copy[0].strategy, nifty.name);
  assert.equal(copy[0].qty, 65);
});

test("same strategy, same broker: admin and member Dhan accounts both queue", () => {
  const user = { id: "u-flow-dhan", name: "Dhan Member", email: "dhanmem@t2s.app", role: "user" };
  installLive(user, "dhan", "1100333", "dhan-member-token");
  payMember(user, nifty);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 24700 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued);
  const copy = queuedFor(queued, user.id);
  assert.equal(master.length, 1);
  assert.equal(master[0].brokerId, "dhan");
  assert.equal(copy.length, 1);
  assert.equal(copy[0].brokerId, "dhan");
  assert.equal(copy[0].account.accessToken, "dhan-member-token");
  assert.notEqual(copy[0].account.clientId, master[0].account?.clientId || "");
});

test("different strategy: crude-mapped Zerodha member is not copied on a Nifty signal", () => {
  const user = { id: "u-flow-zerodha-crude", name: "Crude Zerodha", email: "crudez@t2s.app", role: "user" };
  installLive(user, "zerodha", "ZD9001", "zerodha-crude-token", { apiKey: "kite-api-key" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: crude.name,
    tradeMode: "real",
    brokerId: "zerodha",
  });
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 24800 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  assert.ok(adminLegs(queued).some((row) => row.strategy === nifty.name && row.brokerId === "dhan"));
  assert.equal(queuedFor(queued, user.id).length, 0);
});

test("different strategies flow together: admin Dhan Nifty+Crude, members on Dhan and Upstox", () => {
  const niftyUser = { id: "u-flow-nifty-dhan", name: "Nifty Dhan", email: "niftyd@t2s.app", role: "user" };
  const crudeUser = { id: "u-flow-crude-upstox", name: "Crude Upstox", email: "crudeu@t2s.app", role: "user" };
  installLive(niftyUser, "dhan", "1100444", "nifty-dhan-token");
  payMember(niftyUser, nifty);
  saveClientSettings(niftyUser.id, { copy: false, subscriptionMode: "strategy" });
  installLive(crudeUser, "upstox", "UPX2200", "crude-upstox-token");
  saveClientSettings(crudeUser.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: crude.name,
    tradeMode: "real",
    brokerId: "upstox",
  });
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 24900 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  queueLiveAlgoOrder({
    strategy: crude.name,
    side: "BUY",
    symbol: "CRUDEOIL 6100 CE",
    qty: 100,
    lotSize: 100,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const masterNifty = adminLegs(queued).find((row) => row.strategy === nifty.name);
  const masterCrude = adminLegs(queued).find((row) => row.strategy === crude.name);
  const niftyCopy = queuedFor(queued, niftyUser.id);
  const crudeCopy = queuedFor(queued, crudeUser.id);
  assert.ok(masterNifty, "admin Nifty order should queue");
  assert.ok(masterCrude, "admin Crude order should queue at the same time as Nifty");
  assert.equal(masterNifty.brokerId, "dhan");
  assert.equal(masterCrude.brokerId, "dhan");
  assert.equal(niftyCopy.length, 1);
  assert.equal(niftyCopy[0].brokerId, "dhan");
  assert.equal(niftyCopy[0].account.accessToken, "nifty-dhan-token");
  assert.equal(niftyCopy[0].strategy, nifty.name);
  assert.equal(crudeCopy.length, 1);
  assert.equal(crudeCopy[0].brokerId, "upstox");
  assert.equal(crudeCopy[0].account.accessToken, "crude-upstox-token");
  assert.equal(crudeCopy[0].strategy, crude.name);
  assert.equal(
    queuedFor(queued, niftyUser.id).some((row) => row.strategy === crude.name),
    false,
    "Nifty member must not receive Crude",
  );
  assert.equal(
    queuedFor(queued, crudeUser.id).some((row) => row.strategy === nifty.name),
    false,
    "Crude member must not receive Nifty",
  );
});

test("copy-master member on a different broker receives both strategies with the member token", () => {
  const user = { id: "u-flow-copy-master", name: "Copy Master", email: "cmaster@t2s.app", role: "user" };
  installLive(user, "angelone", "A1234", "angel-copy-token", { apiKey: "angel-api-key" });
  saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "copy",
    subscriptionUntil: "2026-12-31",
    tradeMode: "real",
    brokerId: "angelone",
  });
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 25000 PE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  queueLiveAlgoOrder({
    strategy: crude.name,
    side: "BUY",
    symbol: "CRUDEOIL 6200 PE",
    qty: 100,
    lotSize: 100,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const copies = queuedFor(queued, user.id);
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map((row) => row.strategy).sort(), [crude.name, nifty.name].sort());
  assert.ok(copies.every((row) => row.brokerId === "angelone"));
  assert.ok(copies.every((row) => row.account.accessToken === "angel-copy-token"));
  assert.ok(adminLegs(queued).some((row) => row.strategy === nifty.name && row.brokerId === "dhan"));
  assert.ok(adminLegs(queued).some((row) => row.strategy === crude.name && row.brokerId === "dhan"));
});
