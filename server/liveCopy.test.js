import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-copy-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");

const { adminCreateMember } = await import("./auth.js");
const { claimEnrollmentPaid, enrollStrategy, markEnrollmentPaid, savePaymentSettings } = await import("./subscriptions.js");
const { getMemberDesk, installMemberBroker, peekClientSecrets, recordMemberCopyFill, saveClientSettings, selectMemberBroker, sizeCopyQty } = await import("./memberDesk.js");
const { awaitMemberCopySends, dispatchMemberCopies, dispatchMemberExitCopies, findLiveCopyAlgo, listCopyOnTargets, listLiveCopyTargets, memberCopyPayloads, memberExitPayload, resetMemberExitCopyLocks } = await import("./liveCopy.js");
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
    algo: { ...strategy, mappingScope: strategy.mappingScope || "both", mappedClientIds: [user.id, ...(strategy.mappedClientIds || [])] },
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  saveClientSettings(user.id, { mappedStrategy: strategy.name });
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
  saveClientSettings(user.id, { copy: false, subscriptionMode: "strategy", subscriptionUntil: "" });
  const enrolled = enrollStrategy({
    user,
    algo: { ...algo, mappedClientIds: [user.id], mappingScope: "both" },
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

test("real members without a token still copy on the admin Dhan desk", () => {
  const user = { id: "u-notoken", name: "No Token", email: "notoken@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  payMember(user);
  const targets = listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65 });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.brokerToken, "");
  assert.equal(mine.copyBlocked, "");
  assert.equal(mine.adminDesk, true);
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

test("admin saving a member token without a through date still enables a mapped copy", () => {
  const user = { id: "u-copy-open", name: "Copy Open", email: "copyopen@t2s.app", role: "user" };
  saveClientSettings(user.id, {
    brokerId: "dhan",
    accountId: "1100666",
    brokerToken: "open-copy-token",
  });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    strategyId: algo.id,
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerToken, "open-copy-token");
  assert.ok(String(mine.userId));
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

test("a mapped member with an installed token copies while logged off and with no through date", () => {
  const user = { id: "u-copy-logged-off", name: "Logged Off", email: "loggedoff@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100555", accessToken: "logged-off-token" });
  saveClientSettings(user.id, { copy: true, subscriptionMode: "copy", subscriptionUntil: "" });
  const targets = listLiveCopyTargets({
    strategyName: algo.name,
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine, "mapped member must copy while logged off");
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerToken, "logged-off-token");
  assert.equal(mine.accountId, "1100555");
});

test("manual admin order does not copy an unmapped Copy ON member", async () => {
  const user = { id: "u-copy-ignore-scope", name: "Ignore Scope", email: "ignorescope@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100666", accessToken: "ignore-scope-token" });
  saveClientSettings(user.id, { copy: true, subscriptionMode: "copy", subscriptionUntil: "" });
  const { fanOutAdminOrderCopies } = await import("./market.js");
  const result = fanOutAdminOrderCopies(
    { symbol: "NIFTY 25300 CE", side: "BUY", qty: 65, price: 80, strategy: "Desk BUY", brokerId: "dhan" },
    { symbol: "NIFTY 25300 CE", side: "BUY", qty: 65, strategy: "Desk BUY" },
  );
  assert.equal(result.copies, 0);
  await awaitMemberCopySends();
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.equal(
    (desk.alerts || []).some((row) => row.symbol === "NIFTY 25300 CE"),
    false,
  );
});

test("Copy ON with a saved token is a live target even in paper mode", () => {
  const user = { id: "u-copy-paper-token", name: "Paper Token", email: "papertoken@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100444", accessToken: "paper-mode-token" });
  saveClientSettings(user.id, { copy: true, tradeMode: "paper", subscriptionMode: "strategy", subscriptionUntil: "" });
  const mine = listCopyOnTargets({ masterQty: 65, lotSize: 65 }).find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerToken, "paper-mode-token");
  assert.equal(mine.accountId, "1100444");
});

test("turning Copy on without a through date does not copy until the user is mapped", () => {
  const user = { id: "u-copy-no-until", name: "Copy No Until", email: "copynountil@t2s.app", role: "user" };
  const saved = saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "copy",
    tradeMode: "paper",
    brokerId: "paper",
  });
  assert.match(String(saved.subscriptionUntil || ""), /^\d{4}-\d{2}-\d{2}$/);
  const targets = listLiveCopyTargets({
    strategyName: "",
    masterQty: 50,
    lotSize: 50,
    mappingScope: "both",
    mappedClientIds: [],
  });
  assert.equal(targets.some((row) => row.userId === user.id), false);
});

