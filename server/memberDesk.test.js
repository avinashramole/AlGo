import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-member-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const { enrollStrategy, markEnrollmentPaid, savePaymentSettings } = await import("./subscriptions.js");
const {
  ensurePlanLedger,
  getMemberDesk,
  installMemberBroker,
  listTopups,
  liveAutoTradeBrokers,
  markTopupPaid,
  brokerAccountForLiveCopy,
  peekAdminBrokerSecrets,
  peekBrokerAccount,
  peekClientSecrets,
  persistAdminBrokerSecrets,
  purgeMemberDesksExcept,
  applyMemberDhanOrderStatuses,
  memberWorkingDhanCopies,
  recordMemberCopyFill,
  saveClientSettings,
  saveMemberStaticIp,
  selectMemberBroker,
  startWalletTopup,
  sweepMemberDailyBooks,
} = await import("./memberDesk.js");
const { lastDailyResetAt, TOKEN_RENEW_HOUR_IST } = await import("./dhanToken.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const user = { id: "u-member", name: "Desk Member", email: "member.desk@gmail.com", role: "user" };
const algo = { id: "a4", name: "NIFTY VWAP ATM" };

test("a member can save a static IP on their own desk", () => {
  const saved = saveMemberStaticIp({ user, staticIp: "203.0.113.44" });
  assert.equal(saved.staticIp, "203.0.113.44");
  assert.equal(getMemberDesk({ user, enrollments: [], quote: () => 0 }).staticIp, "203.0.113.44");
  assert.throws(() => saveMemberStaticIp({ user, staticIp: "999.1.1.1" }), /IPv4 or IPv6/);
  const cleared = saveMemberStaticIp({ user, staticIp: "" });
  assert.equal(cleared.staticIp, "");
});

test("selectMemberBroker stores the chosen broker without secrets", () => {
  const row = selectMemberBroker({ user, brokerId: "dhan" });
  assert.equal(row.brokerId, "dhan");
  assert.equal(row.tradeMode, "real");
  assert.equal(row.autoTrade, true);
  assert.equal(row.brokers.find((item) => item.id === "dhan")?.selected, true);
  assert.equal(row.brokers.find((item) => item.id === "dhan")?.autoTrade, true);
  assert.equal(row.brokers.every((item) => item.clientId == null), true);
  const paper = selectMemberBroker({ user, brokerId: "paper" });
  assert.equal(paper.tradeMode, "paper");
  assert.equal(paper.autoTrade, false);
  selectMemberBroker({ user, brokerId: "dhan" });
});

test("paid plan report includes monthly start and end dates", () => {
  const enrolled = enrollStrategy({
    user,
    algo,
    channel: "gpay",
    term: "monthly",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  const paid = markEnrollmentPaid({ user, enrollmentId: enrolled.enrollment.id });
  const desk = getMemberDesk({
    user,
    enrollments: [paid],
    algos: [algo],
    quote: () => 0,
  });
  assert.equal(desk.plans[0].term, "monthly");
  assert.equal(desk.plans[0].startedAt, paid.startedAt);
  assert.equal(desk.plans[0].endsAt, paid.endsAt);
});

test("paid plan report uses the live desk book, not a seeded paper P&L", () => {
  ensurePlanLedger({ user, algo });
  const empty = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    quote: () => 0,
  });
  assert.equal(empty.plans[0].strategyName, "NIFTY VWAP ATM");
  assert.equal(empty.report.unrealizedPnl, 0);
  assert.equal(empty.positions.length, 0);

  const desk = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook: {
      positions: [
        {
          id: "p-live",
          symbol: "NIFTY 24600 CE",
          type: "BUY",
          qty: 65,
          avg: 80,
          ltp: 92,
          pnl: 780,
          strategy: "NIFTY VWAP ATM",
        },
      ],
      orders: [],
      closedTrades: [],
    },
  });
  assert.equal(desk.plans[0].unrealizedPnl, 780);
  assert.ok(desk.positions.some((row) => row.symbol.includes("NIFTY")));
  assert.equal(desk.brokerId, "dhan");
});

test("wallet topup asks for GPay/PhonePe and credits balance after paid", () => {
  const started = startWalletTopup({ user, amount: 2500, channel: "phonepe" });
  assert.equal(started.topup.status, "pending");
  assert.equal(started.topup.amount, 2500);
  assert.match(started.links.phonepe, /^phonepe:\/\/pay\?/);
  assert.match(started.links.gpay, /^tez:\/\/upi\/pay\?/);
  const paid = markTopupPaid({ user, topupId: started.topup.id });
  assert.equal(paid.topup.status, "paid");
  assert.equal(paid.wallet.balance, 2500);
  const desk = getMemberDesk({ user, enrollments: [], quote: () => 0 });
  assert.equal(desk.wallet.balance, 2500);
  assert.equal(listTopups({ userId: user.id })[0].status, "paid");
});

