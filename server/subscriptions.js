import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYMENTS_FILE = process.env.T2S_PAYMENTS_FILE || path.join(__dirname, "data", "payments.json");
const ENROLL_FILE = process.env.T2S_ENROLL_FILE || path.join(__dirname, "data", "enrollments.json");
const DEFAULT_AMOUNT = 999;

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
  return {
    id: algo.id,
    name: algo.name || "Strategy",
    enrollFee: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : settings.amount,
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
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    strategyId: row.strategyId,
    strategyName: row.strategyName,
    amount: row.amount,
    channel: row.channel,
    status: row.status,
    payeeMobile: row.payeeMobile,
    createdAt: row.createdAt,
    paidAt: row.paidAt || "",
  };
}

export function listEnrollments({ userId, admin } = {}) {
  const rows = admin ? enrollments : enrollments.filter((row) => row.userId === userId);
  return rows
    .map(publicEnroll)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function enrollStrategy({ user, algo, channel, admins } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  if (!algo?.id) throw fail("Strategy not found.", 404);
  const pub = publicPayments(admins);
  if (!pub.ready) throw fail("Admin has not set a GPay / PhonePe mobile yet. Ask the desk to add it in Settings.");
  const wanted = channel === "phonepe" ? "phonepe" : "gpay";
  const catalog = catalogStrategy(algo, payments);
  const existing = enrollments.find(
    (row) => row.userId === user.id && row.strategyId === algo.id && (row.status === "paid" || row.status === "pending"),
  );
  if (existing?.status === "paid") {
    return { enrollment: publicEnroll(existing), payments: pub, links: null, already: true };
  }
  const row = existing || {
    id: `en${crypto.randomBytes(8).toString("hex")}`,
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
    strategyId: algo.id,
    strategyName: catalog.name,
    amount: catalog.enrollFee,
    channel: wanted,
    status: "pending",
    payeeMobile: pub.mobile,
    createdAt: new Date().toISOString(),
  };
  row.channel = wanted;
  row.amount = catalog.enrollFee;
  row.strategyName = catalog.name;
  row.payeeMobile = pub.mobile;
  if (!existing) enrollments.unshift(row);
  persistEnrollments();
  const links = buildUpiLinks({
    vpa: pub.upiId,
    payeeName: pub.payeeName,
    amount: row.amount,
    note: `T2S ${catalog.name}`.slice(0, 50),
  });
  return { enrollment: publicEnroll(row), payments: pub, links, already: false };
}

export function markEnrollmentPaid({ user, enrollmentId } = {}) {
  if (!user?.id) throw fail("Sign in first.", 401);
  const row = enrollments.find((item) => item.id === enrollmentId);
  if (!row) throw fail("Enrollment not found.", 404);
  if (row.userId !== user.id && user.role !== "admin") throw fail("Enrollment not found.", 404);
  row.status = "paid";
  row.paidAt = new Date().toISOString();
  persistEnrollments();
  return publicEnroll(row);
}