test("Copy ON without a card map does not receive admin orders", () => {
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
  assert.equal(targets.some((row) => row.userId === user.id), false);
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

test("Copy ON Upstox does not send a leftover Dhan token or client id", () => {
  const user = { id: "u-leftover-upx", name: "Leftover Upx", email: "leftoverupx@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11008801", accessToken: "dhan-leftover-token" });
  saveClientSettings(user.id, {
    copy: true,
    brokerId: "upstox",
    accountId: "11008801",
    brokerToken: "dhan-leftover-token",
    subscriptionUntil: "",
  });
  const copies = memberCopyPayloads(
    { strategy: "Desk BUY", side: "BUY", symbol: "NIFTY 22850 PE", qty: 65, lotSize: 65, brokerId: "dhan" },
    { mappingScope: "both", mappedClientIds: [user.id] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine, "mapped leftover Upstox still notifies instead of silently skipping");
  assert.equal(mine.brokerId, "upstox");
  assert.equal(mine.leftoverSlot, true);
  assert.equal(mine.account.accessToken, "");
  assert.equal(mine.account.clientId, "");
  assert.notEqual(mine.account.accessToken, "dhan-leftover-token");
  assert.notEqual(mine.account.clientId, "11008801");
});

test("Copy ON Upstox with API key and secret is a target before the daily trading token exists", () => {
  const user = { id: "u-upx-mint", name: "Upx Mint", email: "upxmint@t2s.app", role: "user" };
  installMemberBroker({
    user,
    brokerId: "upstox",
    clientId: "393216",
    apiKey: "upstox-api-key-mint-1111",
    sessionToken: "upstox-api-secret-mint-2222",
  });
  saveClientSettings(user.id, { copy: true, subscriptionUntil: "" });
  const copies = memberCopyPayloads(
    { strategy: "Desk BUY", side: "BUY", symbol: "NIFTY 22950 PE", qty: 65, lotSize: 65, brokerId: "dhan" },
    { mappingScope: "both", mappedClientIds: [user.id] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine);
  assert.equal(mine.brokerId, "upstox");
  assert.equal(mine.account.accessToken, "");
  assert.equal(mine.account.apiKey, "upstox-api-key-mint-1111");
  assert.equal(mine.account.sessionToken, "upstox-api-secret-mint-2222");
});

test("Copy ON Upstox uses the member Upstox token and client id after a leftover slot", () => {
  const user = { id: "u-upx-own", name: "Upx Own", email: "upxown@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11008899", accessToken: "dhan-keep-token" });
  saveClientSettings(user.id, {
    copy: true,
    brokerId: "upstox",
    accountId: "11008899",
    brokerToken: "dhan-keep-token",
    subscriptionUntil: "",
  });
  installMemberBroker({
    user,
    brokerId: "upstox",
    clientId: "UPX-MEM-9",
    accessToken: "upstox-member-own-token",
  });
  const copies = memberCopyPayloads(
    { strategy: "Desk BUY", side: "BUY", symbol: "NIFTY 22850 PE", qty: 65, lotSize: 65, brokerId: "dhan" },
    { mappingScope: "both", mappedClientIds: [user.id] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine);
  assert.equal(mine.brokerId, "upstox");
  assert.equal(mine.leftoverSlot, false);
  assert.equal(mine.account.clientId, "UPX-MEM-9");
  assert.equal(mine.account.accessToken, "upstox-member-own-token");
  assert.equal(mine.brokerSession.accessToken, "upstox-member-own-token");
  assert.notEqual(mine.account.accessToken, "dhan-keep-token");
  assert.notEqual(mine.account.clientId, "11008899");
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
  assert.ok((desk.alerts || []).some((row) => row.kind === "copy_order" && row.symbol === "NIFTY 24600 CE"));
  assert.match((desk.alerts || []).find((row) => row.symbol === "NIFTY 24600 CE").text, /Copied BUY 65 NIFTY 24600 CE/);
});

test("admin live desk order copies onto the member token and notifies them", async () => {
  const user = { id: "u-admin-live-copy", name: "Admin Live Copy", email: "adminlivecopy@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100888", accessToken: "admin-live-copy-token" });
  saveClientSettings(user.id, {
    copy: true,
    subscriptionMode: "strategy",
    mappedStrategy: "Desk BUY",
    tradeMode: "paper",
    brokerId: "dhan",
  });
  const { fanOutAdminOrderCopies, placeOrder } = await import("./market.js");
  const booked = placeOrder({
    symbol: "NIFTY 25200 CE",
    side: "BUY",
    qty: 65,
    price: 91,
    strategy: "Desk BUY",
    brokerId: "dhan",
    live: { orderId: "adm-copy-1", status: "TRADED", price: 91, filledQty: 65 },
  });
  assert.equal(booked.error, undefined);
  assert.equal(booked.symbol, "NIFTY 25200 CE");
  await awaitMemberCopySends();
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.ok((desk.alerts || []).some((row) => row.symbol === "NIFTY 25200 CE" && row.side === "BUY"));
  const rows = [...(desk.orders || []), ...(desk.orderHistory || [])].filter((row) => row.symbol === "NIFTY 25200 CE");
  assert.ok(rows.length >= 1, "the member book keeps the copy");
  assert.equal(
    rows.some((row) => (row.status === "REJECTED" || row.status === "FAILED") && !String(row.reason || "").trim()),
    false,
  );
  const again = fanOutAdminOrderCopies({ copiedToMembers: true, symbol: "NIFTY 25200 CE" }, booked);
  assert.equal(again.queued, false);
});

test("reading the admin Dhan order book does not punch user orders", async () => {
  const user = { id: "u-no-book-copy", name: "No Book Copy", email: "nobookcopy@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100123", accessToken: "book-sync-token" });
  saveClientSettings(user.id, { copy: true, subscriptionMode: "copy", subscriptionUntil: "" });
  const { replaceDhanOrders } = await import("./market.js");
  replaceDhanOrders([
    {
      id: "dhan-pending-23100",
      symbol: "NIFTY-Oct2026-23100-CE",
      side: "BUY",
      qty: 65,
      price: 221.1,
      status: "PENDING",
      brokerId: "dhan",
      live: true,
    },
    {
      id: "dhan-pending-23550",
      symbol: "NIFTY-Oct2026-23550-CE",
      side: "SELL",
      qty: 130,
      price: 32.55,
      status: "PENDING",
      brokerId: "dhan",
      live: true,
    },
  ]);
  await awaitMemberCopySends();
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  const rows = [...(desk.orders || []), ...(desk.orderHistory || []), ...(desk.alerts || [])];
  assert.equal(rows.some((row) => String(row.symbol || "").includes("23100")), false);
  assert.equal(rows.some((row) => String(row.symbol || "").includes("23550")), false);
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
  assert.equal((desk.orders || []).some((row) => row.symbol === "NIFTY 24800 CE"), false);
  assert.ok((desk.orderHistory || []).some((row) => row.symbol === "NIFTY 24800 CE" && row.status === "FILLED"));
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
  assert.equal(exit.price, 88);
  assert.equal(exit.role, "exit");
});

test("memberExitPayload uses fill avg instead of SELL @ 0.00", () => {
  const exit = memberExitPayload(
    { symbol: "NIFTY-Oct2026-22450-CE", type: "BUY", qty: 65, ltp: 0, avg: 62.45, strategy: algo.name },
    { strategy: algo.name, price: 0 },
  );
  assert.equal(exit.side, "SELL");
  assert.equal(exit.price, 62.45);
});

test("dispatchMemberExitCopies sends one TGT/SL copy per user contract", () => {
  resetMemberExitCopyLocks();
  const user = { id: "u-exit-once", name: "Exit Once", email: "exitonce@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100999", accessToken: "exit-once-token" });
  payMember(user);
  const queued = [];
  const pos = { symbol: "NIFTY-Oct2026-22450-CE", type: "BUY", qty: 65, avg: 62.45, strategy: algo.name, securityId: "22450" };
  dispatchMemberExitCopies(pos, algo, { enqueueLiveOrder: (copy) => queued.push(copy) });
  dispatchMemberExitCopies(pos, algo, { enqueueLiveOrder: (copy) => queued.push(copy) });
  const mine = queued.filter((row) => row.copyUserId === user.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].side, "SELL");
  assert.equal(mine[0].price, 62.45);
  assert.equal(mine[0].role, "exit");
});

