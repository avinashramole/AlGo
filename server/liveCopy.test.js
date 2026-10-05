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
const { awaitMemberCopySends, dispatchMemberCopies, dispatchMemberExitCopies, listCopyOnTargets, listLiveCopyTargets, memberCopyPayloads, memberExitPayload } = await import("./liveCopy.js");
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
  saveClientSettings(user.id, { copy: false, subscriptionMode: "strategy", subscriptionUntil: "" });
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

test("real members without a token stay on the copy list as blocked", () => {
  const user = { id: "u-notoken", name: "No Token", email: "notoken@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  payMember(user);
  const targets = listLiveCopyTargets({ strategyName: algo.name, strategyId: algo.id, masterQty: 65 });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine);
  assert.equal(mine.brokerToken, "");
  assert.match(mine.copyBlocked, /Access Token/);
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

test("admin saving a member token without a through date still enables copy master", () => {
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
    mappedClientIds: [],
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

test("Copy ON + installed token copies admin orders with no login session and no through date", () => {
  const user = { id: "u-copy-logged-off", name: "Logged Off", email: "loggedoff@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100555", accessToken: "logged-off-token" });
  saveClientSettings(user.id, { copy: true, subscriptionMode: "copy", subscriptionUntil: "" });
  const targets = listLiveCopyTargets({
    strategyName: "",
    masterQty: 65,
    lotSize: 65,
    mappingScope: "both",
    mappedClientIds: [],
  });
  const mine = targets.find((row) => row.userId === user.id);
  assert.ok(mine, "Copy ON must copy while the member is logged off");
  assert.equal(mine.paper, false);
  assert.equal(mine.brokerToken, "logged-off-token");
  assert.equal(mine.accountId, "1100555");
});

test("manual admin order copies a Copy ON member with no login and no through date", async () => {
  const user = { id: "u-copy-ignore-scope", name: "Ignore Scope", email: "ignorescope@t2s.app", role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100666", accessToken: "ignore-scope-token" });
  saveClientSettings(user.id, { copy: true, subscriptionMode: "copy", subscriptionUntil: "" });
  const { fanOutAdminOrderCopies } = await import("./market.js");
  const result = fanOutAdminOrderCopies(
    { symbol: "NIFTY 25300 CE", side: "BUY", qty: 65, price: 80, strategy: "Desk BUY", brokerId: "dhan" },
    { symbol: "NIFTY 25300 CE", side: "BUY", qty: 65, strategy: "Desk BUY" },
  );
  assert.ok(result.copies >= 1);
  await awaitMemberCopySends();
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0 });
  assert.ok(
    (desk.alerts || []).some((row) => row.symbol === "NIFTY 25300 CE"),
    "admin ticket must copy from the saved member token while they are logged off",
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

test("turning Copy on without a through date opens Copy Master for admin orders", () => {
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
  assert.equal(targets.some((row) => row.userId === user.id), true);
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
    { mappingScope: "both", mappedClientIds: [] },
  );
  const mine = copies.find((row) => row.copyUserId === user.id);
  assert.ok(mine, "Copy ON leftover Upstox still notifies instead of silently skipping");
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
    { mappingScope: "both", mappedClientIds: [] },
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
    { mappingScope: "both", mappedClientIds: [] },
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
    price: 248.27,
    type: "MARKET",
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const copy = queued.find((row) => row.copyUserId === user.id);
  assert.ok(copy);
  assert.equal(copy.account.accessToken, "member-buy-token");
  assert.equal(copy.type, "LIMIT");
  assert.equal(copy.price, 248.25);
  for (const row of queued) {
    assert.equal(row.type, "LIMIT");
    assert.equal(row.price, 248.25);
  }
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

test("a mapped member with no token is rejected on their book and is not sent", async () => {
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
  assert.match(mine.copyBlocked, /Access Token/);
  assert.equal(mine.securityId, "crude-ce-6100");
  assert.equal(mine.account, undefined);
  let called = false;
  await assert.rejects(
    () =>
      sendMemberCopyOrder(mine, async () => {
        called = true;
        return {};
      }),
    /Access Token/,
  );
  assert.equal(called, false);
  const desk = getMemberDesk({ user, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  const row = [...(desk.orders || []), ...(desk.orderHistory || [])].find((item) => item.symbol === "CRUDEOIL 6100 CE");
  assert.ok(row);
  assert.equal(row.status, "REJECTED");
  assert.match(row.reason, /Access Token/);
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

test("nifty first candle uses the same mapped user as crude and keeps the NIFTY contract", async () => {
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
  const copy = queued.find((row) => row.copyUserId === user.id && row.strategy === "NIFTY 5m first candle");
  assert.ok(admin);
  assert.equal(admin.symbol, "NIFTY 22650 CE");
  assert.equal(admin.qty, 65);
  assert.equal(admin.securityId, "51338");
  assert.equal(admin.brokerId, "dhan");
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
  assert.equal(copy.type, "LIMIT");
  assert.equal(copy.price, 118.2);
  assert.equal(copy.brokerId, "upstox");
  assert.equal(copy.account.accessToken, "nifty-upstox-token");
  assert.equal(copy.account.clientId, "393216");
  assert.equal(queued.some((row) => row.copyUserId === other.id), false);

  const cardMapped = memberCopyPayloads(
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
    { id: "a10", name: "NIFTY 5m first candle", mappingScope: "both", mappedClientIds: [], alsoMappedClientIds: [other.id] },
  );
  const fromCard = cardMapped.find((row) => row.copyUserId === other.id);
  assert.ok(fromCard);
  assert.equal(fromCard.symbol, "NIFTY 22900 CE");
  assert.equal(fromCard.qty, 65);
  assert.equal(fromCard.product, "MIS");

  const master = memberCopyPayloads(
    { strategy: "NIFTY 5m first candle", side: "BUY", symbol: "NIFTY 22650 CE", qty: 65, brokerId: "dhan" },
    { id: "a10", name: "NIFTY 5m first candle", mappingScope: "master", mappedClientIds: [user.id], alsoMappedClientIds: [user.id] },
  );
  assert.equal(master.some((row) => row.copyUserId === user.id), false);
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
