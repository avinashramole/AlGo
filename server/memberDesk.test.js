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
  peekBrokerAccount,
  peekClientSecrets,
  saveClientSettings,
  selectMemberBroker,
  startWalletTopup,
} = await import("./memberDesk.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const user = { id: "u-member", name: "Desk Member", email: "member.desk@gmail.com", role: "user" };
const algo = { id: "a4", name: "NIFTY VWAP ATM" };

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
  assert.deepEqual(queued.map((row) => row.brokerId), ["dhan"]);
  assert.equal(queued.every((row) => !row.copyUserId), true);
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
