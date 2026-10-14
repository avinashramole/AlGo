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
const { createAlgo, drainPendingLiveAlgoOrders, queueLiveAlgoOrder, replaceDhanBook, setDhanFeed, toggleAlgo, updateAlgo, withLiveAlgo } = await import("./market.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const admin = { id: "admin", name: "Avinash", role: "admin" };
setDhanFeed({ live: true });
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
toggleAlgo(nifty.id, { enabled: true });
toggleAlgo(crude.id, { enabled: true });

function mapClients(strategy, ...userIds) {
  const ids = [...new Set([...(strategy.mappedClientIds || []), ...userIds.map((id) => String(id || "").trim())].filter(Boolean))];
  withLiveAlgo(strategy.id, (algo) => {
    algo.mappedClientIds = ids;
  });
  strategy.mappedClientIds = ids;
}

function payMember(user, strategy) {
  const enrolled = enrollStrategy({
    user,
    algo: { ...strategy, mappingScope: strategy.mappingScope || "both", mappedClientIds: [user.id, ...(strategy.mappedClientIds || [])] },
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  mapClients(strategy, user.id);
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
    sessionToken: extra.sessionToken,
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

test("individual strategy and copy trading share one order queue onto Dhan, Upstox, and Kotak accounts", () => {
  const individual = { id: "u-flow-individual-upstox", name: "Individual Upstox", email: "indiv@t2s.app", role: "user" };
  const copier = { id: "u-flow-copy-kotak", name: "Copy Kotak", email: "copykotak@t2s.app", role: "user" };
  installLive(individual, "upstox", "UPX3300", "individual-upstox-token");
  saveClientSettings(individual.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: nifty.name,
    tradeMode: "real",
    brokerId: "upstox",
  });
  installLive(copier, "kotak", "KOTAKU1", "kotak-user-trade-token", {
    apiKey: "kotak-user-consumer",
    sessionToken: "kotak-user-sid",
  });
  saveClientSettings(copier.id, {
    copy: true,
    subscriptionMode: "copy",
    tradeMode: "real",
    brokerId: "kotak",
    brokerApiKey: "kotak-user-consumer",
    brokerSessionToken: "kotak-user-sid",
  });
  mapClients(nifty, individual.id, copier.id);
  mapClients(crude, copier.id);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 25100 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  queueLiveAlgoOrder({
    strategy: crude.name,
    side: "BUY",
    symbol: "CRUDEOIL 6300 CE",
    qty: 100,
    lotSize: 100,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued);
  assert.ok(master.every((row) => row.lane === "master" && row.brokerId === "dhan"));
  const own = queuedFor(queued, individual.id);
  assert.equal(own.length, 1);
  assert.equal(own[0].lane, "individual");
  assert.equal(own[0].strategy, nifty.name);
  assert.equal(own[0].brokerId, "upstox");
  assert.equal(own[0].account.clientId, "UPX3300");
  assert.equal(own[0].account.accessToken, "individual-upstox-token");
  const copied = queuedFor(queued, copier.id);
  assert.equal(copied.length, 2);
  assert.ok(copied.every((row) => row.lane === "copy" && row.brokerId === "kotak"));
  assert.ok(copied.every((row) => row.account.clientId === "KOTAKU1"));
  assert.ok(copied.every((row) => row.account.accessToken === "kotak-user-trade-token"));
  assert.ok(copied.every((row) => row.account.apiKey === "kotak-user-consumer"));
  assert.ok(copied.every((row) => row.account.sessionToken === "kotak-user-sid"));
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
  mapClients(nifty, user.id);
  mapClients(crude, user.id);
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

test("NIFTY run still sends the admin Dhan order when a mapped user already has a lot", () => {
  const user = { id: "u-flow-open-lot", name: "Open Lot", email: "openlot@t2s.app", role: "user" };
  installLive(user, "upstox", "UPX4400", "open-lot-upstox-token");
  payMember(user, nifty);
  replaceDhanBook([
    {
      id: "copy-open-nifty",
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 90,
      strategy: nifty.name,
      brokerId: "upstox",
      option: "CE",
      strike: 24600,
      live: true,
      copyUserId: user.id,
    },
  ]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 24700 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued).filter((row) => row.strategy === nifty.name);
  const copy = queuedFor(queued, user.id);
  assert.equal(master.length, 1);
  assert.equal(master[0].brokerId, "dhan");
  assert.equal(copy.length, 1);
  assert.equal(copy[0].brokerId, "upstox");
  replaceDhanBook([]);
});

test("admin live + copy trader: both queue live; paper user stays paper", () => {
  const copier = { id: "u-mode-live-copy", name: "Live Copier", email: "livecopy@t2s.app", role: "user" };
  const paperUser = { id: "u-mode-live-paper", name: "Paper User", email: "livepaper@t2s.app", role: "user" };
  installLive(copier, "dhan", "1100555", "mode-live-copy-token");
  payMember(copier, nifty);
  selectMemberBroker({ user: paperUser, brokerId: "paper" });
  saveClientSettings(paperUser.id, { copy: true, tradeMode: "paper", brokerId: "paper", subscriptionUntil: "2026-12-31" });
  mapClients(nifty, copier.id, paperUser.id);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: nifty.name,
    side: "BUY",
    symbol: "NIFTY 25300 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued).find((row) => row.strategy === nifty.name);
  const liveCopy = queuedFor(queued, copier.id)[0];
  const paperCopy = queuedFor(queued, paperUser.id)[0];
  assert.equal(master.brokerId, "dhan");
  assert.equal(liveCopy.brokerId, "dhan");
  assert.equal(liveCopy.paper, false);
  assert.equal(liveCopy.account.accessToken, "mode-live-copy-token");
  assert.equal(paperCopy.brokerId, "paper");
  assert.equal(paperCopy.paper, true);
});

test("admin paper + copy trader: admin paper, user live; paper user stays paper", () => {
  const copier = { id: "u-mode-paper-copy", name: "Paper Admin Copier", email: "papercopy@t2s.app", role: "user" };
  const paperUser = { id: "u-mode-paper-paper", name: "Both Paper", email: "bothpaper@t2s.app", role: "user" };
  const paperNifty = createAlgo({
    id: "a-flow-nifty-paper",
    name: "NIFTY PAPER COPY",
    kind: "nifty-first-candle",
    runMode: "paper",
    mappingScope: "both",
    mappedClientIds: [],
  });
  toggleAlgo(paperNifty.id, { enabled: true });
  installLive(copier, "upstox", "UPX5500", "paper-admin-upstox-token");
  payMember(copier, paperNifty);
  selectMemberBroker({ user: paperUser, brokerId: "paper" });
  saveClientSettings(paperUser.id, { copy: true, tradeMode: "paper", brokerId: "paper", subscriptionUntil: "2026-12-31" });
  mapClients(paperNifty, copier.id, paperUser.id);
  replaceDhanBook([]);
  drainPendingLiveAlgoOrders();
  const result = queueLiveAlgoOrder({
    strategy: paperNifty.name,
    side: "BUY",
    symbol: "NIFTY 25400 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "paper",
    paper: true,
  });
  assert.equal(result.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const master = adminLegs(queued).find((row) => row.strategy === paperNifty.name);
  const liveCopy = queuedFor(queued, copier.id)[0];
  const paperCopy = queuedFor(queued, paperUser.id)[0];
  assert.equal(master.brokerId, "paper");
  assert.equal(master.paper || master.brokerId === "paper", true);
  assert.equal(liveCopy.brokerId, "upstox");
  assert.equal(liveCopy.paper, false);
  assert.equal(liveCopy.account.accessToken, "paper-admin-upstox-token");
  assert.equal(paperCopy.brokerId, "paper");
  assert.equal(paperCopy.paper, true);
  updateAlgo(paperNifty.id, { enabled: false });
});

test("WAIT ORDER BUY PE 22750 queues the admin broker and the mapped user", async () => {
  const { recoverWaitOrderLiveBuy, withLiveAlgo } = await import("./market.js");
  const user = { id: "u-wait-pe-22750", name: "Wait PE User", email: "waitpe@t2s.app", role: "user" };
  installLive(user, "dhan", "11002275", "wait-pe-member-token");
  const created = createAlgo({
    name: "NIFTY wait PE 22750",
    kind: "nifty-first-candle",
    runMode: "live",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  toggleAlgo(created.id, { enabled: true });
  payMember(user, created);
  drainPendingLiveAlgoOrders();
  try {
    const live = withLiveAlgo(created.id, (algo) => {
      algo.lastSignal =
        "WAIT ORDER · PREVIEW NIFTY FUT RED CE 22750 RED PE 22750 GREEN O 22759.90 C 22750.00 · 12:00–12:15 IST · BUY PE 22750";
      algo.vwapState = {
        ...(algo.vwapState || {}),
        buyPhase: "entry",
        inFlight: true,
        lastEntryAt: Date.now(),
        lockedStrike: 22750,
        lockedOption: "PE",
      };
      return algo;
    });
    assert.equal(
      recoverWaitOrderLiveBuy(live, {
        peStrike: 22750,
        ceStrike: 22750,
        peLtp: 110,
        ceLtp: 80,
        peSecurityId: "pe-22750",
        ceSecurityId: "ce-22750",
        expiry: "2026-10-14",
        config: { qty: 65, lots: 1, lotSize: 65, symbol: "NIFTY" },
        now: Date.now(),
      }),
      true,
    );
    const queued = drainPendingLiveAlgoOrders();
    const master = adminLegs(queued).filter((row) => row.strategy === created.name);
    const copy = queuedFor(queued, user.id);
    assert.equal(master.length, 1);
    assert.equal(master[0].option, "PE");
    assert.equal(Number(master[0].strike), 22750);
    assert.equal(master[0].brokerId, "dhan");
    assert.equal(master[0].securityId, "pe-22750");
    assert.equal(copy.length, 1);
    assert.equal(copy[0].option, "PE");
    assert.equal(Number(copy[0].strike), 22750);
    assert.equal(copy[0].copyUserId, user.id);
    assert.equal(copy[0].account.accessToken, "wait-pe-member-token");
  } finally {
    toggleAlgo(created.id, { enabled: false });
    drainPendingLiveAlgoOrders();
  }
});
