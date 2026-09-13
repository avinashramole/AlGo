import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYMENTS_FILE = process.env.T2S_PAYMENTS_FILE || path.join(__dirname, "data", "payments.json");
const ENROLL_FILE = process.env.T2S_ENROLL_FILE || path.join(__dirname, "data", "enrollments.json");
const DEFAULT_AMOUNT = 999;
export const PLAN_TERMS = ["monthly", "quarterly", "yearly"];

function addCalendarMonths(date, months) {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + Number(months || 0));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}

export function normalizePlanTerm(value) {
  const term = String(value || "").trim().toLowerCase();
  return PLAN_TERMS.includes(term) ? term : "monthly";
}

export function termMonths(value) {
  return { monthly: 1, quarterly: 3, yearly: 12 }[normalizePlanTerm(value)];
}

export function feeForTerm(base, term) {
  const monthly = Number(base);
  if (!Number.isFinite(monthly) || monthly < 1) return 0;
  return Math.round(monthly) * termMonths(term);
}

export function planWindow({ startedAt, term } = {}) {
  const start = startedAt ? new Date(startedAt) : new Date();
  const from = Number.isNaN(start.getTime()) ? new Date() : start;
  return {
    startedAt: from.toISOString(),
    endsAt: addCalendarMonths(from, termMonths(term)).toISOString(),
  };
}

function hydratePlanDates(row = {}) {
  const term = normalizePlanTerm(row.term);
  if (row.status !== "paid") {
    return { term, startedAt: row.startedAt || "", endsAt: row.endsAt || "" };
  }
  if (row.startedAt && row.endsAt) {
    return { term, startedAt: row.startedAt, endsAt: row.endsAt };
  }
  return { term, ...planWindow({ startedAt: row.startedAt || row.paidAt || row.createdAt, term }) };
}

export function enrollmentActive(row, now = new Date()) {
  if (!row || row.status !== "paid") return false;
  const { endsAt } = hydratePlanDates(row);
  if (!endsAt) return true;
  return new Date(endsAt).getTime() >= now.getTime();
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizePayMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function isMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizePayMobile(value));
}

