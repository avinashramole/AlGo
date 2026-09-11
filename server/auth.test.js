import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-auth-"));
const usersFile = path.join(dir, "users.json");
const sessionsFile = path.join(dir, "sessions.json");
process.env.T2S_USERS_FILE = usersFile;
process.env.T2S_SESSIONS_FILE = sessionsFile;

const {
  adminEmailsFromEnv,
  decodeOAuthPayload,
  decodeOAuthState,
  encodeOAuthState,
  googleAuthorizeUrl,
  googleOAuthConfigured,
  googleRedirectUri,
  completeSignup,
  loginWithGoogleCode,
  loginWithPassword,
  listPublicUsers,
  requestOtp,
  resolveUserRole,
  safeFrontendOrigin,
  sessionUser,
  upsertGoogleUser,
  updateProfile,
  adminUpdateUser,
  verifyOtp,
} = await import("./auth.js");

test("resolveUserRole treats seed ids and admin emails as admin", () => {
  assert.equal(resolveUserRole({ id: "avinash", email: "x@y.com" }), "admin");
  assert.equal(resolveUserRole({ id: "segin" }), "admin");
  assert.equal(resolveUserRole({ id: "u1", email: "demo@t2s.app" }), "admin");
  assert.equal(resolveUserRole({ id: "u1", email: "friend@gmail.com" }), "user");
  assert.equal(
    resolveUserRole({ id: "u1", email: "boss@gmail.com" }, { ADMIN_EMAILS: "boss@gmail.com" }),
    "admin",
  );
  assert.equal(resolveUserRole({ id: "u1", email: "demo@t2s.app", role: "user" }), "user");
});

test("adminEmailsFromEnv always includes demo and the owner Gmail", () => {
  const set = adminEmailsFromEnv({ ADMIN_EMAILS: "extra@gmail.com" });
  assert.equal(set.has("demo@t2s.app"), true);
  assert.equal(set.has("avinash.ramole86@gmail.com"), true);
  assert.equal(set.has("extra@gmail.com"), true);
});

test("googleAuthorizeUrl requires client id and secret", () => {
  assert.throws(() => googleAuthorizeUrl({ env: {} }), /not configured/);
  const url = googleAuthorizeUrl({
    next: "http://localhost:5173",
    env: {
      GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "secret",
      GOOGLE_REDIRECT_URI: "http://localhost:4000/api/auth/google/callback",
    },
  });
  assert.match(url, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(url, /client_id=cid/);
  assert.match(url, /scope=openid/);
  assert.equal(new URL(url).searchParams.get("prompt"), null);
  const state = new URL(url).searchParams.get("state");
  assert.equal(decodeOAuthPayload(state).redirectUri, "http://localhost:4000/api/auth/google/callback");
});

test("googleOAuthConfigured and redirect URI", () => {
  assert.equal(googleOAuthConfigured({}), false);
  assert.equal(googleOAuthConfigured({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }), true);
  assert.equal(
    googleRedirectUri({ PUBLIC_URL: "https://trade2smart.com" }),
    "https://trade2smart.com/api/auth/google/callback",
  );
  assert.equal(
    googleRedirectUri(
      { GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" },
      { headers: { "x-forwarded-proto": "https", host: "trade2smart.com" } },
    ),
    "https://trade2smart.com/api/auth/google/callback",
  );
});

test("google redirect URI prefers env over request host", () => {
  const uri = googleRedirectUri(
    { GOOGLE_REDIRECT_URI: "https://trade2smart.com/api/auth/google/callback" },
    { headers: { host: "localhost:4000" }, protocol: "http" },
  );
  assert.equal(uri, "https://trade2smart.com/api/auth/google/callback");
});

test("google redirect URI uses https for the public site even without x-forwarded-proto", () => {
  const uri = googleRedirectUri({}, { headers: { host: "trade2smart.com" }, protocol: "http" });
  assert.equal(uri, "https://trade2smart.com/api/auth/google/callback");
  const viaHttpForward = googleRedirectUri(
    {},
    { headers: { host: "trade2smart.com", "x-forwarded-proto": "http" }, protocol: "http" },
  );
  assert.equal(viaHttpForward, "https://trade2smart.com/api/auth/google/callback");
});

test("google redirect URI canonicalizes www to the live site host", () => {
  const uri = googleRedirectUri({}, { headers: { host: "www.trade2smart.com" }, protocol: "http" });
  assert.equal(uri, "https://trade2smart.com/api/auth/google/callback");
});

test("OAuth state round-trips and blocks open redirects", () => {
  const state = encodeOAuthState("http://localhost:5173", { redirectUri: "http://localhost:4000/api/auth/google/callback" });
  assert.equal(decodeOAuthState(state), "http://localhost:5173");
  assert.equal(decodeOAuthPayload(state).redirectUri, "http://localhost:4000/api/auth/google/callback");
  assert.equal(safeFrontendOrigin("http://evil.example"), "http://localhost:5173");
  assert.equal(safeFrontendOrigin("http://localhost:5173"), "http://localhost:5173");
  assert.equal(safeFrontendOrigin("https://trade2smart.com"), "https://trade2smart.com");
});

test("upsertGoogleUser adds a member and keeps admin emails as admin", () => {
  const member = upsertGoogleUser({
    email: `member-${Date.now()}@gmail.com`,
    name: "Member One",
    googleId: "gid-member",
  });
  assert.equal(member.user.role, "user");
  assert.equal(member.user.authProvider, "google");
  assert.equal(member.user.name, "Member One");
  assert.match(member.token, /^t2s-/);

  const admin = upsertGoogleUser({
    email: "demo@t2s.app",
    name: "Avinash",
    googleId: "gid-admin",
  });
  assert.equal(admin.user.role, "admin");
  assert.equal(admin.user.id, "avinash");
});

test("upsertGoogleUser rejects non-Gmail accounts", () => {
  assert.throws(
    () => upsertGoogleUser({ email: "person@outlook.com", name: "Other", googleId: "gid-ms" }),
    /Gmail address/,
  );
});

test("loginWithGoogleCode surfaces redirect URI mismatch", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return {
        ok: false,
        json: async () => ({ error: "redirect_uri_mismatch", error_description: "Bad redirect" }),
      };
    }
    return { ok: false, json: async () => ({}) };
  };
  await assert.rejects(
    () =>
      loginWithGoogleCode({
        code: "auth-code",
        fetchImpl,
        env: {
          GOOGLE_CLIENT_ID: "cid",
          GOOGLE_CLIENT_SECRET: "sec",
          GOOGLE_REDIRECT_URI: "https://trade2smart.com/api/auth/google/callback",
        },
      }),
    /Authorized URI must be exactly https:\/\/trade2smart.com\/api\/auth\/google\/callback/,
  );
});