test("TGT and SL each send one SELL for the same member contract", () => {
  resetMemberExitCopyLocks();
  const user = { id: "u-tgt-sl", name: "Tgt Sl", email: "tgtsl@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100666", accessToken: "tgt-sl-token" });
  payMember(user);
  const queued = [];
  const pos = { symbol: "NIFTY 22450 CE", type: "BUY", qty: 65, avg: 50, strategy: algo.name, securityId: "22450" };
  dispatchMemberExitCopies({ ...pos, role: "target" }, algo, { enqueueLiveOrder: (copy) => queued.push(copy) });
  dispatchMemberExitCopies({ ...pos, role: "sl" }, algo, { enqueueLiveOrder: (copy) => queued.push(copy) });
  const mine = queued.filter((row) => row.copyUserId === user.id);
  assert.equal(mine.length, 2);
  assert.deepEqual(mine.map((row) => row.role).sort(), ["sl", "target"]);
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
  assert.ok((closed.orderHistory || []).some((row) => row.symbol === "NIFTY 24900 CE" && row.side === "SELL" && row.status === "FILLED"));
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
    assert.ok([...(desk.orders || []), ...(desk.orderHistory || [])].some((row) => row.side === "SELL" && row.symbol === "NIFTY 25100 CE"));
  }
});