function readJson(file, fallback) {
  try {
    const row = JSON.parse(fs.readFileSync(file, "utf8"));
    return row && typeof row === "object" ? row : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function loadPayments() {
  const row = readJson(PAYMENTS_FILE, {});
  const mobile = normalizePayMobile(row.mobile);
  const amount = Number(row.amount);
  return {
    mobile: isMobile(mobile) ? mobile : "",
    upiId: String(row.upiId || "").trim().toLowerCase(),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : DEFAULT_AMOUNT,
    payeeName: String(row.payeeName || "Trade2Smart").trim() || "Trade2Smart",
  };
}

let payments = loadPayments();
let enrollments = Array.isArray(readJson(ENROLL_FILE, [])) ? readJson(ENROLL_FILE, []) : [];

function persistPayments() {
  writeJson(PAYMENTS_FILE, payments);
}

function persistEnrollments() {
  writeJson(ENROLL_FILE, enrollments);
}

export function getPaymentSettings() {
  return { ...payments };
}

export function publicPayments(admins = []) {
  const fallback = admins.find((row) => row?.role === "admin" && isMobile(row.mobile));
  const mobile = payments.mobile || normalizePayMobile(fallback?.mobile);
  const ready = isMobile(mobile);
  const payeeName = payments.payeeName || fallback?.name || "Trade2Smart";
  return {
    ready,
    mobile: ready ? mobile : "",
    mobileMasked: ready ? `${mobile.slice(0, 2)}••••${mobile.slice(-2)}` : "",
    upiId: ready ? (payments.upiId || `${mobile}@ybl`) : "",
    amount: payments.amount,
    payeeName,
  };
}

export function savePaymentSettings({ mobile, upiId, amount, payeeName } = {}) {
  const nextMobile = normalizePayMobile(mobile);
  if (!isMobile(nextMobile)) throw fail("Enter the 10-digit GPay / PhonePe mobile that should receive enrollments.");
  const nextAmount = Number(amount);
  if (!Number.isFinite(nextAmount) || nextAmount < 1) throw fail("Enrollment amount must be at least ₹1.");
  const nextUpi = String(upiId || "").trim().toLowerCase();
  if (nextUpi && !nextUpi.includes("@")) throw fail("UPI ID must look like 98xxxxxxxx@ybl or name@okicici.");
  payments = {
    mobile: nextMobile,
    upiId: nextUpi,
    amount: Math.round(nextAmount),
    payeeName: String(payeeName || "Trade2Smart").trim() || "Trade2Smart",
  };
  persistPayments();
  return getPaymentSettings();
}

export function upiVpa(settings = payments, admins = []) {
  const pub = publicPayments(admins);
  return pub.upiId;
}

export function buildUpiLinks({ vpa, payeeName, amount, note } = {}) {
  const pa = String(vpa || "").trim().toLowerCase();
  if (!pa.includes("@")) throw fail("Set the admin GPay / PhonePe number in Settings first.");
  const am = Number(amount);
  if (!Number.isFinite(am) || am < 1) throw fail("Invalid enrollment amount.");
  const params = new URLSearchParams({
    pa,
    pn: String(payeeName || "Trade2Smart").slice(0, 50),
    am: String(Math.round(am)),
    cu: "INR",
    tn: String(note || "T2S strategy enroll").slice(0, 50),
  });
  const qs = params.toString();
  return {
    upi: `upi://pay?${qs}`,
    gpay: `tez://upi/pay?${qs}`,
    phonepe: `phonepe://pay?${qs}`,
    qr: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?${qs}`)}`,
  };
}

export function catalogStrategy(algo, settings = payments) {
  if (!algo) return null;
  const fee = Number(algo.enrollFee);
  const monthly = Number.isFinite(fee) && fee > 0 ? Math.round(fee) : settings.amount;
  return {
    id: algo.id,
    name: algo.name || "Strategy",
    enrollFee: monthly,
    terms: {
      monthly,
      quarterly: feeForTerm(monthly, "quarterly"),
      yearly: feeForTerm(monthly, "yearly"),
    },
  };
}

export function listCatalog(algos = [], admins = []) {
  const pub = publicPayments(admins);
  return {
    payments: pub,
    strategies: (Array.isArray(algos) ? algos : []).map((row) => catalogStrategy(row, payments)).filter(Boolean),
  };
}

function publicEnroll(row) {
  const dates = hydratePlanDates(row);
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    strategyId: row.strategyId,
    strategyName: row.strategyName,
    amount: row.amount,
    channel: row.channel,
    term: dates.term,
    status: row.status,
    payeeMobile: row.payeeMobile,
    createdAt: row.createdAt,
    paidAt: row.paidAt || "",
    claimedAt: row.claimedAt || "",
    verifiedAt: row.verifiedAt || "",
    verifiedBy: row.verifiedBy || "",
    utr: row.utr || "",
    startedAt: dates.startedAt,
    endsAt: dates.endsAt,
    active: enrollmentActive(row),
  };
}

export function listEnrollments({ userId, admin } = {}) {
  const rows = admin ? enrollments : enrollments.filter((row) => row.userId === userId);
  return rows
    .map(publicEnroll)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function enrollStrategy({ user, algo, channel, term, admins } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  if (!algo?.id) throw fail("Strategy not found.", 404);
  const pub = publicPayments(admins);
  if (!pub.ready) throw fail("Admin has not set a GPay / PhonePe mobile yet. Ask the desk to add it in Settings.");
  const wanted = channel === "phonepe" ? "phonepe" : "gpay";
  const wantedTerm = normalizePlanTerm(term);
  const catalog = catalogStrategy(algo, payments);
  const amount = feeForTerm(catalog.enrollFee, wantedTerm);
  const activePaid = enrollments.find((row) => row.userId === user.id && row.strategyId === algo.id && enrollmentActive(row));
  if (activePaid) {
    return { enrollment: publicEnroll(activePaid), payments: pub, links: null, already: true };
  }
  const claimed = enrollments.find((row) => row.userId === user.id && row.strategyId === algo.id && row.status === "claimed");
  if (claimed) {
    return { enrollment: publicEnroll(claimed), payments: pub, links: null, already: true };
  }
  const existing = enrollments.find((row) => row.userId === user.id && row.strategyId === algo.id && row.status === "pending");
  const row = existing || {
    id: `en${crypto.randomBytes(8).toString("hex")}`,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    strategyId: algo.id,
    strategyName: catalog.name,
    amount,
    term: wantedTerm,
    channel: wanted,
    status: "pending",
    payeeMobile: pub.mobile,
    createdAt: new Date().toISOString(),
  };
  row.channel = wanted;
  row.term = wantedTerm;
  row.amount = amount;
  row.strategyName = catalog.name;
  row.payeeMobile = pub.mobile;
  row.startedAt = "";
  row.endsAt = "";
  row.paidAt = "";
  if (!existing) enrollments.unshift(row);
  persistEnrollments();
  const links = buildUpiLinks({
    vpa: pub.upiId,
    payeeName: pub.payeeName,
    amount: row.amount,
    note: `T2S ${catalog.name} ${wantedTerm}`.slice(0, 50),
  });
  return { enrollment: publicEnroll(row), payments: pub, links, already: false };
}

export function claimEnrollmentPaid({ user, enrollmentId, utr } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const row = enrollments.find((item) => item.id === enrollmentId);
  if (!row) throw fail("Enrollment not found.", 404);
  if (row.userId !== user.id && user.role !== "admin") throw fail("Enrollment not found.", 404);
  if (row.status === "paid") return publicEnroll(row);
  if (row.status === "abandoned") throw fail("This enrollment was cancelled. Enroll again.");
  row.status = "claimed";
  row.claimedAt = new Date().toISOString();
  row.utr = String(utr || "").replace(/\s+/g, "").slice(0, 32);
  persistEnrollments();
  return publicEnroll(row);
}

export function markEnrollmentPaid({ user, enrollmentId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const row = enrollments.find((item) => item.id === enrollmentId);
  if (!row) throw fail("Enrollment not found.", 404);
  if (row.userId !== user.id && user.role !== "admin") throw fail("Enrollment not found.", 404);
  if (row.status === "paid") return publicEnroll(row);
  if (row.status === "abandoned") throw fail("Enrollment is cancelled.");
  const now = new Date().toISOString();
  row.status = "paid";
  row.paidAt = now;
  if (user.role === "admin") {
    row.verifiedAt = now;
    row.verifiedBy = user.id || user.email || "admin";
  }
  row.term = normalizePlanTerm(row.term);
  const window = planWindow({ startedAt: now, term: row.term });
  row.startedAt = window.startedAt;
  row.endsAt = window.endsAt;
  persistEnrollments();
  return publicEnroll(row);
}

export function abandonEnrollment({ user, enrollmentId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const row = enrollments.find((item) => item.id === enrollmentId);
  if (!row) throw fail("Enrollment not found.", 404);
  if (row.userId !== user.id && user.role !== "admin") throw fail("Enrollment not found.", 404);
  if (row.status === "paid") throw fail("Paid enrollments cannot be cancelled.");
  if (row.status === "claimed" && user.role !== "admin") throw fail("Payment is waiting for admin. Ask the desk to verify or delete it.");
  row.status = "abandoned";
  row.abandonedAt = new Date().toISOString();
  persistEnrollments();
  return publicEnroll(row);
}

export function deleteEnrollment({ user, enrollmentId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  if (user.role !== "admin") throw fail("Admin only.", 403);
  const index = enrollments.findIndex((item) => item.id === enrollmentId);
  if (index < 0) throw fail("Enrollment not found.", 404);
  const [row] = enrollments.splice(index, 1);
  persistEnrollments();
  return publicEnroll(row);
}
