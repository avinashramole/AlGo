import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const usersFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "t2s-auth-")), "users.json");
process.env.T2S_USERS_FILE = usersFile;

const {
  adminEmailsFromEnv,
  decodeOAuthPayload,
  decodeOAuthState,
  encodeOAuthState,
  googleAuthorizeUrl,
  googleOAuthConfigured,
  googleRedirectUri,
  loginWithGoogleCode,
  listPublicUsers,
  resolveUserRole,
  safeFrontendOrigin,
  upsertGoogleUser,
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