test("member live BUY is not sent when the master desk already has a Nifty option", async () => {
  const user = { id: "u-nifty-copy", name: "Nifty Copy", email: "niftycopy@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100777", accessToken: "member-buy-token" });
  payMember(user);
  const { drainPendingLiveAlgoOrders, queueLiveAlgoOrder, replaceDhanBook, snapshot } = await import("./market.js");
  try {
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
    const result = queueLiveAlgoOrder({
      strategy: algo.name,
      side: "BUY",
      symbol: "NIFTY 24700 CE",
      qty: 65,
      lotSize: 65,
      price: 248.27,
      type: "MARKET",
      brokerId: "dhan",
    });
    assert.equal(result.queued, false);
    assert.equal(result.blocked, true);
    assert.equal(result.status, "REJECTED");
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(queued.some((row) => row.copyUserId === user.id), false);
    assert.equal(queued.some((row) => !row.copyUserId && row.strategy === algo.name), false);
    assert.equal(
      snapshot().orders.some(
        (row) =>
          row.strategy === algo.name &&
          row.status === "REJECTED" &&
          /position is open on the broker/i.test(String(row.reason || "")),
      ),
      true,
    );
  } finally {
    replaceDhanBook([]);
    drainPendingLiveAlgoOrders();
  }
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

test("a mapped member with no token still queues on the admin Dhan desk", () => {
  const user = { id: "u-blocked-send", name: "Blocked Send", email: "blockedsend@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "CRUDE OIL 5m first candle",
    tradeMode: "real",
    brokerId: "dhan",
  });
  const copies = memberCopyPayloads(
    {
      strategy: "CRUDE OIL 5m first candle",
      side: "BUY",
      symbol: "CRUDEOIL 6100 CE",
      qty: 100,
      lotSize: 100,
      price: 42.5,
      securityId: "crude-ce-6100",
      exchangeSegment: "MCX_COMM",
      brokerId: "dhan",
    },
    { id: "a12", name: "CRUDE OIL 5m first candle", mappingScope: "both", mappedClientIds: [user.id] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine);
  assert.equal(mine.copyBlocked, "");
  assert.equal(mine.securityId, "crude-ce-6100");
});

test("mapped crude copy keeps the crude contract and the member token", async () => {
  const user = { id: "u-crude-copy", name: "Crude Copy", email: "crudecopy@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11006100", accessToken: "crude-member-token" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "CRUDE OIL 5m first candle",
    tradeMode: "real",
    brokerId: "dhan",
  });
  const { cacheOptionDesk, drainPendingLiveAlgoOrders, queueLiveAlgoOrder, setOptionDesk } = await import("./market.js");
  setOptionDesk({
    symbol: "NIFTY",
    expiry: "2026-10-06",
    rows: [{ strike: 22650, callId: "nifty-ce-22650", putId: "nifty-pe-22650" }],
  });
  cacheOptionDesk({
    symbol: "CRUDEOIL",
    expiry: "2026-10-19",
    rows: [{ strike: 6100, callId: "crude-ce-6100", putId: "crude-pe-6100" }],
    spot: 6120,
  });
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "CRUDE OIL 5m first candle",
    side: "BUY",
    symbol: "CRUDEOIL 6100 CE",
    qty: 100,
    lots: 1,
    lotSize: 100,
    price: 42.5,
    option: "CE",
    strike: 6100,
    expiry: "2026-10-19",
    kind: "option",
    exchangeSegment: "MCX_COMM",
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const copy = queued.find((row) => row.copyUserId === user.id);
  assert.ok(copy);
  assert.equal(copy.securityId, "crude-ce-6100");
  assert.equal(copy.symbol, "CRUDEOIL 6100 CE");
  assert.equal(copy.exchangeSegment, "MCX_COMM");
  assert.equal(copy.account.accessToken, "crude-member-token");
  assert.equal(copy.account.clientId, "11006100");
  assert.equal(copy.copyBlocked, "");
  assert.equal(copy.type, "LIMIT");
  assert.equal(copy.price, 42.5);
});

test("NIFTY first candle copies only users mapped on that card and keeps the NIFTY contract", async () => {
  const user = { id: "u-nifty-same-copy", name: "Nifty Same", email: "niftysame@t2s.app", role: "user" };
  const other = { id: "u-vwap-only", name: "Vwap Only", email: "vwaponly@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "upstox" });
  installMemberBroker({ user, brokerId: "upstox", clientId: "393216", accessToken: "nifty-upstox-token" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "CRUDE OIL 5m first candle",
    tradeMode: "real",
    brokerId: "upstox",
  });
  selectMemberBroker({ user: other, brokerId: "dhan" });
  installMemberBroker({ user: other, brokerId: "dhan", clientId: "1100999", accessToken: "vwap-token" });
  saveClientSettings(other.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "NIFTY VWAP ATM",
    tradeMode: "real",
    brokerId: "dhan",
  });
  const { drainPendingLiveAlgoOrders, queueLiveAlgoOrder } = await import("./market.js");
  drainPendingLiveAlgoOrders();
  const queuedResult = queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    symbol: "NIFTY 22650 CE",
    qty: 65,
    price: 118.2,
    option: "CE",
    strike: 22650,
    expiry: "2026-10-06",
    kind: "option",
    securityId: "51338",
    product: "MIS",
    type: "MARKET",
    lots: 1,
    lotSize: 65,
    exchangeSegment: "NSE_FNO",
    brokerId: "dhan",
  });
  assert.equal(queuedResult.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const admin = queued.find((row) => row.strategy === "NIFTY 5m first candle" && !row.copyUserId);
  assert.ok(admin);
  assert.equal(admin.symbol, "NIFTY 22650 CE");
  assert.equal(admin.qty, 65);
  assert.equal(admin.securityId, "51338");
  assert.equal(admin.brokerId, "dhan");
  assert.equal(
    queued.some((row) => row.copyUserId === user.id && row.strategy === "NIFTY 5m first candle"),
    false,
    "Crude-mapped user must not receive a NIFTY copy",
  );
  assert.equal(queued.some((row) => row.copyUserId === other.id), false);

  const mappedCopies = memberCopyPayloads(
    {
      strategy: "NIFTY 5m first candle",
      side: "BUY",
      symbol: "NIFTY 22650 CE",
      qty: 65,
      price: 118.2,
      option: "CE",
      strike: 22650,
      expiry: "2026-10-06",
      product: "MIS",
      lots: 1,
      lotSize: 65,
      securityId: "51338",
      exchangeSegment: "NSE_FNO",
      brokerId: "dhan",
    },
    { id: "a10", name: "NIFTY 5m first candle", mappingScope: "both", mappedClientIds: [user.id] },
  );
  const copy = mappedCopies.find((row) => row.copyUserId === user.id);
  assert.ok(copy);
  assert.equal(copy.symbol, "NIFTY 22650 CE");
  assert.equal(copy.qty, 65);
  assert.equal(copy.strike, 22650);
  assert.equal(copy.option, "CE");
  assert.equal(copy.expiry, "2026-10-06");
  assert.equal(copy.securityId, "51338");
  assert.equal(copy.product, "MIS");
  assert.equal(copy.exchangeSegment, "NSE_FNO");
  assert.equal(copy.lots, 1);
  assert.equal(copy.lotSize, 65);
  assert.equal(copy.brokerId, "upstox");
  assert.equal(copy.account.accessToken, "nifty-upstox-token");
  assert.equal(copy.account.clientId, "393216");
  assert.equal(mappedCopies.some((row) => row.copyUserId === other.id), false);

  const fromAlso = memberCopyPayloads(
    {
      strategy: "NIFTY 5m first candle",
      side: "BUY",
      symbol: "NIFTY 22900 CE",
      qty: 65,
      option: "CE",
      strike: 22900,
      expiry: "2026-10-06",
      product: "MIS",
      brokerId: "dhan",
    },
    { id: "a10", name: "NIFTY 5m first candle", mappingScope: "both", mappedClientIds: [user.id], alsoMappedClientIds: [other.id] },
  );
  assert.equal(fromAlso.some((row) => row.copyUserId === other.id), false, "alsoMappedClientIds must not add copies");
  assert.ok(fromAlso.some((row) => row.copyUserId === user.id));

  const master = memberCopyPayloads(
    { strategy: "NIFTY 5m first candle", side: "BUY", symbol: "NIFTY 22650 CE", qty: 65, brokerId: "dhan" },
    { id: "a10", name: "NIFTY 5m first candle", mappingScope: "master", mappedClientIds: [user.id], alsoMappedClientIds: [user.id] },
  );
  assert.equal(master.some((row) => row.copyUserId === user.id), false);
});

