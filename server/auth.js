import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, "data", "users.json");
const GMAIL_FILE = path.join(__dirname, "data", "gmail.json");
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_MS = 45_000;
const MAX_ATTEMPTS = 5;

const SEED_USERS = [
  {
    id: "avinash",
    name: "Avinash",
    email: "demo@t2s.app",
    mobile: "",
    desk: "Index Options",
    password: "demo123",
  },
  {
    id: "segin",
    name: "Segin",
    email: "",
    mobile: "",
    desk: "Index Options",
  },
];

const otps = new Map();
const sessions = new Map();

function now() {
  return Date.now();
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isGmail(email) {
  return /^[a-z0-9._%+-]+@gmail\.com$/.test(email) || /^[a-z0-9._%+-]+@googlemail\.com$/.test(email);
}

export function normalizeMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function isMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value));
}

function maskEmail(email) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return email;
  const keep = local.slice(0, 2);
  return `${keep}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function maskMobile(mobile) {
  const digits = normalizeMobile(mobile);
  if (digits.length !== 10) return mobile;
  return `${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(12).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function checkPassword(password, stored) {
  if (!stored || !password) return false;
  if (!String(stored).startsWith("scrypt:")) return String(stored) === String(password);
  const [, salt, hash] = String(stored).split(":");
  const next = crypto.scryptSync(String(password), salt, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), next);
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    mobile: user.mobile || "",
    desk: user.desk || "Index Options",
    hasPassword: Boolean(user.password),
    thumbEnabled: Boolean(user.thumbHash),
  };
}

function rebuildIndexes(users) {
  const byEmail = new Map();
  const byMobile = new Map();
  const byId = new Map();
  for (const user of users) {
    byId.set(user.id, user);
    if (user.email) byEmail.set(user.email, user);
    if (user.mobile) byMobile.set(user.mobile, user);
  }
  return { users, byEmail, byMobile, byId };
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
  for (const row of stored) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim() || `u${crypto.randomBytes(6).toString("hex")}`;
    const next = {
      id,
      name: String(row.name || "").trim() || "Trader",
      email: normalizeEmail(row.email),
      mobile: normalizeMobile(row.mobile),
      desk: String(row.desk || "Index Options"),
      password: row.password ? String(row.password) : undefined,
      thumbHash: row.thumbHash ? String(row.thumbHash) : undefined,
    };
    const seed = byId.get(id);
    byId.set(id, seed ? { ...seed, ...next, password: next.password || seed.password } : next);
  }
  const users = [...byId.values()];
  const seginGmail = normalizeEmail(process.env.SEGIN_GMAIL || process.env.SEGIN_EMAIL || "");
  if (seginGmail && isGmail(seginGmail)) {
    const segin = users.find((row) => row.id === "segin") || { id: "segin", name: "Segin", desk: "Index Options" };
    segin.email = segin.email || seginGmail;
    segin.name = segin.name || "Segin";
    if (!users.includes(segin)) users.push(segin);
  }
  return rebuildIndexes(users);
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const payload = users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email || "",
    mobile: row.mobile || "",
    desk: row.desk,
    ...(row.password ? { password: row.password } : {}),
    ...(row.thumbHash ? { thumbHash: row.thumbHash } : {}),
  }));
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

let store = loadUsers();

function persist() {
  saveUsers(store.users);
  store = rebuildIndexes(store.users);
}

export function findUser(identifier) {
  const raw = String(identifier || "").trim();
  const email = normalizeEmail(raw);
  const mobile = normalizeMobile(raw);
  if (email === "demo") return store.byEmail.get("demo@t2s.app") || null;
  if (isGmail(email) || email.includes("@")) return store.byEmail.get(email) || null;
  if (isMobile(mobile)) return store.byMobile.get(mobile) || null;
  return store.byEmail.get(email) || null;
}

function issueSession(user) {
  const token = `t2s-${crypto.randomBytes(18).toString("hex")}`;
  sessions.set(token, { userId: user.id, email: user.email, mobile: user.mobile, at: now() });
  return { token, user: publicUser(user) };
}

function userFromToken(token) {
  const row = sessions.get(String(token || ""));
  if (!row) return null;
  return store.byId.get(row.userId) || findUser(row.email || row.mobile);
}

function loadGmailCreds() {
  try {
    const row = JSON.parse(fs.readFileSync(GMAIL_FILE, "utf8"));
    const user = normalizeEmail(row.user || row.email);
    const pass = String(row.pass || row.appPassword || "").replace(/\s+/g, "");
    if (user && pass) return { user, pass };
  } catch {
    /* env */
  }
  return {
    user: normalizeEmail(process.env.GMAIL_USER || ""),
    pass: String(process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || "").replace(/\s+/g, ""),
  };
}

let gmailCreds = loadGmailCreds();

function gmailReady() {
  return Boolean(gmailCreds.user && gmailCreds.pass);
}

function gmailTransport() {
  if (!gmailReady()) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailCreds.user, pass: gmailCreds.pass },
  });
}