test("startWalletTopup rejects tiny amounts", () => {
  assert.throws(() => startWalletTopup({ user, amount: 10, channel: "gpay" }), /at least/);
});

const liveBook = {
  positions: [
    {
      id: "p-live",
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 92,
      pnl: 780,
      strategy: "NIFTY VWAP ATM",
      brokerId: "dhan",
    },
    {
      id: "p-paper",
      symbol: "NIFTY 24600 CE",
      type: "BUY",
      qty: 65,
      avg: 80,
      ltp: 90,
      pnl: 650,
      strategy: "NIFTY VWAP ATM",
      brokerId: "paper",
      paper: true,
    },
    {
      id: "p-kite",
      symbol: "NIFTY 24600 PE",
      type: "BUY",
      qty: 65,
      avg: 70,
      ltp: 75,
      pnl: 325,
      strategy: "NIFTY VWAP ATM",
      brokerId: "zerodha",
    },
  ],
  orders: [],
  closedTrades: [],
};

test("plan book follows the selected broker and paper stays virtual", () => {
  selectMemberBroker({ user, brokerId: "paper" });
  const paper = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook,
  });
  assert.equal(paper.autoTrade, false);
  assert.deepEqual(paper.positions.map((row) => row.id), ["p-paper"]);

  selectMemberBroker({ user, brokerId: "dhan" });
  const dhan = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook,
  });
  assert.equal(dhan.autoTrade, true);
  assert.deepEqual(dhan.positions.map((row) => row.id), ["p-live"]);

  selectMemberBroker({ user, brokerId: "zerodha" });
  const kite = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook,
  });
  assert.deepEqual(kite.positions.map((row) => row.id), ["p-kite"]);
});

test("liveAutoTradeBrokers is the algo desk broker only", () => {
  selectMemberBroker({ user, brokerId: "zerodha" });
  assert.deepEqual(liveAutoTradeBrokers({ strategyName: "NIFTY VWAP ATM", algoBrokerId: "dhan" }), ["dhan"]);
  assert.deepEqual(liveAutoTradeBrokers({ algoBrokerId: "paper" }), []);
});

test("queueLiveAlgoOrder places the desk broker order without member tokens", async () => {
  const enrolled = enrollStrategy({
    user,
    algo,
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  markEnrollmentPaid({ user, enrollmentId: enrolled.enrollment.id });
  selectMemberBroker({ user, brokerId: "zerodha" });
  const { drainPendingLiveAlgoOrders, queueLiveAlgoOrder } = await import("./market.js");
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY VWAP ATM",
    side: "SELL",
    symbol: "BANKNIFTY 52000 PE",
    qty: 30,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const admin = queued.filter((row) => !row.copyUserId);
  assert.deepEqual(admin.map((row) => row.brokerId), ["dhan"]);
  const copy = queued.find((row) => row.copyUserId === user.id);
  assert.ok(copy);
  assert.equal(copy.brokerId, "zerodha");
  assert.match(copy.copyBlocked, /access token/);
  assert.equal(copy.account, undefined);
});

test("installMemberBroker stores API key and access token hints without secrets", () => {
  selectMemberBroker({ user, brokerId: "zerodha" });
  assert.throws(() => installMemberBroker({ user, brokerId: "paper", accessToken: "paper-token-value" }), /virtual/);
  const row = installMemberBroker({
    user,
    brokerId: "zerodha",
    clientId: "AB1234",
    apiKey: "kite-api-key-value",
    accessToken: "kite-access-token-value",
  });
  assert.equal(row.ok, true);
  assert.equal(row.install.installed, true);
  assert.equal(row.install.accountId, "AB1234");
  assert.match(row.install.tokenHint, /•/);
  assert.equal(String(row.install.tokenHint).includes("kite-access-token-value"), false);
  assert.equal(JSON.stringify(row).includes("kite-access-token-value"), false);
  const desk = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    quote: () => 0,
  });
  assert.equal(desk.install.installed, true);
  assert.equal(desk.copyReady, true);
  assert.equal(desk.install.accountId, "AB1234");
  assert.ok(desk.install.fields.some((field) => field.id === "accessToken"));
  assert.ok(desk.install.fields.some((field) => field.id === "apiKey"));
  assert.throws(
    () => installMemberBroker({ user: { id: "u-empty", name: "Empty", role: "user" }, brokerId: "dhan", accessToken: "dhan-token-value" }),
    /client ID/,
  );
});