test("an unmapped Copy ON member does not receive a NIFTY order when the card already has a map", () => {
  const mapped = { id: "u-nifty-mapped", name: "Mapped Nifty", email: "mappednifty@t2s.app", role: "user" };
  const avinash = { id: "u-avinash-ramole", name: "Avinash Ramole", email: "avinash.ramole86@gmail.com", role: "user" };
  selectMemberBroker({ user: mapped, brokerId: "dhan" });
  installMemberBroker({ user: mapped, brokerId: "dhan", clientId: "1100888", accessToken: "mapped-nifty-token" });
  saveClientSettings(mapped.id, { copy: false, tradeMode: "real", brokerId: "dhan", subscriptionUntil: "2026-12-31" });
  selectMemberBroker({ user: avinash, brokerId: "dhan" });
  installMemberBroker({ user: avinash, brokerId: "dhan", clientId: "1100777", accessToken: "avinash-copy-token" });
  saveClientSettings(avinash.id, {
    copy: true,
    subscriptionMode: "copy",
    mappedStrategy: "CRUDE OIL 5m first candle",
    tradeMode: "real",
    brokerId: "dhan",
    subscriptionUntil: "2026-12-31",
  });
  const copies = memberCopyPayloads(
    {
      strategy: "NIFTY",
      side: "BUY",
      symbol: "NIFTY 22750 PE",
      qty: 65,
      lotSize: 65,
      price: 42.5,
      option: "PE",
      strike: 22750,
      brokerId: "dhan",
    },
    { id: "a10", name: "NIFTY", mappingScope: "both", mappedClientIds: [mapped.id], alsoMappedClientIds: [avinash.id] },
  );
  const ids = copies.map((row) => row.copyUserId);
  assert.equal(ids.includes(mapped.id), true);
  assert.equal(ids.includes(avinash.id), false);
});

test("crude first candle does not copy a NIFTY-mapped Kotak user", () => {
  const user = { id: "u-kotak-nifty-map", name: "K", email: "kotaknifty@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "kotak" });
  installMemberBroker({
    user,
    brokerId: "kotak",
    clientId: "YT2VM",
    accessToken: "kotak-member-token-3324",
    apiKey: "kotak-consumer-key",
  });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "NIFTY 5m first candle",
    tradeMode: "real",
    brokerId: "kotak",
    subscriptionUntil: "2026-10-31",
  });
  const copies = memberCopyPayloads(
    {
      strategy: "CRUDE OIL 5m first candle",
      side: "BUY",
      symbol: "CRUDEOIL 6100 CE",
      qty: 100,
      lots: 1,
      lotSize: 100,
      price: 42.5,
      option: "CE",
      strike: 6100,
      expiry: "2026-10-19",
      exchangeSegment: "MCX_COMM",
      brokerId: "dhan",
    },
    { id: "a-crude-share", name: "CRUDE OIL", mappingScope: "both", mappedClientIds: [] },
  );
  assert.equal(
    copies.some((row) => row.copyUserId === user.id),
    false,
    "NIFTY-mapped Kotak user must not receive Crude Oil copies",
  );
});

