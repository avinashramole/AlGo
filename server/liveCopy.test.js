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
const { getMemberDesk, installMemberBroker, recordMemberCopyFill, selectMemberBroker, sizeCopyQty } = await import("./memberDesk.js");
const { dispatchMemberCopies, listLiveCopyTargets, memberCopyPayloads } = await import("./liveCopy.js");
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