test("installMemberBroker on an already selected broker replaces the token and enables live copy", () => {
  const member = { id: "u-token-replace", name: "Token Replace", email: "replace@t2s.app", role: "user" };
  saveClientSettings(member.id, { brokerId: "dhan", tradeMode: "paper", copy: false, subscriptionUntil: "" });
  const first = installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "1100333",
    accessToken: "dhan-first-token-1111",
  });
  assert.equal(first.install.installed, true);
  assert.ok(first.install.tokenUpdatedAt);
  const desk = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
  assert.equal(desk.tradeMode, "real");
  assert.equal(desk.autoTrade, true);
  assert.equal(desk.copyReady, true);
  assert.equal(desk.install.accountId, "1100333");
  const second = installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "1100333",
    accessToken: "dhan-replaced-token-9999",
  });
  assert.notEqual(second.install.tokenHint, first.install.tokenHint);
  assert.ok(second.install.tokenUpdatedAt);
  assert.equal(peekClientSecrets(member.id).brokerToken, "dhan-replaced-token-9999");
});

test("queueLiveAlgoOrder queues a sized copy on the member token", async () => {
  saveClientSettings(user.id, { sizingKind: "multiplier", sizingValue: 2, copy: true });
  const { drainPendingLiveAlgoOrders, queueLiveAlgoOrder } = await import("./market.js");
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY VWAP ATM",
    side: "SELL",
    symbol: "BANKNIFTY 52000 PE",
    qty: 30,
    lotSize: 30,
    brokerId: "dhan",
  });
  const queued = drainPendingLiveAlgoOrders();
  const desk = queued.find((row) => !row.copyUserId);
  const copy = queued.find((row) => row.copyUserId === user.id);
  assert.equal(desk.brokerId, "dhan");
  assert.equal(copy.brokerId, "zerodha");
  assert.equal(copy.qty, 60);
  assert.equal(copy.account.accessToken, "kite-access-token-value");
  assert.equal(copy.brokerSession.accessToken, "kite-access-token-value");
});

test("a member can keep Dhan and Upstox tokens and update Dhan without losing Upstox", () => {
  const member = { id: "u-multi-broker", name: "Multi Broker", email: "multi@t2s.app", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "upstox",
    clientId: "UPX1001",
    accessToken: "upstox-member-token-keep",
  });
  const selected = selectMemberBroker({ user: member, brokerId: "dhan" });
  assert.equal(selected.brokerId, "dhan");
  assert.equal(selected.install.accountId, "");
  assert.equal(selected.install.installed, false);
  const dhan = installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "11008801",
    accessToken: "dhan-member-token-first",
  });
  assert.equal(dhan.install.accountId, "11008801");
  assert.equal(peekClientSecrets(member.id).brokerToken, "dhan-member-token-first");
  assert.equal(peekClientSecrets(member.id).accountId, "11008801");
  const updated = installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "11008802",
    accessToken: "dhan-member-token-updated",
  });
  assert.equal(updated.install.accountId, "11008802");
  assert.equal(peekClientSecrets(member.id).brokerToken, "dhan-member-token-updated");
  assert.equal(peekBrokerAccount(member.id, "upstox").accountId, "UPX1001");
  assert.equal(peekBrokerAccount(member.id, "upstox").brokerToken, "upstox-member-token-keep");
  assert.equal(peekBrokerAccount(member.id, "dhan").brokerToken, "dhan-member-token-updated");
  selectMemberBroker({ user: member, brokerId: "upstox" });
  assert.equal(peekClientSecrets(member.id).brokerToken, "upstox-member-token-keep");
  assert.equal(peekClientSecrets(member.id).accountId, "UPX1001");
  selectMemberBroker({ user: member, brokerId: "dhan" });
  assert.equal(peekClientSecrets(member.id).brokerToken, "dhan-member-token-updated");
  assert.equal(peekClientSecrets(member.id).accountId, "11008802");
});

test("Dhan does not keep showing another broker's client ID after a leftover copy", () => {
  const member = { id: "u-dhan-id-display", name: "Dhan Id", email: "dhanid@t2s.app", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "upstox",
    clientId: "UPX1001",
    accessToken: "upstox-member-token-keep",
  });
  saveClientSettings(member.id, { brokerId: "dhan", accountId: "UPX1001", brokerToken: "upstox-member-token-keep" });
  assert.equal(peekClientSecrets(member.id).accountId, "");
  const installed = installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "11009901",
    accessToken: "dhan-entered-token-value",
  });
  assert.equal(installed.install.accountId, "11009901");
  assert.equal(peekClientSecrets(member.id).accountId, "11009901");
  assert.equal(getMemberDesk({ user: member, enrollments: [], quote: () => 0 }).install.accountId, "11009901");
  assert.equal(peekBrokerAccount(member.id, "upstox").accountId, "UPX1001");
});

