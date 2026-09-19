import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-copy-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const { claimEnrollmentPaid, enrollStrategy, markEnrollmentPaid, savePaymentSettings } = await import("./subscriptions.js");
const { getMemberDesk, installMemberBroker, recordMemberCopyFill, saveClientSettings, selectMemberBroker, sizeCopyQty } = await import("./memberDesk.js");
const { dispatchMemberCopies, dispatchMemberExitCopies, listLiveCopyTargets, memberCopyPayloads, memberExitPayload } = await import("./liveCopy.js");
const { sendMemberCopyOrder } = await import("./liveCopySend.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const admin = { id: "admin", name: "Avinash", role: "admin" };
const algo = { id: "a4", name: "NIFTY VWAP ATM", mappingScope: "both" };

function payMember(user, strategy = algo) {
  const enrolled = enrollStrategy({
    user,
    algo: strategy,
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  return markEnrollmentPaid({ user: admin, enrollmentId: enrolled.enrollment.id });
}

test("sizeCopyQty supports multiplier lots and fixed", () => {
  assert.equal(sizeCopyQty(65, { sizingKind: "multiplier", sizingValue: 2, lotSize: 65 }), 130);
  assert.equal(sizeCopyQty(65, { sizingKind: "lots", sizingValue: 2, lotSize: 65 }), 130);
  assert.equal(sizeCopyQty(65, { sizingKind: "fixed", sizingValue: 30, lotSize: 65 }), 30);
  assert.equal(sizeCopyQty(65, { sizingKind: "multiplier", sizingValue: 1, lotSize: 65 }), 65);
});

test("claimed payment is not a live copy target", () => {
  const user = { id: "u-claimed", name: "Claimed", email: "claimed@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100000001", accessToken: "dhan-member-token" });
  const enrolled = enrollStrategy({
    user,
    algo,
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  claimEnrollmentPaid({ user, enrollmentId: enrolled.enrollment.id, utr: "UTRCLAIM1" });
  assert.deepEqual(
    listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65, lotSize: 65 }),
    [],
  );
});

test("paid real members with a token are live copy targets", () => {
  const user = { id: "u-live", name: "Live Member", email: "live@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100000002", accessToken: "dhan-live-token" });
  payMember(user);
  const targets = listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65, lotSize: 65 });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerId, "dhan");
  assert.equal(mine.brokerToken, "dhan-live-token");
  assert.equal(mine.qty, 65);
});

test("real members without a token are skipped", () => {
  const user = { id: "u-notoken", name: "No Token", email: "notoken@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  payMember(user);
  const targets = listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65 });
  assert.equal(targets.some((row) => row.userId === user.id), false);
});

test("paper members get a book fill only", () => {
  const user = { id: "u-paper", name: "Paper", email: "paper@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  payMember(user);
  const targets = listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65, lotSize: 65 });
  const mine = targets.find((row) => row.userId === user.id);
  assert.equal(mine.paper, true);
  assert.equal(mine.brokerId, "paper");
  assert.equal(mine.brokerToken, "");
});

test("copy master clients without a through date still receive admin orders", () => {
  const user = { id: "u-copy-open", name: "Copy Open", email: "copyopen@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100666", accessToken: "open-copy-token" });
  saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "copy",
    subscriptionUntil: "",
    tradeMode: "real",
    brokerId: "dhan",
  });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [],
  });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerToken, "open-copy-token");
});

test("mapped real members with copy off still get that strategy on their new token", () => {
  const user = { id: "u-map-real", name: "Map Real", email: "mapreal@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100771", accessToken: "map-old-token" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100771", accessToken: "map-new-token" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "User Map VWAP",
    tradeMode: "real",
    brokerId: "dhan",
  });
  const copies = memberCopyPayloads(
    { strategy: "User Map VWAP", side: "BUY", symbol: "NIFTY 24600 CE", qty: 65, lotSize: 65, brokerId: "dhan" },
    { id: "a-user-map", name: "User Map VWAP", mappingScope: "both", mappedClientIds: [] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine);
  assert.equal(mine.paper, false);
  assert.equal(mine.account.accessToken, "map-new-token");
});

test("copy master clients receive admin orders without enrollment or algo mapping", () => {
  const user = { id: "u-copy-master", name: "Copy Master", email: "copymaster@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "copy",
    subscriptionUntil: "2026-12-31",
    tradeMode: "paper",
    brokerId: "paper",
  });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [],
  });
  assert.equal(targets.some((row) => row.userId === user.id), true);
});

test("users mapped strategy on All clients copies that strategy without enrollment", () => {
  const user = { id: "u-user-map", name: "User Map", email: "usermap@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "User Map VWAP",
    tradeMode: "paper",
    brokerId: "paper",
  });
  const targets = listLiveCopyTargets({
    strategyName: "User Map VWAP",
    strategyId: "a-user-map",
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [],
  });
  assert.deepEqual(
    targets.filter((row) => row.userId === user.id).map((row) => row.userId),
    [user.id],
  );
});

