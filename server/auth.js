import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = process.env.T2S_USERS_FILE || path.join(__dirname, "data", "users.json");
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
    role: "admin",
  },
  {
    id: "segin",
    name: "Segin",
    email: "",
    mobile: "",
    desk: "Index Options",
    role: "admin",
  },
];

const DEFAULT_ADMIN_EMAILS = ["demo@t2s.app", "avinash.ramole86@gmail.com"];

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

function emailDomain(email) {
  const value = normalizeEmail(email);
  const at = value.lastIndexOf("@");
  if (at < 1) return "";
  return value.slice(at + 1);
}

function isGmail(email) {
  const domain = emailDomain(email);
  return domain === "gmail.com" || domain === "googlemail.com";
}

function isMicrosoft(email) {
  const domain = emailDomain(email);
  return ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.in"].includes(domain);
}

function isApple(email) {
  const domain = emailDomain(email);
  return ["icloud.com", "me.com", "mac.com"].includes(domain);
}

function assertEmailForProvider(email, provider) {
  if (provider === "microsoft") {
    if (!isMicrosoft(email)) throw fail("Use your Microsoft email (Outlook / Hotmail / Live).");
    return;
  }
  if (provider === "apple") {
    if (!isApple(email)) throw fail("Use your Apple ID email (iCloud).");
    return;
  }
  if (!isGmail(email)) throw fail("Use a Gmail address (you@gmail.com).");
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

export function adminEmailsFromEnv(env = process.env) {
  const extra = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...extra]);
}

export function resolveUserRole(user, env = process.env) {
  if (!user) return "user";
  if (user.id === "avinash" || user.id === "segin") return "admin";
  if (user.role === "admin" || user.role === "user") return user.role;
  if (user.email && adminEmailsFromEnv(env).has(normalizeEmail(user.email))) return "admin";
  return "user";
}

