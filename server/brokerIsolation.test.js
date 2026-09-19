import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-broker-isolation-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const {
  adminLiveOrderPayload,
  annotateMemberLiveAuthError,
  credentialHint,
  dhanOrderCredentials,
  dhanSendOptions,
  isMemberScopedOrder,
  liveOrderSession,
} = await import("./brokerIsolation.js");
const { sendMemberCopyOrder } = await import("./liveCopySend.js");

const adminDesk = { accessToken: "admin-dhan-token", clientId: "1000561739" };
const adminZerodha = { accessToken: "admin-kite-token", apiKey: "admin-kite-key", clientId: "AB1234" };

test("admin orders are not member-scoped and keep the desk Dhan token", () => {
  assert.equal(isMemberScopedOrder({ brokerId: "dhan", side: "BUY" }), false);
  const creds = dhanOrderCredentials({ brokerId: "dhan", side: "BUY" }, adminDesk);
  assert.equal(creds.lane, "admin");
  assert.equal(creds.token, "admin-dhan-token");
  assert.equal(creds.clientId, "1000561739");
  assert.equal(creds.account, null);
});

test("member Dhan copy never falls back to the admin desk token", () => {
  assert.equal(isMemberScopedOrder({ copyUserId: "u-1" }), true);
  assert.throws(
    () => dhanOrderCredentials({ copyUserId: "u-1" }, adminDesk),
    /My plan/,
  );
  assert.throws(
    () =>
      dhanOrderCredentials(
        { copyUserId: "u-1", account: { clientId: "1100333", accessToken: "" } },
        adminDesk,
      ),
    /My plan/,
  );
  assert.throws(
    () =>
      dhanOrderCredentials(
        { account: { clientId: "1100333" } },
        adminDesk,
      ),
    /My plan/,
  );
});

test("member Dhan copy uses only the member client ID and token", () => {
  const creds = dhanOrderCredentials(
    {
      copyUserId: "u-1",
      account: { clientId: "1100333", accessToken: "member-dhan-token" },
    },
    adminDesk,
  );
  assert.equal(creds.lane, "member");
  assert.equal(creds.token, "member-dhan-token");
  assert.equal(creds.clientId, "1100333");
  assert.notEqual(creds.token, adminDesk.accessToken);
});

test("admin live payload strips leftover member credential fields", () => {
  const cleaned = adminLiveOrderPayload({
    brokerId: "dhan",
    side: "BUY",
    copyUserId: "u-leak",
    account: { accessToken: "member-dhan-token", clientId: "1100333" },
    brokerSession: { accessToken: "member-kite-token" },
    qty: 65,
  });
  assert.equal(cleaned.brokerId, "dhan");
  assert.equal(cleaned.qty, 65);
  assert.equal(cleaned.copyUserId, undefined);
  assert.equal(cleaned.account, undefined);
  assert.equal(cleaned.brokerSession, undefined);
  const creds = dhanOrderCredentials(cleaned, adminDesk);
  assert.equal(creds.lane, "admin");
  assert.equal(creds.token, "admin-dhan-token");
});

test("member live broker copy never falls back to the admin session", () => {
  assert.throws(
    () => liveOrderSession({ copyUserId: "u-1" }, adminZerodha, { brokerName: "Zerodha Kite" }),
    /My plan/,
  );
  assert.throws(
    () =>
      liveOrderSession(
        { copyUserId: "u-1", brokerSession: { accessToken: "" } },
        adminZerodha,
        { brokerName: "Zerodha Kite" },
      ),
    /My plan/,
  );
});

test("member live broker copy uses the member session only", () => {
  const { lane, session } = liveOrderSession(
    {
      copyUserId: "u-1",
      brokerSession: { accessToken: "member-kite-token", apiKey: "member-kite-key", clientId: "MEM1" },
    },
    adminZerodha,
    { brokerName: "Zerodha Kite" },
  );
  assert.equal(lane, "member");
  assert.equal(session.accessToken, "member-kite-token");
  assert.equal(session.apiKey, "member-kite-key");
  assert.notEqual(session.accessToken, adminZerodha.accessToken);
});