test("expired subscriptionUntil is not a copy target", () => {
  const user = { id: "u-expired", name: "Expired", email: "expired@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "copy",
    subscriptionUntil: "2020-01-01",
    tradeMode: "paper",
    brokerId: "paper",
  });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    mappingScope: "both",
    mappedClientIds: [],
  });
  assert.equal(targets.some((row) => row.userId === user.id), false);
});

test("mapped clients copy without a paid enrollment when scope is clients", () => {
  const user = { id: "u-mapped-only", name: "Mapped Only", email: "mappedonly@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    lotSize: 65,
    mappingScope: "clients",
    mappedClientIds: [user.id],
  });
  assert.deepEqual(targets.map((row) => row.userId), [user.id]);
  assert.equal(targets[0].paper, true);
});

test("mappingScope both with mapped ids does not copy unmapped paid members", () => {
  const keep = { id: "u-mapped", name: "Mapped", email: "mapped@t2s.app", role: "user" };
  const skip = { id: "u-other", name: "Other", email: "other@t2s.app", role: "user" };
  for (const user of [keep, skip]) {
    selectMemberBroker({ user, brokerId: "paper" });
    payMember(user);
  }
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    mappingScope: "both",
    mappedClientIds: [keep.id],
  });
  assert.deepEqual(targets.map((row) => row.userId), [keep.id]);
});

test("mappingScope master sends no copies and clients filters mapped ids", () => {
  const keep = { id: "u-mapped", name: "Mapped", email: "mapped@t2s.app", role: "user" };
  const skip = { id: "u-other", name: "Other", email: "other@t2s.app", role: "user" };
  for (const user of [keep, skip]) {
    selectMemberBroker({ user, brokerId: "dhan" });
    installMemberBroker({ user, brokerId: "dhan", clientId: `${user.id}-cid`, accessToken: `${user.id}-token` });
    payMember(user);
  }
  assert.deepEqual(
    listLiveCopyTargets({
      strategyName: algo.name,
      strategyId: algo.id,
      masterQty: 65,
      mappingScope: "master",
      mappedClientIds: [keep.id],
    }),
    [],
  );
  const clients = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    mappingScope: "clients",
    mappedClientIds: [keep.id],
  });
  assert.deepEqual(clients.map((row) => row.userId), [keep.id]);
});

test("memberCopyPayloads attach copyUserId and member credentials", () => {
  const user = { id: "u-payload", name: "Payload", email: "payload@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100999", accessToken: "payload-token" });
  payMember(user);
  const copies = memberCopyPayloads(
    { strategy: algo.name, side: "BUY", symbol: "NIFTY 24600 CE", qty: 65, lotSize: 65, brokerId: "dhan" },
    algo,
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.equal(mine.qty, 65);
  assert.equal(mine.account.clientId, "1100999");
  assert.equal(mine.account.accessToken, "payload-token");
  assert.equal(mine.brokerSession.accessToken, "payload-token");
});