export function gmailStatus() {
  return {
    connected: gmailReady(),
    user: gmailCreds.user ? maskEmail(gmailCreds.user) : "",
  };
}

export async function connectGmail({ email, appPassword } = {}) {
  const user = normalizeEmail(email);
  const pass = String(appPassword || "").replace(/\s+/g, "");
  if (!isGmail(user)) throw fail("Desk mail must be a Gmail address (you@gmail.com).");
  if (pass.length < 8) throw fail("Paste the 16-character Gmail App Password (Google Account → Security → App passwords).");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  try {
    await transport.verify();
  } catch (err) {
    throw fail(`Gmail refused the mailbox (${err.response || err.message || "auth failed"}). Use an App Password, not your normal Gmail password.`);
  }
  gmailCreds = { user, pass };
  fs.mkdirSync(path.dirname(GMAIL_FILE), { recursive: true });
  fs.writeFileSync(GMAIL_FILE, `${JSON.stringify({ user, pass }, null, 2)}\n`);
  return gmailStatus();
}

async function sendMail({ to, subject, text, html }) {
  const transport = gmailTransport();
  if (!transport) return { delivered: false, reason: "gmail-not-configured" };
  await transport.sendMail({ from: `T2S Algo <${gmailCreds.user}>`, to, subject, text, html });
  return { delivered: true };
}

async function sendOtpMail(email, code, name) {
  return sendMail({
    to: email,
    subject: `${code} is your T2S login code`,
    text: `Hi ${name || "there"},\n\nYour T2S Algo login code is ${code}.\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this email.\n`,
    html: `<p>Hi ${name || "there"},</p><p>Your T2S Algo login code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 10 minutes. Check Inbox and Spam.</p>`,
  });
}