test("crude Copy ON Upstox does not copy when the Crude card has no map", () => {
  const saved = {
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_CLIENT_ID = "YT2VM";
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-kotak-key";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-kotak-token";
  const upstox = { id: "u-upx-crude", name: "Upstox User", email: "upxcrude@t2s.app", role: "user" };
  const kotak = { id: "u-kotak-crude", name: "K", email: "kotakcrude@t2s.app", role: "user" };
  try {
    selectMemberBroker({ user: upstox, brokerId: "upstox" });
    installMemberBroker({ user: upstox, brokerId: "upstox", clientId: "UPX2200", accessToken: "upstox-crude-token" });
    saveClientSettings(upstox.id, {
      copy: true,
      subscriptionMode: "copy",
      tradeMode: "real",
      brokerId: "upstox",
      subscriptionUntil: "2026-10-31",
    });
    selectMemberBroker({ user: kotak, brokerId: "kotak" });
    installMemberBroker({
      user: kotak,
      brokerId: "kotak",
      clientId: "YT2VM",
      accessToken: "kotak-member-token-3324",
      apiKey: "kotak-member-consumer",
    });
    saveClientSettings(kotak.id, {
      copy: false,
      subscriptionMode: "strategy",
      mappedStrategy: "NIFTY 5m first candle",
      tradeMode: "real",
      brokerId: "kotak",
      subscriptionUntil: "2026-10-31",
    });
    const copies = memberCopyPayloads(
      {
        strategy: "CRUDE OIL 5m first candle",
        side: "BUY",
        symbol: "CRUDEOIL 6100 CE",
        qty: 100,
        lots: 1,
        lotSize: 100,
        exchangeSegment: "MCX_COMM",
        brokerId: "dhan",
      },
      { id: "a-crude-both", name: "CRUDE OIL", mappingScope: "both", mappedClientIds: [] },
    );
    const upx = copies.find((row) => row.copyUserId === upstox.id);
    const ktk = copies.find((row) => row.copyUserId === kotak.id);
    assert.equal(upx, undefined, "Copy ON Upstox user must not receive Crude when the Crude card has no map");
    assert.equal(ktk, undefined, "NIFTY-mapped Kotak user must not receive Crude");
  } finally {
    if (saved.id == null) delete process.env.T2S_KOTAK_CLIENT_ID;
    else process.env.T2S_KOTAK_CLIENT_ID = saved.id;
    if (saved.key == null) delete process.env.T2S_KOTAK_CONSUMER_KEY;
    else process.env.T2S_KOTAK_CONSUMER_KEY = saved.key;
    if (saved.token == null) delete process.env.T2S_KOTAK_ACCESS_TOKEN;
    else process.env.T2S_KOTAK_ACCESS_TOKEN = saved.token;
  }
});

test("crude copies only a mapped user and keeps the admin 15 Oct expiry", () => {
  const mapped = { id: "u-crude-oct", name: "Crude Oct", email: "crudeoct@t2s.app", role: "user" };
  const stray = { id: "u-crude-nov", name: "Copy ON Nov", email: "crudenov@t2s.app", role: "user" };
  selectMemberBroker({ user: mapped, brokerId: "dhan" });
  installMemberBroker({ user: mapped, brokerId: "dhan", clientId: "11006115", accessToken: "crude-oct-token" });
  saveClientSettings(mapped.id, { copy: false, tradeMode: "real", brokerId: "dhan", subscriptionUntil: "2026-12-31" });
  selectMemberBroker({ user: stray, brokerId: "upstox" });
  installMemberBroker({ user: stray, brokerId: "upstox", clientId: "UPXNOV", accessToken: "crude-nov-token" });
  saveClientSettings(stray.id, {
    copy: true,
    subscriptionMode: "copy",
    tradeMode: "real",
    brokerId: "upstox",
    subscriptionUntil: "2026-12-31",
  });
  const copies = memberCopyPayloads(
    {
      strategy: "CRUDE OIL",
      side: "BUY",
      symbol: "CRUDEOIL 6100 CE",
      qty: 100,
      lots: 1,
      lotSize: 100,
      price: 42.5,
      option: "CE",
      strike: 6100,
      expiry: "2026-10-15",
      exchangeSegment: "MCX_COMM",
      securityId: "crude-ce-6100-15oct",
      brokerId: "dhan",
    },
    { id: "a12", name: "CRUDE OIL", mappingScope: "both", mappedClientIds: [mapped.id] },
  );
  assert.equal(copies.some((row) => row.copyUserId === stray.id), false);
  const mine = copies.find((row) => row.copyUserId === mapped.id);
  assert.ok(mine);
  assert.equal(mine.symbol, "CRUDEOIL 6100 CE");
  assert.equal(mine.expiry, "2026-10-15");
  assert.equal(mine.securityId, "crude-ce-6100-15oct");
  assert.equal(mine.strike, 6100);
  assert.equal(mine.option, "CE");
});

test("admin BUY PE copies a mapped client who is not Copy ON", async () => {
  const user = { id: "u-pe-mapped", name: "PE Mapped", email: "pemapped@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11007701", accessToken: "pe-mapped-token" });
  saveClientSettings(user.id, {
    copy: false,
    subscriptionMode: "strategy",
    mappedStrategy: "",
    tradeMode: "real",
    brokerId: "dhan",
    subscriptionUntil: "2026-12-31",
  });
  const { createAlgo, deleteAlgo, fanOutAdminOrderCopies } = await import("./market.js");
  const created = createAlgo({
    name: "NIFTY 5m first candle PE map",
    kind: "nifty-first-candle",
    indicator: "NIFTY_FIRST_CANDLE",
    runMode: "live",
    symbol: "NIFTY",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  try {
    const result = fanOutAdminOrderCopies(
      {
        symbol: "NIFTY 22600 PE",
        side: "BUY",
        qty: 65,
        price: 42,
        option: "PE",
        strike: 22600,
        strategy: created.name,
        brokerId: "dhan",
      },
      { symbol: "NIFTY 22600 PE", side: "BUY", qty: 65, price: 42, strategy: created.name },
    );
    assert.ok(result.copies >= 1);
    await awaitMemberCopySends();
    const desk = getMemberDesk({ user, enrollments: [], algos: [created], quote: () => 0, ownBookOnly: true });
    const row = [...(desk.orders || []), ...(desk.orderHistory || [])].find((item) => item.symbol === "NIFTY 22600 PE");
    assert.ok(row);
    assert.equal(row.side, "BUY");
    assert.equal(row.strategy, created.name);
    assert.equal(row.qty, 65);
  } finally {
    deleteAlgo(created.id);
  }
});

test("Shivam Fintech's copy does not send the admin Kotak login", () => {
  const member = { id: "u-shivam-user", name: "Shivam Fintech", email: "kavitadaundkar14@gmail.com", role: "user" };
  selectMemberBroker({ user: member, brokerId: "kotak" });
  installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "YIX14",
    apiKey: "admin-key-9f44",
    accessToken: "admin-key-9f44",
  });
  const saved = {
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_CLIENT_ID = "YIX14";
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-key-9f44";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-key-9f44";
  try {
    const copies = memberCopyPayloads(
      { strategy: "NIFTY 5m first candle", symbol: "NIFTY 22900 CE", side: "BUY", qty: 65, price: 15.4, brokerId: "dhan" },
      { id: "a-shivam", name: "NIFTY 5m first candle", mappingScope: "both", mappedClientIds: [member.id] },
    );
    const mine = copies.find((row) => row.copyUserId === member.id);
    assert.ok(mine);
    assert.match(mine.copyBlocked, /This user is not the admin/);
    assert.equal(mine.account, undefined);
    assert.equal(mine.brokerSession, undefined);
    assert.equal(JSON.stringify(mine).includes("admin-key-9f44"), false);
    assert.equal(JSON.stringify(mine).includes("YIX14"), false);
    assert.throws(
      () =>
        installMemberBroker({
          user: member,
          brokerId: "kotak",
          clientId: "YIX14",
          apiKey: "admin-key-9f44",
          accessToken: "admin-key-9f44",
        }),
      /admin Kotak Neo/,
    );
  } finally {
    if (saved.id == null) delete process.env.T2S_KOTAK_CLIENT_ID;
    else process.env.T2S_KOTAK_CLIENT_ID = saved.id;
    if (saved.key == null) delete process.env.T2S_KOTAK_CONSUMER_KEY;
    else process.env.T2S_KOTAK_CONSUMER_KEY = saved.key;
    if (saved.token == null) delete process.env.T2S_KOTAK_ACCESS_TOKEN;
    else process.env.T2S_KOTAK_ACCESS_TOKEN = saved.token;
  }
});

test("Kotak copy uses the Users-list mobile when trade-login mobile is empty", () => {
  const created = adminCreateMember({ name: "Mobile User", mobile: "9922980000", email: "mobile9922@gmail.com" });
  selectMemberBroker({ user: created, brokerId: "kotak" });
  installMemberBroker({
    user: created,
    brokerId: "kotak",
    clientId: "YT2Vm",
    apiKey: "member-consumer-9922",
    accessToken: "member-access-9922",
    mpin: "654321",
    totpSecret: "GEZDGNBVGY3TQOJQ",
  });
  saveClientSettings(created.id, { copy: true, tradeMode: "real", brokerId: "kotak", subscriptionUntil: "2026-12-31" });
  const copies = memberCopyPayloads(
    { strategy: "NIFTY 5m first candle", symbol: "NIFTY 22500 PE", side: "BUY", qty: 65, price: 115.2, brokerId: "dhan" },
    { id: "a-mobile", name: "NIFTY 5m first candle", mappingScope: "both", mappedClientIds: [created.id] },
  );
  const row = copies.find((item) => item.copyUserId === created.id);
  assert.ok(row);
  assert.equal(String(row.brokerSession.mobile).includes("9922980000"), true);
  assert.equal(row.brokerSession.profileMobile, "9922980000");
  assert.equal(String(row.account.mobile).includes("9922980000"), true);
  assert.equal(peekClientSecrets(created.id).brokerMobile, "+919922980000");
});

test("a short NIFTY label still finds the mapped first-candle card for user copies", () => {
  const user = { id: "u-alias-nifty", name: "Alias Nifty", email: "aliasnifty@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100444", accessToken: "alias-nifty-token" });
  saveClientSettings(user.id, { copy: false, tradeMode: "real", brokerId: "dhan", subscriptionUntil: "2026-12-31" });
  const algoRow = { id: "a-first", name: "NIFTY 5m first candle", mappingScope: "clients", mappedClientIds: [user.id] };
  const found = findLiveCopyAlgo([algoRow], "NIFTY");
  assert.equal(found.name, "NIFTY 5m first candle");
  const copies = memberCopyPayloads(
    { strategy: "NIFTY", side: "BUY", symbol: "NIFTY 22700 CE", qty: 65, lotSize: 65, brokerId: "dhan" },
    found,
  );
  assert.ok(copies.some((row) => row.copyUserId === user.id && row.side === "BUY"));
});

