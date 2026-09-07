import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-sub-"));
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const {
  buildUpiLinks,
  catalogStrategy,
  enrollStrategy,
  listCatalog,
  listEnrollments,
  markEnrollmentPaid,
  publicPayments,
  savePaymentSettings,
} = await import("./subscriptions.js");

test("savePaymentSettings requires a GPay/PhonePe mobile", () => {
  assert.throws(() => savePaymentSettings({ mobile: "123", amount: 500 }), /10-digit/);
  const row = savePaymentSettings({
    mobile: "9876543210",
    amount: 499,
    payeeName: "Avinash",
    upiId: "9876543210@ybl",
  });
  assert.equal(row.mobile, "9876543210");
  assert.equal(row.amount, 499);
});

test("buildUpiLinks create GPay and PhonePe intents to the admin VPA", () => {
  const links = buildUpiLinks({
    vpa: "9876543210@ybl",
    payeeName: "Avinash",
    amount: 499,
    note: "NIFTY VWAP ATM",
  });
  assert.match(links.gpay, /^tez:\/\/upi\/pay\?/);
  assert.match(links.phonepe, /^phonepe:\/\/pay\?/);
  assert.match(links.upi, /pa=9876543210%40ybl/);
  assert.match(links.upi, /am=499/);
});

test("catalogStrategy only exposes titles and fee, not live trading fields", () => {
  const row = catalogStrategy(
    { id: "a4", name: "NIFTY VWAP ATM", enabled: true, brokerId: "dhan", trade: { ready: true }, enrollFee: 799 },
    { amount: 999 },
  );
  assert.equal(row.name, "NIFTY VWAP ATM");
  assert.equal(row.enrollFee, 799);
  assert.equal(row.enabled, undefined);
  assert.equal(row.brokerId, undefined);
  assert.equal(row.trade, undefined);
});

test("enrollStrategy asks for GPay/PhonePe and records a pending member", () => {
  const algo = { id: "a4", name: "NIFTY VWAP ATM" };
  const user = { id: "u1", name: "Desk Member", email: "member.desk@gmail.com", role: "user" };
  const result = enrollStrategy({ user, algo, channel: "gpay" });
  assert.equal(result.enrollment.status, "pending");
  assert.equal(result.enrollment.amount, 499);
  assert.equal(result.payments.mobile, "9876543210");
  assert.match(result.links.gpay, /tez:\/\//);
  const paid = markEnrollmentPaid({ user, enrollmentId: result.enrollment.id });
  assert.equal(paid.status, "paid");
  const mine = listEnrollments({ userId: "u1" });
  assert.equal(mine[0].status, "paid");
});

test("publicPayments falls back to an admin profile mobile", () => {
  const pub = publicPayments([{ role: "admin", mobile: "9123456789", name: "Avinash" }]);
  assert.equal(pub.ready, true);
});

test("listCatalog returns every admin strategy title", () => {
  const catalog = listCatalog([
    { id: "a4", name: "NIFTY VWAP ATM" },
    { id: "a5", name: "NIFTY 15m VWAP reversal" },
  ]);
  assert.deepEqual(
    catalog.strategies.map((row) => row.name),
    ["NIFTY VWAP ATM", "NIFTY 15m VWAP reversal"],
  );
});