test("loginWithGoogleCode provisions a Gmail member from Google profile", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ access_token: "ya29.tok" }) };
    }
    return {
      ok: true,
      json: async () => ({
        email: `oauth-${Date.now()}@gmail.com`,
        email_verified: true,
        name: "OAuth Member",
        sub: "gid-oauth",
      }),
    };
  };
  const result = await loginWithGoogleCode({
    code: "auth-code",
    fetchImpl,
    env: {
      GOOGLE_CLIENT_ID: "cid",
      GOOGLE_CLIENT_SECRET: "sec",
      GOOGLE_REDIRECT_URI: "http://localhost:4000/api/auth/google/callback",
    },
  });
  assert.equal(result.user.role, "user");
  assert.equal(result.user.name, "OAuth Member");
  assert.equal(result.user.authProvider, "google");
  assert.match(result.token, /^t2s-/);
});

test("listPublicUsers includes registered Gmail members for admin", () => {
  const email = `listed-${Date.now()}@gmail.com`;
  upsertGoogleUser({ email, name: "Listed Member", googleId: "gid-listed" });
  const users = listPublicUsers();
  const member = users.find((row) => row.email === email);
  assert.equal(member?.name, "Listed Member");
  assert.equal(member?.role, "user");
  assert.equal(member?.registered, true);
  assert.equal(member?.authProvider, "google");
  assert.ok(users.some((row) => row.id === "avinash" && row.role === "admin"));
});

test("sign-in session is saved so a restart does not ask to sign in again", () => {
  const result = upsertGoogleUser({
    email: `session-${Date.now()}@gmail.com`,
    name: "Stay In",
    googleId: "gid-session",
  });
  const saved = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
  assert.equal(saved[result.token].userId, result.user.id);
  assert.equal(sessionUser(result.token).id, result.user.id);
});

test("login OTP for a member can be verified from the emailed code", async () => {
  process.env.T2S_SHOW_OTP = "1";
  const { user } = upsertGoogleUser({
    email: "otp.member@gmail.com",
    name: "OTP Member",
    googleId: "gid-otp-member",
  });
  const sent = await requestOtp({ identifier: user.email, purpose: "login", channel: "gmail" });
  assert.equal(sent.channel, "gmail");
  assert.equal(sent.purpose, "login");
  assert.match(String(sent.devOtp || ""), /^\d{6}$/);
  const session = verifyOtp({ identifier: user.email, otp: sent.devOtp, purpose: "login" });
  assert.equal(session.user.email, "otp.member@gmail.com");
  assert.equal(session.user.role, "user");
  assert.ok(session.token);
});

test("admin can sign in with password and with email OTP", async () => {
  process.env.T2S_SHOW_OTP = "1";
  const passwordSession = loginWithPassword("demo@t2s.app", "demo123");
  assert.equal(passwordSession.user.email, "demo@t2s.app");
  assert.equal(passwordSession.user.role, "admin");
  const sent = await requestOtp({ identifier: "demo@t2s.app", purpose: "login", channel: "gmail" });
  assert.match(String(sent.devOtp || ""), /^\d{6}$/);
  const otpSession = verifyOtp({ identifier: "demo@t2s.app", otp: sent.devOtp, purpose: "login" });
  assert.equal(otpSession.user.email, "demo@t2s.app");
  assert.equal(otpSession.user.role, "admin");
  assert.ok(otpSession.token);
});

