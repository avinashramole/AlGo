import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-sub-"));
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const {
  abandonEnrollment,
  buildUpiLinks,
  catalogStrategy,
  claimEnrollmentPaid,
  deleteEnrollment,
  dropEnrollmentsWithoutStrategies,
  enrollmentActive,
  enrollStrategy,
  feeForTerm,
  listCatalog,
  listEnrollments,
  markEnrollmentPaid,
  strategyVisibleToMember,
  planWindow,
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
  assert.equal(row.terms.monthly, 499);
  assert.equal(row.terms.quarterly, feeForTerm(499, "quarterly"));
  assert.equal(row.terms.yearly, feeForTerm(499, "yearly"));
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
    {
      id: "a4",
      name: "NIFTY VWAP ATM",
      tag: "NIFTY VWAP",
      kind: "nifty-vwap",
      summary: "NIFTY VWAP ATM · 5m options · SL 20% / TGT 40%",
      symbol: "NIFTY",
      timeframe: "5m",
      enabled: true,
      brokerId: "dhan",
      trade: { ready: true },
      enrollFee: 799,
    },
    { amount: 999 },
  );
  assert.equal(row.name, "NIFTY VWAP ATM");
  assert.equal(row.enrollFee, 799);
  assert.deepEqual(row.terms, { monthly: 799, quarterly: feeForTerm(799, "quarterly"), yearly: feeForTerm(799, "yearly") });
  assert.equal(row.terms.quarterly < 799 * 3, true);
  assert.equal(row.terms.yearly < 799 * 12, true);
  assert.deepEqual(Object.keys(row).sort(), ["enrollFee", "id", "name", "terms"]);
  assert.equal(row.enabled, undefined);
  assert.equal(row.brokerId, undefined);
  assert.equal(row.trade, undefined);
  assert.equal(row.summary, undefined);
  assert.equal(row.symbol, undefined);
});