test("live copy account rejects a leftover token copied onto another broker", () => {
  const member = { id: "u-live-copy-slot", name: "Live Copy Slot", email: "livecopyslot@t2s.app", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "11008801",
    accessToken: "dhan-leftover-token",
  });
  saveClientSettings(member.id, {
    brokerId: "upstox",
    accountId: "11008801",
    brokerToken: "dhan-leftover-token",
  });
  const leftover = brokerAccountForLiveCopy(member.id, "upstox");
  assert.equal(leftover.leftoverToken, true);
  assert.equal(leftover.brokerToken, "");
  assert.equal(leftover.accountId, "");
  const own = installMemberBroker({
    user: member,
    brokerId: "upstox",
    clientId: "UPX-MEM-1",
    accessToken: "upstox-member-own-token",
  });
  assert.equal(own.install.accountId, "UPX-MEM-1");
  const live = brokerAccountForLiveCopy(member.id, "upstox");
  assert.equal(live.leftoverToken, false);
  assert.equal(live.accountId, "UPX-MEM-1");
  assert.equal(live.brokerToken, "upstox-member-own-token");
  assert.equal(brokerAccountForLiveCopy(member.id, "dhan").brokerToken, "dhan-leftover-token");
});

test("Upstox API key and secret stay on the public install before a trading token exists", () => {
  const member = { id: "u-upx-oauth", name: "Upstox OAuth", email: "upxoauth@t2s.app", role: "user" };
  const saved = installMemberBroker({
    user: member,
    brokerId: "upstox",
    clientId: "393216",
    apiKey: "upstox-api-key-55555555",
    sessionToken: "upstox-api-secret-66666666",
  });
  assert.equal(saved.install.installed, false);
  assert.equal(saved.install.hasApiKey, true);
  assert.equal(saved.install.hasApiSecret, true);
  assert.equal(saved.install.oauthReady, true);
  assert.match(saved.install.apiKeyHint, /•/);
  assert.match(saved.install.sessionHint, /•/);
  assert.equal(String(saved.install.apiKeyHint).includes("upstox-api-key-55555555"), false);
  const desk = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
  assert.equal(desk.install.oauthReady, true);
  const card = desk.brokers.find((row) => row.id === "upstox");
  assert.equal(card.oauthReady, true);
  assert.equal(card.installed, false);
  assert.match(card.note, /Generate today's trading token/);
});

test("member own book ignores the regular admin desk book", () => {
  const member = { id: "u-own-book", name: "Own Book", email: "ownbook@t2s.app", role: "user" };
  selectMemberBroker({ user: member, brokerId: "dhan" });
  const adminBook = {
    positions: [
      {
        id: "admin-pos",
        symbol: "NIFTY 26000 CE",
        type: "BUY",
        qty: 65,
        avg: 80,
        ltp: 90,
        pnl: 650,
        strategy: "NIFTY VWAP ATM",
        brokerId: "dhan",
      },
    ],
    orders: [
      {
        id: "admin-ord",
        symbol: "NIFTY 26000 CE",
        side: "BUY",
        qty: 65,
        price: 80,
        status: "FILLED",
        strategy: "NIFTY VWAP ATM",
        brokerId: "dhan",
      },
    ],
    closedTrades: [],
  };
  const mirrored = getMemberDesk({
    user: member,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook: adminBook,
  });
  assert.ok(mirrored.positions.some((row) => row.id === "admin-pos"));
  const own = getMemberDesk({
    user: member,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    liveBook: adminBook,
    ownBookOnly: true,
  });
  assert.equal(own.positions.some((row) => row.id === "admin-pos"), false);
  assert.equal(own.orders.length, 0);
  assert.equal(own.orderHistory.length, 0);
});

test("broker order book replaces a pending copy with REJECTED and keeps the limit price", async () => {
  const member = { id: "u-broker-status", name: "Broker Status", email: "brokerstatus@t2s.app", role: "user" };
  selectMemberBroker({ user: member, brokerId: "dhan" });
  installMemberBroker({ user: member, brokerId: "dhan", clientId: "110022650", accessToken: "status-token" });
  const pending = recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 22650 CE", side: "BUY", qty: 65, price: 225.7, strategy: "NIFTY 5m first candle", brokerId: "dhan" },
    live: { orderId: "ord-22570", status: "TRANSIT", price: 225.7 },
  });
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.price, 225.7);
  const open = getMemberDesk({ user: member, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  assert.ok(open.orders.some((row) => row.id === "ord-22570" && row.status === "PENDING"));
  assert.ok(open.positions.some((row) => row.symbol === "NIFTY 22650 CE"));
  assert.ok(memberWorkingDhanCopies().some((row) => row.userId === member.id && row.clientId === "110022650"));
  const still = applyMemberDhanOrderStatuses(member.id, [{ orderId: "ord-22570", orderStatus: "PENDING", price: 0 }]);
  assert.deepEqual(still, []);
  const { bookMemberCopyOnAdminDesk, refreshCopyOrdersFromBroker, snapshot } = await import("./market.js");
  bookMemberCopyOnAdminDesk(
    {
      copyUserId: member.id,
      symbol: "NIFTY 22650 CE",
      side: "BUY",
      qty: 65,
      price: 225.7,
      strategy: "NIFTY 5m first candle",
      brokerId: "dhan",
    },
    { live: { orderId: "ord-22570", status: "PENDING", price: 225.7 } },
  );
  const updates = applyMemberDhanOrderStatuses(member.id, [
    { orderId: "ord-22570", orderStatus: "REJECTED", omsErrorDescription: "Insufficient funds", price: 0 },
  ]);
  assert.equal(updates[0].status, "REJECTED");
  refreshCopyOrdersFromBroker(member.id, updates);
  const desk = getMemberDesk({ user: member, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  assert.equal(desk.orders.some((row) => row.id === "ord-22570"), false);
  const row = (desk.orderHistory || []).find((item) => item.id === "ord-22570");
  assert.equal(row.status, "REJECTED");
  assert.equal(row.price, 225.7);
  assert.match(row.reason, /Insufficient funds/);
  assert.equal(desk.positions.some((item) => item.symbol === "NIFTY 22650 CE"), false);
  const admin = snapshot().orders.find((item) => item.copyUserId === member.id && String(item.id).endsWith("ord-22570"));
  assert.equal(admin.status, "REJECTED");
  assert.match(admin.reason, /Insufficient funds/);
  assert.equal(memberWorkingDhanCopies().some((item) => item.userId === member.id), false);
  const alert = (desk.alerts || []).find((row) => row.symbol === "NIFTY 22650 CE");
  assert.equal(alert.status, "REJECTED");
  assert.match(alert.text, /Copied BUY 65 NIFTY 22650 CE · NIFTY 5m first candle · REJECTED · Insufficient funds/);
});

test("fills and broker refusals stay on the member book; expired tickets stay off", () => {
  const member = { id: "u-book-split", name: "Book Split", email: "booksplit@t2s.app", role: "user" };
  selectMemberBroker({ user: member, brokerId: "dhan" });
  const pending = recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24100 CE", side: "BUY", qty: 65, price: 40, strategy: algo.name, brokerId: "dhan" },
    live: { orderId: "ord-pending", status: "TRANSIT", price: 40, filledQty: 0 },
  });
  const filled = recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24200 CE", side: "BUY", qty: 65, price: 50, strategy: algo.name, brokerId: "dhan" },
    live: { orderId: "ord-fill", status: "TRADED", price: 50, filledQty: 65 },
  });
  const rejected = recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24300 CE", side: "BUY", qty: 65, price: 60, strategy: algo.name, brokerId: "dhan" },
    live: { orderId: "ord-rej", status: "REJECTED" },
    error: new Error("Insufficient margin"),
  });
  const failed = recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24400 CE", side: "BUY", qty: 65, price: 70, strategy: algo.name, brokerId: "dhan" },
    live: { orderId: "ord-fail", status: "FAILED" },
  });
  assert.equal(pending.status, "PENDING");
  assert.equal(filled.status, "FILLED");
  assert.equal(rejected.status, "REJECTED");
  assert.equal(failed.status, "FAILED");
  const desk = getMemberDesk({ user: member, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  assert.deepEqual(desk.orders.map((row) => row.symbol), ["NIFTY 24100 CE"]);
  assert.equal(desk.orders[0].status, "PENDING");
  assert.equal(desk.orderHistory.some((row) => row.symbol === "NIFTY 24200 CE" && row.status === "FILLED"), true);
  assert.equal(desk.orderHistory.some((row) => row.symbol === "NIFTY 24300 CE" && row.status === "REJECTED" && /Insufficient margin/.test(row.reason)), true);
  assert.equal(desk.orderHistory.some((row) => row.symbol === "NIFTY 24400 CE" && row.status === "FAILED"), true);
  assert.equal(desk.orderHistory.some((row) => row.status === "EXPIRED"), false);
  assert.equal(desk.orders.some((row) => row.status === "FILLED" || row.status === "REJECTED" || row.status === "FAILED"), false);
});