test("member can sign in with password and with email OTP", async () => {
  process.env.T2S_SHOW_OTP = "1";
  const email = `otp.both.${Date.now()}@gmail.com`;
  const signup = await requestOtp({
    identifier: email,
    name: "Both Member",
    mobile: "9876501234",
    purpose: "signup",
    channel: "gmail",
  });
  assert.match(String(signup.devOtp || ""), /^\d{6}$/);
  const created = completeSignup({
    identifier: email,
    name: "Both Member",
    mobile: "9876501234",
    otp: signup.devOtp,
    password: "member123",
    channel: "gmail",
  });
  assert.equal(created.user.role, "user");
  assert.equal(created.user.mobile, "9876501234");
  const passwordSession = loginWithPassword(email, "member123");
  assert.equal(passwordSession.user.email, email);
  assert.equal(passwordSession.user.role, "user");
  const sent = await requestOtp({ identifier: email, purpose: "login", channel: "gmail" });
  const otpSession = verifyOtp({ identifier: email, otp: sent.devOtp, purpose: "login" });
  assert.equal(otpSession.user.email, email);
  assert.equal(otpSession.user.role, "user");
});

test("create account with user name, mobile, email, and password does not need OTP", () => {
  const email = `signup.pass.${Date.now()}@gmail.com`;
  const created = completeSignup({
    name: "Pass Member",
    email,
    mobile: "9876502222",
    password: "create123",
  });
  assert.equal(created.user.name, "Pass Member");
  assert.equal(created.user.email, email);
  assert.equal(created.user.mobile, "9876502222");
  assert.equal(created.user.role, "user");
  const session = loginWithPassword(email, "create123");
  assert.equal(session.user.id, created.user.id);
});

test("create account with email signup code and no password can log in by email OTP", async () => {
  process.env.T2S_SHOW_OTP = "1";
  const email = `signup.otp.${Date.now()}@gmail.com`;
  const sent = await requestOtp({
    identifier: email,
    name: "Otp Member",
    mobile: "9876503333",
    purpose: "signup",
    channel: "gmail",
  });
  const created = completeSignup({
    name: "Otp Member",
    email,
    mobile: "9876503333",
    otp: sent.devOtp,
  });
  assert.equal(created.user.email, email);
  assert.equal(created.user.hasPassword, false);
  assert.throws(() => loginWithPassword(email, "nope"), /password/);
  const login = await requestOtp({ identifier: email, purpose: "login", channel: "gmail" });
  const session = verifyOtp({ identifier: email, otp: login.devOtp, purpose: "login" });
  assert.equal(session.user.email, email);
});

test("create account requires a 10-digit mobile number", () => {
  const email = `signup.short.${Date.now()}@gmail.com`;
  assert.throws(
    () => completeSignup({ name: "Short Mob", email, mobile: "98765", password: "create123" }),
    /10 digits/,
  );
  assert.throws(
    () => completeSignup({ name: "No Mob", email, password: "create123" }),
    /10 digits/,
  );
});

test("create account rejects a duplicate mobile number", () => {
  completeSignup({
    name: "First Mobile",
    email: `signup.dup1.${Date.now()}@gmail.com`,
    mobile: "9876504444",
    password: "create123",
  });
  assert.throws(
    () =>
      completeSignup({
        name: "Second Mobile",
        email: `signup.dup2.${Date.now()}@gmail.com`,
        mobile: "9876504444",
        password: "create123",
      }),
    /mobile number already/,
  );
});

test("login OTP without Gmail connected does not leak the code", async () => {
  const previous = process.env.T2S_SHOW_OTP;
  process.env.T2S_SHOW_OTP = "";
  try {
    upsertGoogleUser({
      email: "otp.noleak@gmail.com",
      name: "No Leak",
      googleId: "gid-otp-noleak",
    });
    await assert.rejects(
      () => requestOtp({ identifier: "otp.noleak@gmail.com", purpose: "login", channel: "gmail" }),
      /Gmail connected/,
    );
  } finally {
    process.env.T2S_SHOW_OTP = previous;
  }
});

test("admin and member mobile numbers persist on the user record", () => {
  const session = loginWithPassword("demo@t2s.app", "demo123");
  const saved = updateProfile(session.token, {
    name: "Avinash",
    email: "demo@t2s.app",
    mobile: "9876500001",
  });
  assert.equal(saved.user.role, "admin");
  assert.equal(saved.user.mobile, "9876500001");
  const reloaded = listPublicUsers().find((row) => row.id === "avinash");
  assert.equal(reloaded.mobile, "9876500001");

  const member = completeSignup({
    name: "Mobile Member",
    email: `mobile.save.${Date.now()}@gmail.com`,
    mobile: "9876500002",
    password: "create123",
  });
  const next = adminUpdateUser(member.user.id, { mobile: "9876500003" });
  assert.equal(next.mobile, "9876500003");
  assert.equal(listPublicUsers().find((row) => row.id === member.user.id).mobile, "9876500003");
});
