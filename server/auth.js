import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "data", "users.json");
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 45_000;
const MAX_ATTEMPTS = 5;

const SEED_USERS = [
  {
    id: "avinash",
    name: "Avinash",
    email: "demo@t2s.app",
    desk: "Index Options",
    password: "demo123",
  },
  {
    id: "segin",
    name: "Segin",
    email: "",
    desk: "Index Options",
  },
];

const otps = new Map();
const sessions = new Map();

function now() {
  return Date.now();
}

function publicUser(user) {
  return { name: user.name, email: user.email, desk: user.desk || "Index Options" };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isGmail(email) {
  return /^[a-z0-9._%+-]+@gmail\.com$/.test(email) || /^[a-z0-9._%+-]+@googlemail\.com$/.test(email);
}

function loadUsers() {
  let stored = [];
  try {
    stored = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    if (!Array.isArray(stored)) stored = [];
  } catch {
    stored = [];
  }
  const byId = new Map(SEED_USERS.map((row) => [row.id, { ...row }]));
  const byEmail = new Map();
  for (const row of stored) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim();
    const email = normalizeEmail(row.email);
    const next = {
      id: id || `u${crypto.randomBytes(6).toString("hex")}`,
      name: String(row.name || "").trim() || "Trader",
      email,
      desk: String(row.desk || "Index Options"),
      password: row.password ? String(row.password) : undefined,
    };
    if (id && byId.has(id)) {
      const seed = byId.get(id);
      byId.set(id, { ...seed, ...next, password: seed.password || next.password, email: next.email || seed.email });
    } else {
      byId.set(next.id, next);
    }
  }
  const users = [...byId.values()];
  for (const user of users) {
    if (user.email) byEmail.set(user.email, user);
  }
  const seginGmail = normalizeEmail(process.env.SEGIN_GMAIL || process.env.SEGIN_EMAIL || "");
  if (seginGmail && isGmail(seginGmail)) {
    const segin = users.find((row) => row.id === "segin") || { id: "segin", name: "Segin", desk: "Index Options" };
    segin.email = segin.email || seginGmail;
    segin.name = segin.name || "Segin";
    if (!users.includes(segin)) users.push(segin);
    byEmail.set(segin.email, segin);
  }
  return { users, byEmail };
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const payload = users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    desk: row.desk,
    ...(row.password ? { password: row.password } : {}),
  }));
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

let store = loadUsers();

function findUserByEmail(email) {
  return store.byEmail.get(normalizeEmail(email)) || null;
}

function issueSession(user) {
  const token = `t2s-${crypto.randomBytes(18).toString("hex")}`;
  sessions.set(token, { email: user.email, at: now() });
  return { token, user: publicUser(user) };
}

function gmailTransport() {
  const user = String(process.env.GMAIL_USER || "").trim();
  const pass = String(process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function maskEmail(email) {
  const [local, domain] = String(email).split("@");
  if (!domain) return email;
  const keep = local.slice(0, 2);
  return `${keep}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

async function sendOtpMail(email, code, name) {
  const transport = gmailTransport();
  if (!transport) {
    return { delivered: false, reason: "gmail-not-configured" };
  }
  const from = process.env.GMAIL_USER;
  await transport.sendMail({
    from: `T2S Algo <${from}>`,
    to: email,
    subject: `${code} is your T2S login code`,
    text: `Hi ${name || "there"},\n\nYour T2S Algo login code is ${code}.\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this email.\n`,
    html: `<p>Hi ${name || "there"},</p><p>Your T2S Algo login code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  return { delivered: true };
}

export function loginWithPassword(email, password) {
  const key = normalizeEmail(email);
  const user =
    findUserByEmail(key) ||
    (key === "demo" ? findUserByEmail("demo@t2s.app") : null);
  if (!user?.password || String(password) !== String(user.password)) {
    const error = new Error("Wrong email or password. New users: use Gmail OTP.");
    error.status = 401;
    throw error;
  }
  return issueSession(user);
}

export async function requestOtp({ email, name } = {}) {
  const key = normalizeEmail(email);
  if (!isGmail(key)) {
    const error = new Error("Use a Gmail address (you@gmail.com).");
    error.status = 400;
    throw error;
  }
  const existing = findUserByEmail(key);
  const displayName = String(name || existing?.name || "").trim();
  if (!existing && displayName.length < 2) {
    const error = new Error("New user — enter a name (for example Segin), then send the code.");
    error.status = 400;
    error.needName = true;
    throw error;
  }
  const prev = otps.get(key);
  if (prev && now() - prev.sentAt < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now() - prev.sentAt)) / 1000);
    const error = new Error(`Wait ${wait}s before requesting another code.`);
    error.status = 429;
    throw error;
  }
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(key, {
    code,
    name: displayName || existing?.name || "Segin",
    expiresAt: now() + OTP_TTL_MS,
    sentAt: now(),
    attempts: 0,
    newUser: !existing,
  });
  let delivered = false;
  try {
    const sent = await sendOtpMail(key, code, displayName || existing?.name);
    delivered = sent.delivered;
  } catch (err) {
    const error = new Error(err.message || "Gmail could not send the code. Check GMAIL_USER and App Password.");
    error.status = 400;
    throw error;
  }
  const showCode = !delivered;
  if (showCode) {
    console.log(`T2S OTP for ${key}: ${code} (set GMAIL_USER + GMAIL_APP_PASSWORD to email it)`);
  }
  return {
    ok: true,
    sent: delivered,
    newUser: !existing,
    to: maskEmail(key),
    hint: delivered
      ? `Code sent to ${maskEmail(key)}. Check the Gmail inbox.`
      : "Gmail SMTP is not set. Use the on-screen code, or add GMAIL_USER and GMAIL_APP_PASSWORD in .env.",
    devOtp: showCode ? code : undefined,
  };
}

export function verifyOtp({ email, otp } = {}) {
  const key = normalizeEmail(email);
  const row = otps.get(key);
  if (!row) {
    const error = new Error("No code for that Gmail. Send a new one.");
    error.status = 400;
    throw error;
  }
  row.attempts += 1;
  if (row.attempts > MAX_ATTEMPTS || now() > row.expiresAt) {
    otps.delete(key);
    const error = new Error("Code expired. Send a new one.");
    error.status = 400;
    throw error;
  }
  if (String(otp || "").trim() !== row.code) {
    const error = new Error("Wrong code. Check the Gmail email and try again.");
    error.status = 401;
    throw error;
  }
  otps.delete(key);
  let user = findUserByEmail(key);
  if (!user) {
    const pendingSegin = store.users.find((item) => item.id === "segin" && !item.email);
    const namedSegin = String(row.name).trim().toLowerCase() === "segin" && pendingSegin;
    user = namedSegin
      ? pendingSegin
      : {
          id: `u${crypto.randomBytes(6).toString("hex")}`,
          name: row.name || "Trader",
          email: key,
          desk: "Index Options",
        };
    user.name = row.name || user.name || "Trader";
    user.email = key;
    user.desk = user.desk || "Index Options";
    if (!store.users.includes(user)) store.users.push(user);
    store.byEmail.set(key, user);
    saveUsers(store.users);
  }
  return issueSession(user);
}

export function sessionUser(token) {
  const row = sessions.get(String(token || ""));
  if (!row) return null;
  return publicUser(findUserByEmail(row.email) || { name: "Trader", email: row.email, desk: "Index Options" });
}
