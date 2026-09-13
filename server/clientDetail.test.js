import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-client-detail-"));
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_MESSAGING_FILE = path.join(dir, "messaging.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

fs.writeFileSync(
  process.env.T2S_USERS_FILE,
  `${JSON.stringify(
    [
      {
        id: "avinash",
        name: "Avinash",
        email: "demo@t2s.app",
        desk: "Index Options",
        role: "admin",
        password: "demo123",
      },
      {
        id: "u-view",
        name: "View Member",
        email: "view.member@gmail.com",
        mobile: "9876501111",
        desk: "Index Options",
        role: "user",
        createdAt: "2026-09-09T10:00:00.000Z",
      },
    ],
    null,
    2,
  )}\n`,
);

const { listPublicUsers } = await import("./auth.js");
const { enrollStrategy, markEnrollmentPaid, savePaymentSettings, deleteEnrollment } = await import("./subscriptions.js");
const { saveClientSettings, startWalletTopup, markTopupPaid } = await import("./memberDesk.js");
const { getClientDetail } = await import("./clients.js");

savePaymentSettings({
  mobile: "9876543210",
  amount: 999,
  payeeName: "Avinash",
  upiId: "9876543210@ybl",
});

const member = { id: "u-view", name: "View Member", email: "view.member@gmail.com", role: "user" };
const admin = { id: "avinash", name: "Avinash", role: "admin" };
const algo = { id: "a4", name: "NIFTY VWAP ATM" };

test("getClientDetail returns profile, subscription, transaction, and P&L", () => {
  saveClientSettings("u-view", { brokerId: "dhan", tradeMode: "real" });
  const enrolled = enrollStrategy({
    user: member,
    algo,
    channel: "gpay",
    term: "quarterly",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  markEnrollmentPaid({ user: member, enrollmentId: enrolled.enrollment.id });
  const topup = startWalletTopup({
    user: member,
    amount: 2500,
    channel: "phonepe",
    admins: [{ role: "admin", mobile: "9876543210", name: "Avinash" }],
  });
  markTopupPaid({ user: member, topupId: topup.topup.id });

  const detail = getClientDetail({
    userId: "u-view",
    users: listPublicUsers(),
    algos: [algo],
    liveBook: {
      positions: [
        {
          id: "p1",
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
      closedTrades: [
        {
          id: "t1",
          symbol: "NIFTY 24500 PE",
          side: "BUY",
          qty: 65,
          entry: 70,
          exit: 90,
          pnl: 1300,
          strategy: "NIFTY VWAP ATM",
          closedAt: "2026-09-12T10:00:00.000Z",
        },
      ],
    },
  });

  assert.equal(detail.client.name, "View Member");
  assert.equal(detail.client.mobile, "9876501111");
  assert.equal(detail.enrollments[0].status, "paid");
  assert.equal(detail.enrollments[0].term, "quarterly");
  assert.ok(detail.transactions.some((row) => row.kind === "subscription" && row.amount === enrolled.enrollment.amount));
  assert.ok(detail.transactions.some((row) => row.kind === "wallet" && row.amount === 2500 && row.status === "paid"));
  assert.equal(detail.wallet.balance, 2500);
  assert.equal(detail.plans[0].strategyName, "NIFTY VWAP ATM");
  assert.equal(detail.report.realizedPnl, 1300);
  assert.equal(detail.report.unrealizedPnl, 780);
  assert.equal(detail.positions.length, 1);
  assert.ok(detail.report.tradeBook.some((row) => row.id === "t1"));
});

test("getClientDetail rejects admins and unknown ids", () => {
  assert.throws(() => getClientDetail({ userId: "avinash", users: listPublicUsers() }), /Client not found/);
  assert.throws(() => getClientDetail({ userId: "missing", users: listPublicUsers() }), /Client not found/);
});

test("deleting a subscription removes it from client detail", () => {
  const before = getClientDetail({ userId: "u-view", users: listPublicUsers(), algos: [algo] });
  const paid = before.enrollments.find((row) => row.status === "paid");
  assert.ok(paid);
  deleteEnrollment({ user: admin, enrollmentId: paid.id });
  const after = getClientDetail({ userId: "u-view", users: listPublicUsers(), algos: [algo] });
  assert.equal(after.enrollments.some((row) => row.id === paid.id), false);
  assert.equal(after.plans.length, 0);
});