test("8:00 AM IST reset clears member positions and leftover working orders without expired history", () => {
  const member = { id: "u-daily-clear", name: "Daily Clear", email: "dailyclear@t2s.app", role: "user" };
  selectMemberBroker({ user: member, brokerId: "dhan" });
  recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24500 CE", side: "BUY", qty: 65, price: 80, strategy: algo.name, brokerId: "dhan" },
    paper: true,
  });
  recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24550 CE", side: "BUY", qty: 65, price: 22, strategy: algo.name, brokerId: "dhan" },
    live: { orderId: "ord-open-next-day", status: "PENDING", price: 22 },
  });
  const open = getMemberDesk({ user: member, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  assert.ok(open.positions.some((row) => row.symbol === "NIFTY 24500 CE"));
  assert.ok(open.orders.some((row) => row.symbol === "NIFTY 24550 CE" && row.status === "PENDING"));
  assert.ok((open.alerts || []).some((row) => row.symbol === "NIFTY 24500 CE"));
  const nextOpen = lastDailyResetAt(Date.now(), TOKEN_RENEW_HOUR_IST) + 24 * 60 * 60 * 1000 + 1_000;
  assert.equal(sweepMemberDailyBooks(nextOpen) >= 1, true);
  const after = getMemberDesk({ user: member, enrollments: [], algos: [algo], quote: () => 0, ownBookOnly: true });
  assert.equal(after.positions.length, 0);
  assert.equal(after.orders.length, 0);
  assert.equal((after.alerts || []).length, 0);
  assert.ok(after.orderHistory.some((row) => row.symbol === "NIFTY 24500 CE" && row.status === "FILLED"));
  assert.equal(after.orderHistory.some((row) => row.symbol === "NIFTY 24550 CE" || row.status === "EXPIRED"), false);
});