test("member live broker copy falls back to account.accessToken", () => {
  const { lane, session } = liveOrderSession(
    {
      copyUserId: "u-upx",
      account: { accessToken: "member-upstox-token", clientId: "UPX-MEM-1" },
    },
    { accessToken: "admin-upstox-token", clientId: "ADMIN-UPX" },
    { brokerName: "Upstox" },
  );
  assert.equal(lane, "member");
  assert.equal(session.accessToken, "member-upstox-token");
  assert.equal(session.clientId, "UPX-MEM-1");
  assert.notEqual(session.accessToken, "admin-upstox-token");
});

test("leftover broker token is not sent as a live member session", () => {
  assert.throws(
    () =>
      liveOrderSession(
        {
          copyUserId: "u-leftover",
          leftoverSlot: true,
          account: { leftoverSlot: true, accessToken: "", clientId: "" },
          brokerSession: { leftoverSlot: true, accessToken: "", clientId: "" },
        },
        { accessToken: "admin-upstox-token", clientId: "ADMIN-UPX" },
        { brokerName: "Upstox" },
      ),
    /another broker's token/,
  );
});

test("401 copy errors name this member's client ID and token hint", () => {
  assert.equal(credentialHint("upstox-member-token"), "••••oken");
  const wrapped = annotateMemberLiveAuthError(
    Object.assign(new Error("401 Unauthorized"), { status: 401 }),
    { accessToken: "upstox-member-token", clientId: "UPX-MEM-1" },
    { brokerName: "Upstox" },
  );
  assert.match(wrapped.message, /401 Unauthorized/);
  assert.match(wrapped.message, /client ID UPX-MEM-1/);
  assert.match(wrapped.message, /••••oken/);
  assert.match(wrapped.message, /not the admin login/);
  assert.equal(wrapped.message.includes("upstox-member-token"), false);
  assert.equal(wrapped.status, 401);
});

test("admin live broker orders use the Brokers session", () => {
  const { lane, session } = liveOrderSession({ brokerId: "zerodha", side: "BUY" }, adminZerodha, {
    brokerName: "Zerodha Kite",
  });
  assert.equal(lane, "admin");
  assert.equal(session.accessToken, "admin-kite-token");
});

test("member Dhan HTTP uses a one-shot lane so it cannot retry-starve the admin tape", () => {
  assert.deepEqual(dhanSendOptions("member"), { lane: "member", attempts: 1 });
  assert.deepEqual(dhanSendOptions("admin"), { lane: "admin", attempts: 4 });
});

test("sendMemberCopyOrder refuses a Dhan copy when the member token is missing", async () => {
  await assert.rejects(
    () =>
      sendMemberCopyOrder({
        copyUserId: "u-no-token",
        brokerId: "dhan",
        side: "BUY",
        qty: 65,
        symbol: "NIFTY 24600 CE",
        account: { clientId: "1100333", accessToken: "" },
      }),
    /My plan/,
  );
});

test("sendMemberCopyOrder refuses a Zerodha copy when the member token is missing", async () => {
  await assert.rejects(
    () =>
      sendMemberCopyOrder({
        copyUserId: "u-no-kite",
        brokerId: "zerodha",
        side: "BUY",
        qty: 65,
        symbol: "NIFTY 24600 CE",
        brokerSession: { accessToken: "", apiKey: "admin-looking-key" },
      }),
    /My plan/,
  );
});

test("sendMemberCopyOrder refuses leftover credentials instead of calling Upstox", async () => {
  await assert.rejects(
    () =>
      sendMemberCopyOrder({
        copyUserId: "u-leftover-upx",
        brokerId: "upstox",
        leftoverSlot: true,
        side: "BUY",
        qty: 65,
        symbol: "NIFTY 22850 PE",
        account: { leftoverSlot: true, accessToken: "", clientId: "" },
        brokerSession: { leftoverSlot: true, accessToken: "", clientId: "" },
      }),
    /another broker's token/,
  );
});