function isRegisteredUser(user) {
  if (!user) return false;
  if (user.id === "avinash" || user.id === "segin") return false;
  return Boolean(user.email || user.mobile || user.googleId);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    mobile: user.mobile || "",
    desk: user.desk || "Index Options",
    role: resolveUserRole(user),
    authProvider: user.authProvider || (user.googleId ? "google" : user.password ? "password" : ""),
    createdAt: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || "",
    registered: isRegisteredUser(user),
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
      role: row.role === "admin" ? "admin" : row.role === "user" ? "user" : undefined,
      googleId: row.googleId ? String(row.googleId) : undefined,
      authProvider: row.authProvider ? String(row.authProvider) : undefined,
      createdAt: row.createdAt ? String(row.createdAt) : undefined,
      lastLoginAt: row.lastLoginAt ? String(row.lastLoginAt) : undefined,
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
    role: resolveUserRole(row),
    ...(row.googleId ? { googleId: row.googleId } : {}),
    ...(row.authProvider ? { authProvider: row.authProvider } : {}),
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    ...(row.lastLoginAt ? { lastLoginAt: row.lastLoginAt } : {}),
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
  const at = new Date().toISOString();
  user.lastLoginAt = at;
  user.createdAt = user.createdAt || at;
  persist();
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

export async function requestOtp({ email, mobile, identifier, name, channel, purpose, provider } = {}) {
  const wanted = channel === "mobile" || isMobile(identifier || mobile) ? "mobile" : "gmail";
  const target = wanted === "mobile" ? normalizeMobile(identifier || mobile || email) : normalizeEmail(identifier || email);
  const intent = purpose === "signup" ? "signup" : purpose === "reset" ? "reset" : "login";
  if (provider && wanted === "mobile") {
    throw fail("Enter the email for Google, Microsoft, or Apple — not a mobile number.");
  }
  if (wanted === "gmail") {
    if (provider) assertEmailForProvider(target, provider);
    else if (intent === "signup" && !isGmail(target)) {
      throw fail("Use a Gmail address (you@gmail.com), or continue with Microsoft / Apple.");
    } else if (!target.includes("@")) {
      throw fail("Enter a valid email.");
    }
  }
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
    throw fail("No account for that email / mobile. Sign up first.");
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
  const intent = purpose === "signup" ? "signup" : purpose === "reset" ? "reset" : "login";
  consumeOtp(channel, target, otp, intent);
  if (intent === "signup") {
    return { ok: true, verified: true, channel, identifier: channel === "mobile" ? normalizeMobile(target) : normalizeEmail(target) };
  }
  if (intent === "reset") {
    return { ok: true, verified: true, channel, identifier: channel === "mobile" ? normalizeMobile(target) : normalizeEmail(target) };
  }
  const user = findUser(target);
  if (!user) throw fail("No account for that email / mobile. Sign up first.");
  return issueSession(user);
}

export function resetPassword({ email, mobile, identifier, otp, password } = {}) {
  const target = identifier || email || mobile;
  const channel = isMobile(target) ? "mobile" : "gmail";
  if (String(password || "").length < 6) throw fail("Password must be at least 6 characters.");
  consumeOtp(channel, target, otp, "reset");
  const user = findUser(target);
  if (!user) throw fail("No account for that email / mobile. Sign up first.");
  user.password = hashPassword(password);
  persist();
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
  user.createdAt = user.createdAt || new Date().toISOString();
  user.authProvider = user.authProvider || "password";
  if (wanted === "gmail") user.email = target;
  else user.mobile = target;
  if (!user.role) user.role = resolveUserRole(user);
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

export function updateProfile(sessionToken, { name, email, mobile } = {}) {
  const user = userFromToken(sessionToken);
  if (!user) throw fail("Sign in first.", 401);
  const nextName = String(name ?? user.name ?? "").trim();
  if (nextName.length < 2) throw fail("Enter your name.");
  const nextEmail = normalizeEmail(email ?? user.email);
  const nextMobile = normalizeMobile(mobile ?? user.mobile);
  if (nextEmail && !isGmail(nextEmail) && !nextEmail.endsWith("@t2s.app")) {
    throw fail("Use a Gmail address, or leave email blank.");
  }
  if (nextMobile && !isMobile(nextMobile)) throw fail("Enter a 10-digit Indian mobile number, or leave it blank.");
  if (nextEmail) {
    const taken = store.byEmail.get(nextEmail);
    if (taken && taken.id !== user.id) throw fail("That Gmail is already on another account.");
  }
  if (nextMobile) {
    const taken = store.byMobile.get(nextMobile);
    if (taken && taken.id !== user.id) throw fail("That mobile is already on another account.");
  }
  user.name = nextName;
  user.email = nextEmail;
  user.mobile = nextMobile;
  persist();
  return { ok: true, user: publicUser(user) };
}

export function listPublicUsers() {
  store = loadUsers();
  return store.users
    .map((row) => publicUser(row))
    .sort((a, b) => {
      if (Boolean(a.registered) !== Boolean(b.registered)) return a.registered ? -1 : 1;
      const byLogin = String(b.lastLoginAt || b.createdAt || "").localeCompare(String(a.lastLoginAt || a.createdAt || ""));
      if (byLogin) return byLogin;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

export function googleOAuthConfigured(env = process.env) {
  return Boolean(String(env.GOOGLE_CLIENT_ID || "").trim() && String(env.GOOGLE_CLIENT_SECRET || "").trim());
}

export function googleRedirectUri(env = process.env, req) {
  const explicit = String(env.GOOGLE_REDIRECT_URI || "").trim();
  if (explicit) return explicit;
  if (req) {
    const proto = String(req.headers?.["x-forwarded-proto"] || req.protocol || "http")
      .split(",")[0]
      .trim();
    const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "")
      .split(",")[0]
      .trim();
    if (host) return `${proto === "https" ? "https" : "http"}://${host}/api/auth/google/callback`;
  }
  const publicUrl = String(env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");
  return `${publicUrl}/api/auth/google/callback`;
}

export function encodeOAuthState(next, extra = {}) {
  return Buffer.from(JSON.stringify({ next: String(next || ""), ...extra })).toString("base64url");
}

export function decodeOAuthPayload(state) {
  try {
    const row = JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8"));
    return row && typeof row === "object" ? row : {};
  } catch {
    return {};
  }
}

export function decodeOAuthState(state) {
  return String(decodeOAuthPayload(state).next || "");
}

export function safeFrontendOrigin(next, env = process.env) {
  const publicUrl = String(env.PUBLIC_URL || "").replace(/\/$/, "");
  const fallback = publicUrl || "http://localhost:5173";
  try {
    const url = new URL(String(next || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
    if (url.hostname === "trade2smart.com" || url.hostname.endsWith(".trade2smart.com")) return url.origin;
    if (publicUrl) {
      const allowed = new URL(publicUrl);
      if (url.hostname === allowed.hostname) return url.origin;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function googleAuthorizeUrl({ next, env = process.env, req } = {}) {
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId || !String(env.GOOGLE_CLIENT_SECRET || "").trim()) {
    throw fail("Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", 503);
  }
  const redirectUri = googleRedirectUri(env, req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: encodeOAuthState(next, { redirectUri }),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function upsertGoogleUser({ email, name, googleId, env = process.env } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) throw fail("Google did not return an email.", 401);
  if (!isGmail(normalized) && !adminEmailsFromEnv(env).has(normalized)) {
    throw fail("Use a Gmail address to continue with Google.", 401);
  }
  let user = store.byEmail.get(normalized);
  if (!user) {
    user = {
      id: `u${crypto.randomBytes(6).toString("hex")}`,
      name: String(name || "").trim() || normalized.split("@")[0],
      email: normalized,
      mobile: "",
      desk: "Index Options",
      googleId: googleId ? String(googleId) : undefined,
      authProvider: "google",
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
  } else {
    if (googleId) user.googleId = user.googleId || String(googleId);
    user.authProvider = user.authProvider || "google";
    user.createdAt = user.createdAt || new Date().toISOString();
    const nextName = String(name || "").trim();
    if (nextName && (!user.name || user.name === "Trader")) user.name = nextName;
  }
  user.email = normalized;
  if (!user.role) user.role = resolveUserRole(user, env);
  persist();
  return issueSession(user);
}

export async function loginWithGoogleCode({ code, fetchImpl = fetch, env = process.env, redirectUri } = {}) {
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirect = String(redirectUri || googleRedirectUri(env)).trim();
  if (!clientId || !clientSecret) {
    throw fail("Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", 503);
  }
  if (!String(code || "").trim()) throw fail("Google login was cancelled.", 401);
  const tokenRes = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw fail(tokenJson.error_description || "Google login failed. Try again.", 401);
  }
  const userRes = await fetchImpl("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json" },
  });
  const profile = await userRes.json().catch(() => ({}));
  if (!userRes.ok || !profile.email) {
    throw fail("Google did not return an email. Allow email access and try again.", 401);
  }
  if (profile.email_verified === false) {
    throw fail("Verify your Gmail address with Google first.", 401);
  }
  return upsertGoogleUser({
    email: profile.email,
    name: profile.name,
    googleId: profile.sub,
    env,
  });
}