test("enrollStrategy asks for GPay/PhonePe and records a pending member", () => {
  const user = { id: "u1", name: "Desk Member", email: "member.desk@gmail.com", role: "user" };
  const algo = { id: "a4", name: "NIFTY VWAP ATM", mappedClientIds: [user.id], mappingScope: "both" };
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

test("member catalog shows only strategies admin mapped to that user", () => {
  const user = { id: "u-map", role: "user" };
  const algos = [
    { id: "a4", name: "NIFTY VWAP ATM", mappingScope: "both", mappedClientIds: [user.id] },
    { id: "a5", name: "NIFTY 15m VWAP reversal", mappingScope: "both", mappedClientIds: ["other"] },
    { id: "a6", name: "TEST1", mappingScope: "master", mappedClientIds: [user.id] },
    { id: "a12", name: "CRUDE OIL", mappingScope: "clients", mappedClientIds: [] },
  ];
  const catalog = listCatalog(algos, [], { userId: user.id, role: "user" });
  assert.deepEqual(catalog.strategies.map((row) => row.name), ["NIFTY VWAP ATM"]);
  const byDesk = listCatalog(algos, [], { userId: user.id, role: "user", mappedStrategy: "CRUDE OIL" });
  assert.deepEqual(byDesk.strategies.map((row) => row.name).sort(), ["CRUDE OIL", "NIFTY VWAP ATM"]);
  const enrolled = listCatalog(algos, [], { userId: user.id, role: "user", enrolledStrategyIds: ["a5"] });
  assert.ok(enrolled.strategies.some((row) => row.id === "a5"));
  assert.equal(strategyVisibleToMember(algos[2], { userId: user.id, role: "user" }), false);
  assert.throws(
    () => enrollStrategy({ user, algo: algos[1], channel: "gpay" }),
    /not assigned/,
  );
});

test("unpaid enroll reverts to a fresh Enroll instead of staying Pay now", () => {
  const user = { id: "u-abandon", name: "Desk Member", email: "member.abandon@gmail.com", role: "user" };
  const algo = { id: "a6", name: "NIFTY 15m VWAP hedge", mappedClientIds: [user.id], mappingScope: "both" };
  const pending = enrollStrategy({ user, algo, channel: "gpay", term: "quarterly" });
  assert.equal(pending.enrollment.status, "pending");
  assert.equal(pending.enrollment.term, "quarterly");
  assert.equal(pending.enrollment.amount, feeForTerm(499, "quarterly"));
  const cancelled = abandonEnrollment({ user, enrollmentId: pending.enrollment.id });
  assert.equal(cancelled.status, "abandoned");
  const mine = listEnrollments({ userId: user.id });
  assert.equal(mine.some((row) => row.status === "pending"), false);
  const again = enrollStrategy({ user, algo, channel: "gpay", term: "monthly" });
  assert.equal(again.already, false);
  assert.equal(again.enrollment.status, "pending");
  assert.equal(again.enrollment.term, "monthly");
});

test("paid monthly quarterly and yearly enrollments expose start and end dates", () => {
  const user = { id: "u-terms", name: "Desk Member", email: "member.terms@gmail.com", role: "user" };
  const algo = { id: "a7", name: "NIFTY VWAP ATM", mappedClientIds: [user.id], mappingScope: "both" };
  const monthly = enrollStrategy({ user, algo, channel: "gpay", term: "monthly" });
  const paidMonthly = markEnrollmentPaid({ user, enrollmentId: monthly.enrollment.id });
  assert.equal(paidMonthly.status, "paid");
  assert.equal(paidMonthly.term, "monthly");
  assert.equal(paidMonthly.active, true);
  assert.ok(paidMonthly.startedAt);
  assert.ok(paidMonthly.endsAt);
  const monthWindow = planWindow({ startedAt: paidMonthly.startedAt, term: "monthly" });
  assert.equal(paidMonthly.endsAt, monthWindow.endsAt);

  const other = { id: "a8", name: "NIFTY 15m VWAP reversal", mappedClientIds: [user.id], mappingScope: "both" };
  const yearly = enrollStrategy({ user, algo: other, channel: "phonepe", term: "yearly" });
  assert.equal(yearly.enrollment.amount, feeForTerm(499, "yearly"));
  const paidYearly = markEnrollmentPaid({ user, enrollmentId: yearly.enrollment.id });
  assert.equal(paidYearly.term, "yearly");
  const yearWindow = planWindow({ startedAt: paidYearly.startedAt, term: "yearly" });
  assert.equal(paidYearly.endsAt, yearWindow.endsAt);
});

test("member claim waits for admin verify before the plan is active", () => {
  const member = { id: "u-claim", name: "Desk Member", email: "member.claim@gmail.com", role: "user" };
  const algo = { id: "a-claim", name: "NIFTY VWAP ATM", mappedClientIds: [member.id], mappingScope: "both" };
  const admin = { id: "admin", name: "Avinash", role: "admin" };
  const pending = enrollStrategy({ user: member, algo, channel: "gpay", term: "monthly" });
  const claimed = claimEnrollmentPaid({ user: member, enrollmentId: pending.enrollment.id, utr: "123456789012" });
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.utr, "123456789012");
  assert.equal(claimed.active, false);
  assert.equal(enrollmentActive(claimed), false);
  assert.throws(() => abandonEnrollment({ user: member, enrollmentId: claimed.id }), /waiting for admin/);
  const again = enrollStrategy({ user: member, algo, channel: "gpay", term: "monthly" });
  assert.equal(again.already, true);
  assert.equal(again.enrollment.status, "claimed");
  const paid = markEnrollmentPaid({ user: admin, enrollmentId: claimed.id });
  assert.equal(paid.status, "paid");
  assert.equal(paid.active, true);
  assert.equal(paid.verifiedBy, "admin");
  assert.ok(paid.verifiedAt);
});

test("enrollment history for a deleted strategy is removed and a live strategy stays", () => {
  const member = { id: "u-shantai", name: "Shantai Infotech", email: "shantai@t2s.app", role: "user" };
  const gone = { id: "gone-ema", name: "ema", mappedClientIds: [member.id], mappingScope: "both" };
  const live = { id: "a8", name: "NIFTY 15m VWAP reversal", mappedClientIds: [member.id], mappingScope: "both" };
  savePaymentSettings({ mobile: "9876543210", amount: 999, payeeName: "Trade2Smart", upiId: "9876543210@ybl" });
  const oldPlan = enrollStrategy({ user: member, algo: gone, channel: "gpay", term: "monthly" });
  markEnrollmentPaid({ user: { id: "admin", role: "admin" }, enrollmentId: oldPlan.enrollment.id });
  const livePlan = enrollStrategy({ user: member, algo: live, channel: "gpay", term: "monthly" });
  markEnrollmentPaid({ user: { id: "admin", role: "admin" }, enrollmentId: livePlan.enrollment.id });
  const removed = dropEnrollmentsWithoutStrategies([live]);
  assert.ok(removed >= 1);
  const left = listEnrollments({ userId: member.id });
  assert.equal(left.some((row) => row.strategyName === "ema"), false);
  assert.equal(left.some((row) => row.strategyId === "a8"), true);
  assert.equal(dropEnrollmentsWithoutStrategies([]), 0);
  assert.equal(listEnrollments({ userId: member.id }).some((row) => row.strategyId === "a8"), true);
});

test("admin can delete a member subscription and a member cannot", () => {
  const member = { id: "u-del", name: "Desk Member", email: "member.del@gmail.com", role: "user" };
  const algo = { id: "a9", name: "NIFTY VWAP ATM", mappedClientIds: [member.id], mappingScope: "both" };
  const admin = { id: "admin", name: "Avinash", role: "admin" };
  const pending = enrollStrategy({ user: member, algo, channel: "gpay", term: "monthly" });
  const paid = markEnrollmentPaid({ user: member, enrollmentId: pending.enrollment.id });
  assert.throws(() => deleteEnrollment({ user: member, enrollmentId: paid.id }), /Admin only/);
  const removed = deleteEnrollment({ user: admin, enrollmentId: paid.id });
  assert.equal(removed.id, paid.id);
  assert.equal(listEnrollments({ userId: member.id }).some((row) => row.id === paid.id), false);
});

test("admin can set discounted monthly quarterly and yearly plan prices", () => {
  const row = savePaymentSettings({
    mobile: "9876543210",
    monthly: 2999,
    quarterly: 6999,
    yearly: 11999,
    payeeName: "Avinash",
    upiId: "9876543210@ybl",
  });
  assert.deepEqual(row.terms, { monthly: 2999, quarterly: 6999, yearly: 11999 });
  const catalog = catalogStrategy({ id: "a-price", name: "NIFTY VWAP ATM" }, row);
  assert.deepEqual(catalog.terms, { monthly: 2999, quarterly: 6999, yearly: 11999 });
  assert.equal(catalog.enrollFee, 2999);
  assert.equal(feeForTerm(2999, "quarterly", row.terms), 6999);
  assert.ok(6999 < 2999 * 3);
  assert.ok(11999 < 2999 * 12);
});