test("admin Dhan client ID and access token persist on the admin desk, not the login id", () => {
  persistAdminBrokerSecrets({
    brokerId: "dhan",
    accountId: "1100333",
    accessToken: "admin-dhan-token-persist",
  });
  const saved = peekAdminBrokerSecrets("dhan");
  assert.equal(saved.accountId, "1100333");
  assert.equal(saved.brokerToken, "admin-dhan-token-persist");
  assert.notEqual(saved.accountId, "admin");
  assert.notEqual(saved.accountId, "trades2smart@gmail.com");
  persistAdminBrokerSecrets({
    brokerId: "dhan",
    accountId: "1100333",
    accessToken: "admin-dhan-token-replaced",
  });
  assert.equal(peekAdminBrokerSecrets("dhan").brokerToken, "admin-dhan-token-replaced");
  assert.equal(peekAdminBrokerSecrets("dhan").accountId, "1100333");
});

test("deploy purge and a blank token patch keep the admin access token", () => {
  persistAdminBrokerSecrets({
    brokerId: "dhan",
    accountId: "1100333",
    accessToken: "admin-token-survive-deploy",
  });
  purgeMemberDesksExcept([]);
  sweepMemberDailyBooks(Date.now() + 3 * 24 * 60 * 60 * 1000);
  assert.equal(peekAdminBrokerSecrets("dhan").brokerToken, "admin-token-survive-deploy");
  const raw = JSON.parse(fs.readFileSync(process.env.T2S_MEMBER_DESK_FILE, "utf8"));
  assert.equal(raw.admin.brokerAccounts.dhan.brokerToken, "admin-token-survive-deploy");
  const member = { id: "u-keep-token", name: "Keep", email: "keep-token@t2s.app", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "1100771",
    accessToken: "member-token-keep-deploy",
  });
  saveClientSettings(member.id, { brokerToken: "", notes: "deploy touch" });
  assert.equal(peekClientSecrets(member.id).brokerToken, "member-token-keep-deploy");
  assert.equal(peekBrokerAccount(member.id, "dhan").brokerToken, "member-token-keep-deploy");
});

test("admin save of a user's own Kotak Neo shows on the profile", () => {
  const member = { id: "u-kotak-own", name: "Own Kotak", email: "own.kotak@gmail.com", role: "user" };
  const saved = saveClientSettings(member.id, {
    brokerId: "kotak",
    accountId: "USERK1",
    brokerApiKey: "user-consumer-key",
    brokerToken: "user-access-token",
  });
  assert.equal(saved.accountId, "USERK1");
  assert.equal(saved.credentialsInstalled, true);
  const shown = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
  assert.equal(shown.install.accountId, "USERK1");
  assert.equal(shown.install.installed, true);
  assert.equal(shown.brokers.find((row) => row.id === "kotak").installed, true);
  const copy = brokerAccountForLiveCopy(member.id, "kotak");
  assert.equal(copy.brokerToken, "user-access-token");
  assert.equal(copy.leftoverToken, false);
});

