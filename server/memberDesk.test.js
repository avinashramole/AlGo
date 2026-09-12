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
const { connectLiveBroker } = await import("./liveBrokers.js");
const {
  ensurePlanLedger,
  getMemberDesk,
  listTopups,
  liveAutoTradeBrokers,
  markTopupPaid,
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

test("liveAutoTradeBrokers adds a member live broker when the desk account is LIVE", async () => {
  const enrolled = enrollStrategy({
    user,
    algo,
    channel: "gpay",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  markEnrollmentPaid({ user, enrollmentId: enrolled.enrollment.id });
  selectMemberBroker({ user, brokerId: "zerodha" });
  assert.deepEqual(liveAutoTradeBrokers({ strategyName: "NIFTY VWAP ATM", algoBrokerId: "dhan" }), ["dhan"]);

  await connectLiveBroker(
    "zerodha",
    { clientId: "AB1234", apiKey: "kitekey11", accessToken: "kite-access-token" },
    async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { user_id: "AB1234", user_name: "Avinash" } }),
    }),
  );
  assert.deepEqual(liveAutoTradeBrokers({ strategyName: "NIFTY VWAP ATM", algoBrokerId: "dhan" }).sort(), [
    "dhan",
    "zerodha",
  ]);

  selectMemberBroker({ user, brokerId: "paper" });
  assert.deepEqual(liveAutoTradeBrokers({ strategyName: "NIFTY VWAP ATM", algoBrokerId: "dhan" }), ["dhan"]);
});

test("queueLiveAlgoOrder places one live order per selected desk broker", async () => {
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
  assert.deepEqual(queued.map((row) => row.brokerId).sort(), ["dhan", "zerodha"]);
});
