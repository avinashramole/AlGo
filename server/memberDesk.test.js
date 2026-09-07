import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-member-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const { savePaymentSettings } = await import("./subscriptions.js");
const {
  ensurePlanLedger,
  getMemberDesk,
  listTopups,
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
  assert.equal(row.brokers.find((item) => item.id === "dhan")?.selected, true);
  assert.equal(row.brokers.every((item) => item.clientId == null), true);
});

test("paid plan report includes MTM from the member paper book", () => {
  ensurePlanLedger({ user, algo });
  const desk = getMemberDesk({
    user,
    enrollments: [{ strategyId: "a4", strategyName: "NIFTY VWAP ATM", status: "paid" }],
    algos: [algo],
    quote: (symbol) => (String(symbol).includes("24600") ? 90 : 0),
  });
  assert.equal(desk.plans[0].strategyName, "NIFTY VWAP ATM");
  assert.ok(desk.report.unrealizedPnl !== 0);
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