test("admin save refuses the admin Kotak Neo login", () => {
  const member = { id: "u-kotak-admin", name: "Admin Kotak", email: "admin.kotak@gmail.com", role: "user" };
  const saved = {
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_CLIENT_ID = "YIX14";
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-key-9f44";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-key-9f44";
  try {
    assert.throws(
      () =>
        saveClientSettings(member.id, {
          brokerId: "kotak",
          accountId: "YIX14",
          brokerApiKey: "admin-key-9f44",
          brokerToken: "admin-key-9f44",
        }),
      /admin Kotak Neo/,
    );
    const shown = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
    assert.equal(shown.install.accountId, "");
    assert.equal(shown.install.installed, false);
    assert.equal(brokerAccountForLiveCopy(member.id, "kotak").brokerToken, "");
  } finally {
    for (const [name, value] of [
      ["T2S_KOTAK_CLIENT_ID", saved.id],
      ["T2S_KOTAK_CONSUMER_KEY", saved.key],
      ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
    ]) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("a Kotak user's own login is used for balance when it was saved before the added flag", async () => {
  const file = path.join(dir, "legacy-kotak-desk.json");
  const saved = {
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  delete process.env.T2S_KOTAK_CLIENT_ID;
  delete process.env.T2S_KOTAK_CONSUMER_KEY;
  delete process.env.T2S_KOTAK_ACCESS_TOKEN;
  fs.writeFileSync(
    file,
    JSON.stringify({
      "u-avinash-kotak": {
        brokerId: "kotak",
        accountId: "YT2Vm",
        brokerToken: "trade-token-1452",
        brokerApiKey: "member-consumer",
        brokerSessionToken: "neo-sid-88",
        brokerAccounts: {
          kotak: {
            accountId: "YT2Vm",
            brokerToken: "trade-token-1452",
            brokerApiKey: "member-consumer",
            brokerSessionToken: "neo-sid-88",
            memberAdded: false,
          },
        },
      },
    }),
  );
  const previous = process.env.T2S_MEMBER_DESK_FILE;
  process.env.T2S_MEMBER_DESK_FILE = file;
  try {
    const fresh = await import(`./memberDesk.js?legacy-kotak=${Date.now()}`);
    const slot = fresh.brokerAccountForLiveCopy("u-avinash-kotak", "kotak");
    assert.equal(slot.leftoverToken, false);
    assert.equal(slot.accountId, "YT2Vm");
    assert.equal(slot.brokerToken, "trade-token-1452");
    assert.equal(slot.brokerSessionToken, "neo-sid-88");
    const shown = fresh.peekClientSettings("u-avinash-kotak");
    assert.equal(shown.accountId, "YT2Vm");
    assert.equal(shown.brokerAccounts.kotak.sessionHint.includes("•"), true);
  } finally {
    if (previous == null) delete process.env.T2S_MEMBER_DESK_FILE;
    else process.env.T2S_MEMBER_DESK_FILE = previous;
    for (const [name, value] of [
      ["T2S_KOTAK_CLIENT_ID", saved.id],
      ["T2S_KOTAK_CONSUMER_KEY", saved.key],
      ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
    ]) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("the member profile does not show the desk Kotak Neo login", async () => {
  const member = { id: "u-kotak-wait", name: "Wait Kotak", email: "wait.kotak@gmail.com", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "YIX14",
    apiKey: "cd-consumer-key-3e77",
    accessToken: "kotak-desk-access-token",
  });
  const { connectLiveBroker } = await import("./liveBrokers.js");
  await connectLiveBroker(
    "kotak",
    { clientId: "YIX14", apiKey: "cd-consumer-key-3e77", accessToken: "kotak-desk-access-token" },
    async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ clientId: "YIX14", name: "Desk Kotak" }) }),
  );
  const shown = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
  assert.equal(shown.install.accountId, "");
  assert.equal(shown.install.apiKeyHint, "");
  assert.equal(shown.install.tokenHint, "");
  assert.equal(shown.install.installed, false);
  const kotak = shown.brokers.find((row) => row.id === "kotak");
  assert.equal(kotak.installed, false);
  assert.equal(kotak.accountId, "");
  assert.match(kotak.note, /own client ID/);
  assert.equal(brokerAccountForLiveCopy(member.id, "kotak").brokerToken, "");
  assert.equal(brokerAccountForLiveCopy(member.id, "kotak").leftoverToken, true);
  assert.throws(
    () =>
      installMemberBroker({
        user: member,
        brokerId: "kotak",
        clientId: "YIX14",
        apiKey: "cd-consumer-key-3e77",
        accessToken: "kotak-desk-access-token",
      }),
    /Waiting for this user to add their own Kotak Neo/,
  );
  assert.throws(
    () =>
      saveClientSettings(member.id, {
        brokerId: "kotak",
        accountId: "YIX14",
        brokerApiKey: "cd-consumer-key-3e77",
        brokerToken: "kotak-desk-access-token",
      }),
    /desk Kotak Neo/,
  );
  const own = installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "USER88",
    apiKey: "member-consumer-key",
    accessToken: "member-kotak-token",
  });
  assert.equal(own.install.accountId, "USER88");
  assert.equal(own.install.installed, true);
  assert.equal(own.install.apiKeyHint.includes("member-consumer-key"), false);
  assert.match(own.install.apiKeyHint, /me••••/);
  const kotakField = own.install.fields.find((row) => row.id === "apiKey");
  assert.equal(kotakField.secret, true);
  assert.equal(kotakField.label, "Consumer key");
});

test("a member Kotak trade login still supplies the balance when the consumer key matches the desk", () => {
  const saved = {
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_CLIENT_ID = "YT2VM";
  process.env.T2S_KOTAK_CONSUMER_KEY = "same-consumer-key";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "same-consumer-key";
  try {
    const member = { id: "u-yt2vm-balance", name: "Avinash", email: "avinash.ramole86@gmail.com", role: "user" };
    installMemberBroker({
      user: member,
      brokerId: "kotak",
      clientId: "YT2VM",
      apiKey: "same-consumer-key",
      accessToken: "same-consumer-key",
      mobile: "9000000000",
      mpin: "111111",
      totpSecret: "GEZDGNBVGY3TQOJQ",
    });
    const slot = brokerAccountForLiveCopy(member.id, "kotak");
    assert.equal(slot.leftoverToken, false);
    assert.equal(slot.accountId, "YT2VM");
    assert.equal(slot.brokerMobile, "+919000000000");
    assert.equal(slot.brokerMpin, "111111");
    assert.equal(slot.brokerTotpSecret, "GEZDGNBVGY3TQOJQ");
    const shown = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
    assert.equal(shown.install.accountId, "YT2VM");
    assert.equal(shown.install.hasTradeLogin, true);
    assert.equal(shown.wallet.balance, 0);
  } finally {
    for (const [name, value] of [
      ["T2S_KOTAK_CLIENT_ID", saved.id],
      ["T2S_KOTAK_CONSUMER_KEY", saved.key],
      ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
    ]) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("an empty Neo sid is removed when clear is requested and a blank save keeps it", () => {
  const member = { id: "u-clear-sid", name: "Clear Sid", email: "clear.sid@gmail.com", role: "user" };
  installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "YT2VM",
    apiKey: "member-consumer",
    accessToken: "member-access-1452",
    sessionToken: "neo-sid-88",
    mobile: "9000000000",
    mpin: "111111",
    totpSecret: "GEZDGNBVGY3TQOJQ",
  });
  saveClientSettings(member.id, { brokerSessionToken: "" });
  assert.equal(peekBrokerAccount(member.id, "kotak").brokerSessionToken, "neo-sid-88");
  saveClientSettings(member.id, { clearSessionToken: true });
  const slot = peekBrokerAccount(member.id, "kotak");
  assert.equal(slot.brokerSessionToken, "");
  assert.equal(slot.brokerToken, "member-access-1452");
  assert.equal(slot.brokerMobile, "+919000000000");
  const shown = getMemberDesk({ user: member, enrollments: [], quote: () => 0 });
  assert.equal(shown.install.sessionHint, "");
  assert.equal(shown.install.hasTradeLogin, true);
});

test("a Kotak user's trade login stays on that user and is not returned on the profile view", async () => {
  const member = { id: "u-yt2vm-login", name: "Avinash", email: "avinash.ramole86@gmail.com", role: "user" };
  const saved = installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "YT2Vm",
    apiKey: "member-consumer",
    accessToken: "member-access-1452",
    mobile: "9876501234",
    mpin: "654321",
    totpSecret: "GEZDGNBVGY3TQOJQ",
  });
  const view = JSON.stringify(saved.install);
  assert.equal(view.includes("654321"), false);
  assert.equal(view.includes("GEZDGNBVGY3TQOJQ"), false);
  assert.equal(view.includes("9876501234"), false);
  assert.equal(saved.install.hasTradeLogin, true);
  assert.equal(saved.install.fields.some((row) => row.id === "mpin" && row.secret), true);
  const slot = brokerAccountForLiveCopy(member.id, "kotak");
  assert.equal(slot.leftoverToken, false);
  assert.equal(slot.accountId, "YT2Vm");
  assert.equal(slot.brokerMobile, "+919876501234");
  assert.equal(slot.brokerMpin, "654321");
  assert.equal(slot.brokerTotpSecret, "GEZDGNBVGY3TQOJQ");
  saveClientSettings(member.id, { copy: true, tradeMode: "real", brokerId: "kotak" });
  const { memberCopyPayloads } = await import("./liveCopy.js");
  const copies = memberCopyPayloads(
    { strategy: "CRUDE", symbol: "CRUDEOIL 8800 PE", side: "BUY", qty: 100, lotSize: 100, brokerId: "dhan" },
    { id: "crude", mappingScope: "master" },
  );
  const row = copies.find((item) => item.copyUserId === member.id);
  assert.ok(row);
  assert.equal(row.brokerId, "kotak");
  assert.equal(row.brokerSession.clientId, "YT2Vm");
  assert.equal(row.brokerSession.accessToken, "member-access-1452");
  assert.equal(row.brokerSession.mobile, "+919876501234");
  assert.equal(row.brokerSession.mpin, "654321");
  assert.equal(row.brokerSession.totpSecret, "GEZDGNBVGY3TQOJQ");
  assert.equal(JSON.stringify(row.account).includes("YIX14"), false);
});