test("recordMemberCopyFill writes the member book used by My plan", () => {
  const user = { id: "u-book", name: "Book", email: "book@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  const paid = payMember(user);
  const fill = recordMemberCopyFill({
    userId: user.id,
    payload: { symbol: "NIFTY 24600 CE", side: "BUY", qty: 65, price: 80, strategy: algo.name, brokerId: "dhan" },
    paper: true,
  });
  assert.equal(fill.symbol, "NIFTY 24600 CE");
  assert.equal(fill.status, "FILLED");
  const desk = getMemberDesk({ user, enrollments: [paid], algos: [algo], quote: () => 0 });
  assert.ok(desk.positions.some((row) => row.symbol === "NIFTY 24600 CE" && row.qty === 65));
});

test("dispatchMemberCopies writes paper fills for mapped clients", () => {
  const user = { id: "u-dispatch", name: "Dispatch", email: "dispatch@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  dispatchMemberCopies(
    { strategy: algo.name, side: "BUY", symbol: "NIFTY 24800 CE", qty: 65, price: 55, brokerId: "paper" },
    { ...algo, mappingScope: "clients", mappedClientIds: [user.id] },
  );
  const desk = getMemberDesk({
    user,
    enrollments: [],
    algos: [algo],
    quote: () => 0,
  });
  assert.ok(desk.positions.some((row) => row.symbol === "NIFTY 24800 CE"));
  assert.ok((desk.orders || []).some((row) => row.symbol === "NIFTY 24800 CE" && row.status === "FILLED"));
});

test("memberExitPayload is the opposite market side of the master open", () => {
  const exit = memberExitPayload(
    { symbol: "NIFTY 24600 CE", type: "BUY", qty: 65, ltp: 88, strategy: algo.name, product: "MIS" },
    { strategy: algo.name },
  );
  assert.equal(exit.side, "SELL");
  assert.equal(exit.symbol, "NIFTY 24600 CE");
  assert.equal(exit.qty, 65);
  assert.equal(exit.type, "MARKET");
  assert.equal(exit.strategy, algo.name);
});

test("dispatchMemberExitCopies closes mapped paper positions on master exit", () => {
  const user = { id: "u-exit-map", name: "Exit Map", email: "exitmap@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  const mapped = { ...algo, mappingScope: "clients", mappedClientIds: [user.id] };
  dispatchMemberCopies(
    { strategy: algo.name, side: "BUY", symbol: "NIFTY 24900 CE", qty: 65, price: 70, brokerId: "paper" },
    mapped,
  );
  const open = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.ok(open.positions.some((row) => row.symbol === "NIFTY 24900 CE" && row.qty === 65));
  dispatchMemberExitCopies(
    { symbol: "NIFTY 24900 CE", type: "BUY", qty: 65, strategy: algo.name, ltp: 90, brokerId: "paper" },
    mapped,
  );
  const closed = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.equal(closed.positions.some((row) => row.symbol === "NIFTY 24900 CE"), false);
  assert.ok((closed.orders || []).some((row) => row.symbol === "NIFTY 24900 CE" && row.side === "SELL" && row.status === "FILLED"));
});

test("dispatchMemberExitCopies queues a live SELL on mapped real accounts", () => {
  const user = { id: "u-exit-live", name: "Exit Live", email: "exitlive@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100888", accessToken: "exit-live-token" });
  payMember(user);
  const queued = [];
  dispatchMemberExitCopies(
    { symbol: "NIFTY 25000 PE", type: "BUY", qty: 65, strategy: algo.name, securityId: "12345" },
    algo,
    { enqueueLiveOrder: (copy) => queued.push(copy) },
  );
  const mine = queued.find((row) => row.copyUserId === user.id);
  assert.ok(mine);
  assert.equal(mine.side, "SELL");
  assert.equal(mine.symbol, "NIFTY 25000 PE");
  assert.equal(mine.account.accessToken, "exit-live-token");
});

test("master exit closes every mapped paper client on that strategy", () => {
  const a = { id: "u-exit-a", name: "Exit A", email: "exita@t2s.app", role: "user" };
  const b = { id: "u-exit-b", name: "Exit B", email: "exitb@t2s.app", role: "user" };
  for (const user of [a, b]) selectMemberBroker({ user, brokerId: "paper" });
  const mapped = { ...algo, mappingScope: "clients", mappedClientIds: [a.id, b.id] };
  dispatchMemberCopies(
    { strategy: algo.name, side: "BUY", symbol: "NIFTY 25100 CE", qty: 65, price: 42, brokerId: "paper" },
    mapped,
  );
  dispatchMemberExitCopies(
    { symbol: "NIFTY 25100 CE", type: "BUY", qty: 65, strategy: algo.name, ltp: 50, brokerId: "paper" },
    mapped,
  );
  for (const user of [a, b]) {
    const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
    assert.equal(desk.positions.some((row) => row.symbol === "NIFTY 25100 CE"), false);
    assert.ok((desk.orders || []).some((row) => row.side === "SELL" && row.symbol === "NIFTY 25100 CE"));
  }
});

test("member live BUY still queues when the master desk already has a Nifty option", async () => {
  const user = { id: "u-nifty-copy", name: "Nifty Copy", email: "niftycopy@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100777", accessToken: "member-buy-token" });
  payMember(user);
  const { drainPendingLiveAlgoOrders, queueLiveAlgoOrder, replaceDhanBook } = await import("./market.js");
  replaceDhanBook([
    {
      id: "p-master-nifty",
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 90,
      product: "MIS",
      brokerId: "dhan",
      live: true,
    },
  ]);
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: algo.name,
    side: "BUY",
    symbol: "NIFTY 24700 CE",
    qty: 65,
    lotSize: 65,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const copy = queued.find((row) => row.copyUserId === user.id);
  assert.ok(copy);
  assert.equal(copy.account.accessToken, "member-buy-token");
  replaceDhanBook([]);
});

test("sendMemberCopyOrder paper path writes the member book", async () => {
  const user = { id: "u-send", name: "Send", email: "send@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "paper" });
  payMember(user);
  const order = await sendMemberCopyOrder({
    copyUserId: user.id,
    paper: true,
    brokerId: "paper",
    symbol: "NIFTY 24700 PE",
    side: "BUY",
    qty: 65,
    price: 40,
    strategy: algo.name,
  });
  assert.equal(order.status, "FILLED");
  assert.equal(order.symbol, "NIFTY 24700 PE");
  const desk = getMemberDesk({
    user,
    enrollments: [{ strategyId: algo.id, strategyName: algo.name, status: "paid" }],
    algos: [algo],
    quote: () => 0,
  });
  assert.ok(desk.positions.some((row) => row.symbol === "NIFTY 24700 PE"));
});