test("a blocked enqueue does not lock the next member exit", () => {
  resetMemberExitCopyLocks();
  const user = { id: "u-exit-blocked-q", name: "Exit Blocked Q", email: "exitblockedq@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100777", accessToken: "exit-blocked-q-token" });
  payMember(user);
  const mapped = { ...algo, mappingScope: "clients", mappedClientIds: [user.id] };
  const pos = { symbol: "NIFTY 22350 CE", type: "BUY", qty: 65, avg: 40, strategy: algo.name, securityId: "22350" };
  dispatchMemberExitCopies(pos, mapped, { enqueueLiveOrder: () => ({ queued: false, blocked: true }) });
  const second = [];
  dispatchMemberExitCopies(pos, mapped, { enqueueLiveOrder: (copy) => second.push(copy) });
  assert.equal(second.filter((row) => row.copyUserId === user.id).length, 1);
});

test("a new BUY copy unlocks the next TGT for that member contract", () => {
  resetMemberExitCopyLocks();
  const user = { id: "u-exit-reenter", name: "Exit Reenter", email: "exitreenter@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100555", accessToken: "exit-reenter-token" });
  payMember(user);
  const mapped = { ...algo, mappingScope: "clients", mappedClientIds: [user.id] };
  const pos = { symbol: "NIFTY 22600 CE", type: "BUY", qty: 65, avg: 55, strategy: algo.name, securityId: "22600" };
  const first = [];
  dispatchMemberExitCopies({ ...pos, role: "target" }, mapped, { enqueueLiveOrder: (copy) => first.push(copy) });
  assert.equal(first.filter((row) => row.copyUserId === user.id).length, 1);
  dispatchMemberCopies(
    { strategy: algo.name, side: "BUY", symbol: pos.symbol, qty: 65, price: 55, brokerId: "dhan" },
    mapped,
    { enqueueLiveOrder: () => {} },
  );
  const second = [];
  dispatchMemberExitCopies({ ...pos, role: "target" }, mapped, { enqueueLiveOrder: (copy) => second.push(copy) });
  assert.equal(second.filter((row) => row.copyUserId === user.id).length, 1);
});