async function sendSms(mobile, code) {
  const key = String(process.env.FAST2SMS_API_KEY || process.env.SMS_API_KEY || "").trim();
  if (!key) return { delivered: false, reason: "sms-not-configured" };
  const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(key)}&route=q&message=${encodeURIComponent(`T2S code ${code}. Valid 10 min.`)}&language=english&flash=0&numbers=${mobile}`;
  const response = await fetch(url);
  if (!response.ok) throw fail("SMS gateway failed. Check FAST2SMS_API_KEY.");
  return { delivered: true };
}

export async function notifyLogin(user) {
  const email = normalizeEmail(user?.email);
  if (!isGmail(email) || !gmailReady()) return { delivered: false };
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  try {
    return await sendMail({
      to: email,
      subject: `T2S login · ${user.name || "desk"}`,
      text: `Hi ${user.name || "there"},\n\nYou signed in to T2S Algo Desk at ${when} IST.\nAccount: ${email}${user.mobile ? ` / ${user.mobile}` : ""}\n\nIf this was not you, change your password.\n`,
      html: `<p>Hi ${user.name || "there"},</p><p>You signed in to <strong>T2S Algo Desk</strong> at <strong>${when} IST</strong>.</p><p>Account: ${email}${user.mobile ? ` · ${user.mobile}` : ""}</p>`,
    });
  } catch (err) {
    console.log(`Login mail failed: ${err.message || err}`);
    return { delivered: false, error: err.message };
  }
}

function otpKey(channel, identifier) {
  return `${channel}:${channel === "mobile" ? normalizeMobile(identifier) : normalizeEmail(identifier)}`;
}

function consumeOtp(channel, identifier, otp, purpose) {
  const key = otpKey(channel, identifier);
  const row = otps.get(key);
  if (!row) throw fail("No code for that Gmail / mobile. Send a new one.");
  row.attempts += 1;
  if (row.attempts > MAX_ATTEMPTS || now() > row.expiresAt) {
    otps.delete(key);
    throw fail("Code expired. Send a new one.");
  }
  if (String(otp || "").trim() !== row.code) throw fail("Wrong code. Try again.", 401);
  if (purpose && row.purpose !== purpose) throw fail("Send a new code for this step.");
  otps.delete(key);
  return row;
}

export function loginWithPassword(identifier, password) {
  const user = findUser(identifier || "");
  if (!user?.password || !checkPassword(password, user.password)) {
    throw fail("Wrong Gmail / mobile or password. New users: Sign up first.", 401);
  }
  return issueSession(user);
}

export async function requestOtp({ email, mobile, identifier, name, channel, purpose } = {}) {
  const wanted = channel === "mobile" || isMobile(identifier || mobile) ? "mobile" : "gmail";
  const target = wanted === "mobile" ? normalizeMobile(identifier || mobile || email) : normalizeEmail(identifier || email);
  const intent = purpose === "signup" ? "signup" : "login";
  if (wanted === "gmail" && !isGmail(target)) throw fail("Use a Gmail address (you@gmail.com).");
  if (wanted === "mobile" && !isMobile(target)) throw fail("Enter a 10-digit Indian mobile number.");
  const existing = findUser(target);
  const displayName = String(name || existing?.name || "").trim();
  if (intent === "signup") {
    if (!displayName || displayName.length < 2) {
      const error = fail("Enter your name, then send the code.");
      error.needName = true;
      throw error;
    }
    if (existing?.password) throw fail("That Gmail / mobile already has an account. Sign in instead.");
  } else if (!existing) {
    throw fail("No account for that Gmail / mobile. Sign up first.");
  }
  const key = otpKey(wanted, target);
  const prev = otps.get(key);
  if (prev && now() - prev.sentAt < RESEND_MS) {
    throw fail(`Wait ${Math.ceil((RESEND_MS - (now() - prev.sentAt)) / 1000)}s before requesting another code.`, 429);
  }
  const code = String(crypto.randomInt(100000, 1000000));
  otps.set(key, {
    code,
    name: displayName || existing?.name || "Segin",
    channel: wanted,
    identifier: target,
    purpose: intent,
    expiresAt: now() + OTP_TTL_MS,
    sentAt: now(),
    attempts: 0,
  });
  let delivered = false;
  try {
    if (wanted === "gmail") {
      delivered = (await sendOtpMail(target, code, displayName || existing?.name)).delivered;
    } else {
      delivered = (await sendSms(target, code)).delivered;
    }
  } catch (err) {
    throw fail(err.message || "Could not send the code.");
  }
  const showCode = !delivered;
  const to = wanted === "gmail" ? maskEmail(target) : maskMobile(target);
  if (showCode) console.log(`T2S OTP (${wanted} ${intent}) ${target}: ${code}`);
  return {
    ok: true,
    sent: delivered,
    channel: wanted,
    purpose: intent,
    newUser: !existing,
    to,
    hint: delivered
      ? wanted === "gmail"
        ? `Code sent to ${to}. Check Inbox and Spam.`
        : `Code sent by SMS to ${to}.`
      : wanted === "gmail"
        ? "Gmail is not connected, so the code was not emailed. Connect Gmail, or use the on-screen code."
        : "SMS is not connected, so the code was not texted. Add FAST2SMS_API_KEY, or use the on-screen code.",
    devOtp: showCode ? code : undefined,
    gmail: gmailStatus(),
  };
}

export function verifyOtp({ email, mobile, identifier, otp, purpose } = {}) {
  const target = identifier || email || mobile;
  const channel = isMobile(target) ? "mobile" : "gmail";
  const intent = purpose === "signup" ? "signup" : "login";
  consumeOtp(channel, target, otp, intent);
  if (intent === "signup") {
    return { ok: true, verified: true, channel, identifier: channel === "mobile" ? normalizeMobile(target) : normalizeEmail(target) };
  }
  const user = findUser(target);
  if (!user) throw fail("No account for that Gmail / mobile. Sign up first.");
  return issueSession(user);
}

export function completeSignup({ name, email, mobile, identifier, otp, password, channel } = {}) {
  const wanted = channel === "mobile" || isMobile(identifier || mobile) ? "mobile" : "gmail";
  const target = wanted === "mobile" ? normalizeMobile(identifier || mobile || email) : normalizeEmail(identifier || email);
  const displayName = String(name || "").trim();
  if (displayName.length < 2) throw fail("Enter a name.");
  if (String(password || "").length < 6) throw fail("Password must be at least 6 characters.");
  consumeOtp(wanted, target, otp, "signup");
  let user = findUser(target);
  if (user?.password) throw fail("That Gmail / mobile already has an account. Sign in instead.");
  if (!user) {
    const pendingSegin = displayName.toLowerCase() === "segin" ? store.users.find((row) => row.id === "segin") : null;
    user = pendingSegin || {
      id: `u${crypto.randomBytes(6).toString("hex")}`,
      name: displayName,
      email: "",
      mobile: "",
      desk: "Index Options",
    };
    if (!store.users.includes(user)) store.users.push(user);
  }
  user.name = displayName;
  user.desk = user.desk || "Index Options";
  user.password = hashPassword(password);
  if (wanted === "gmail") user.email = target;
  else user.mobile = target;
  persist();
  return issueSession(user);
}

export function enableThumb(sessionToken) {
  const user = userFromToken(sessionToken);
  if (!user) throw fail("Sign in first, then enable thumb.", 401);
  const raw = `thumb-${crypto.randomBytes(24).toString("hex")}`;
  user.thumbHash = hashPassword(raw);
  persist();
  return { ok: true, thumbToken: raw, user: publicUser(user) };
}

export function loginWithThumb(thumbToken) {
  const token = String(thumbToken || "");
  if (!token.startsWith("thumb-")) throw fail("Thumb is not set on this device. Sign in with password or OTP first, then enable thumb.", 401);
  const user = store.users.find((row) => row.thumbHash && checkPassword(token, row.thumbHash));
  if (!user) throw fail("Thumb login expired. Sign in with password or OTP, then enable thumb again.", 401);
  return issueSession(user);
}

export function sessionUser(token) {
  const user = userFromToken(token);
  return user ? publicUser(user) : null;
}