test("a blocked member exit does not lock the next copy after they install a token", () => {
  resetMemberExitCopyLocks();
  const user = { id: "u-exit-retry", name: "Exit Retry", email: "exitretry@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "fyers" });
  saveClientSettings(user.id, { copy: false, tradeMode: "real", brokerId: "fyers", subscriptionUntil: "2026-12-31" });
  const mapped = { ...algo, mappingScope: "clients", mappedClientIds: [user.id] };
  const pos = { symbol: "NIFTY 22400 CE", type: "BUY", qty: 65, avg: 50, strategy: algo.name, securityId: "22400" };
  const first = [];
  dispatchMemberExitCopies(pos, mapped, { enqueueLiveOrder: (copy) => first.push(copy) });
  assert.equal(first.filter((row) => row.copyUserId === user.id).length, 0);
  installMemberBroker({
    user,
    brokerId: "fyers",
    clientId: "FYRETRY",
    accessToken: "exit-retry-token",
    apiKey: "exit-retry-key",
  });
  const second = [];
  dispatchMemberExitCopies(pos, mapped, { enqueueLiveOrder: (copy) => second.push(copy) });
  assert.equal(second.filter((row) => row.copyUserId === user.id).length, 1);
});

test("NIFTY first candle skips copy BUY when an admin lot is already open", async () => {
  const user = { id: "u-nifty-hold-open", name: "Hold Open", email: "holdopen@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "upstox" });
  installMemberBroker({ user, brokerId: "upstox", clientId: "UPXHOLD", accessToken: "hold-upstox-token" });
  const {
    createAlgo,
    deleteAlgo,
    drainPendingLiveAlgoOrders,
    queueLiveAlgoOrder,
    replaceDhanBook,
    snapshot,
    toggleAlgo,
    withLiveAlgo,
  } = await import("./market.js");
  const created = createAlgo({
    name: "NIFTY HOLD OPEN COPY",
    kind: "nifty-first-candle",
    runMode: "live",
    mappingScope: "both",
    mappedClientIds: [user.id],
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    withLiveAlgo(created.id, (algo) => {
      algo.mappedClientIds = [user.id];
      algo.mappingScope = "both";
      return algo;
    });
    payMember(user, { id: created.id, name: created.name, mappingScope: "both", mappedClientIds: [user.id] });
    replaceDhanBook([
      {
        id: "dhan-pos-nifty-pe-hold",
        symbol: "NIFTY 22950 PE",
        type: "BUY",
        qty: 65,
        avg: 126.65,
        ltp: 109.5,
        strategy: created.name,
        brokerId: "dhan",
        option: "PE",
        strike: 22950,
        live: true,
      },
    ]);
    drainPendingLiveAlgoOrders();
    const result = queueLiveAlgoOrder({
      strategy: created.name,
      side: "BUY",
      symbol: "NIFTY 23000 CE",
      qty: 65,
      option: "CE",
      strike: 23000,
      kind: "option",
      brokerId: "dhan",
    });
    assert.equal(result.queued, false);
    const queued = drainPendingLiveAlgoOrders();
    assert.equal(
      queued.some((row) => !row.copyUserId && String(row.option || "").toUpperCase() === "CE"),
      false,
    );
    assert.equal(queued.some((row) => row.copyUserId === user.id), false);
    assert.equal(snapshot().orders.some((row) => row.copyUserId === user.id), false);
    assert.equal(snapshot().positions.some((row) => row.copyUserId), false);
  } finally {
    replaceDhanBook([]);
    drainPendingLiveAlgoOrders();
    deleteAlgo(created.id);
  }
});
