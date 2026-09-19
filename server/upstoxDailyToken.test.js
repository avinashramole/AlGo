import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-upstox-daily-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_UPSTOX_DAILY_TOKEN_FILE = path.join(dir, "upstox-daily-token.json");

const { installMemberBroker, listUpstoxOauthTargets } = await import("./memberDesk.js");
const {
  askUpstoxDailyTokens,
  istYmd,
  loadUpstoxDailyAskedYmd,
  nextUpstoxDailyTokenAt,
  saveUpstoxDailyAskedYmd,
  shouldAskUpstoxDailyTokens,
  startUpstoxDailyTokenScheduler,
  tradingTokenFreshAfterReset,
} = await import("./upstoxDailyToken.js");

const SEVEN_AM = Date.parse("2026-09-18T01:30:00.000Z"); // 07:00 IST
const EIGHT_AM = Date.parse("2026-09-18T02:30:00.000Z"); // 08:00 IST
const EIGHT_05 = Date.parse("2026-09-18T02:35:00.000Z"); // 08:05 IST
const NEXT_EIGHT = Date.parse("2026-09-19T02:30:00.000Z");

const ready = { id: "u-upx-ready", name: "Ready", email: "ready@t2s.app", role: "user" };
const fresh = { id: "u-upx-fresh", name: "Fresh", email: "fresh@t2s.app", role: "user" };
const dhanOnly = { id: "u-dhan-only", name: "Dhan", email: "dhan@t2s.app", role: "user" };

installMemberBroker({
  user: ready,
  brokerId: "upstox",
  clientId: "393216",
  apiKey: "upstox-api-key-11111111",
  sessionToken: "upstox-api-secret-22222222",
});
installMemberBroker({
  user: fresh,
  brokerId: "upstox",
  clientId: "393217",
  apiKey: "upstox-api-key-33333333",
  sessionToken: "upstox-api-secret-44444444",
  accessToken: "upstox-trading-token-already",
});
installMemberBroker({
  user: dhanOnly,
  brokerId: "dhan",
  clientId: "1100111",
  accessToken: "dhan-only-token",
});

test("only desks with stored Upstox API key and secret are daily-token targets", () => {
  const ids = listUpstoxOauthTargets().map((row) => row.userId).sort();
  assert.deepEqual(ids, ["u-upx-fresh", "u-upx-ready"]);
  const row = listUpstoxOauthTargets().find((item) => item.userId === "u-upx-ready");
  assert.equal(row.hasTradingToken, false);
  assert.equal(listUpstoxOauthTargets().find((item) => item.userId === "u-upx-fresh").hasTradingToken, true);
});

test("8:00 AM IST window waits until 8:00 and does not repeat the same IST day", () => {
  assert.equal(shouldAskUpstoxDailyTokens({ now: SEVEN_AM, lastAskedYmd: "" }), false);
  assert.equal(shouldAskUpstoxDailyTokens({ now: EIGHT_AM, lastAskedYmd: "" }), true);
  assert.equal(shouldAskUpstoxDailyTokens({ now: EIGHT_05, lastAskedYmd: "2026-09-18" }), false);
  assert.equal(nextUpstoxDailyTokenAt(SEVEN_AM, ""), EIGHT_AM);
  assert.equal(nextUpstoxDailyTokenAt(EIGHT_05, "2026-09-18"), NEXT_EIGHT);
  assert.equal(nextUpstoxDailyTokenAt(EIGHT_05, ""), EIGHT_05 + 5_000);
});

test("a trading token saved after today's 8:00 IST is already fresh", () => {
  assert.equal(tradingTokenFreshAfterReset("2026-09-18T02:32:00.000Z", EIGHT_05), true);
  assert.equal(tradingTokenFreshAfterReset("2026-09-17T10:00:00.000Z", EIGHT_05), false);
  assert.equal(tradingTokenFreshAfterReset("", EIGHT_05), false);
});

test("08:00 IST asks every stored key/secret except a token minted after the reset", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "success", data: { notifier_url: "https://trade2smart.com/api/upstox/token" } }),
    };
  };
  const notified = [];
  const result = await askUpstoxDailyTokens({
    now: EIGHT_05,
    lastAskedYmd: "",
    fetchImpl,
    targets: listUpstoxOauthTargets().map((row) => ({ ...row, tokenUpdatedAt: "" })),
    notify: (userId) => notified.push(userId),
  });
  assert.equal(result.reason, "asked");
  assert.deepEqual(
    result.asked.map((row) => row.userId).sort(),
    ["u-upx-fresh", "u-upx-ready"],
  );
  assert.equal(result.skipped.length, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((url) => url.includes("upstox-api-key-11111111")));
  assert.ok(calls.some((url) => url.includes("upstox-api-key-33333333")));
  assert.deepEqual(notified.sort(), ["u-upx-fresh", "u-upx-ready"]);
});

test("a token updated after 8:00 IST is skipped on the same morning run", async () => {
  const targets = [
    { userId: "u-upx-ready", tokenUpdatedAt: "" },
    { userId: "u-upx-fresh", tokenUpdatedAt: "2026-09-18T02:40:00.000Z" },
  ];
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: "success", data: {} }),
    };
  };
  const result = await askUpstoxDailyTokens({
    now: EIGHT_05,
    lastAskedYmd: "",
    fetchImpl,
    targets,
    notify: () => undefined,
  });
  assert.deepEqual(result.asked.map((row) => row.userId), ["u-upx-ready"]);
  assert.deepEqual(result.skipped, [{ userId: "u-upx-fresh", reason: "already-fresh" }]);
  assert.equal(calls.length, 1);
});

test("scheduler waits for 8:00 IST and does not ask on start", async () => {
  let now = SEVEN_AM;
  const fires = [];
  const timers = [];
  saveUpstoxDailyAskedYmd("");
  const stop = startUpstoxDailyTokenScheduler({
    getNow: () => now,
    ask: async ({ now: at }) => {
      fires.push(at.getTime());
      return { asked: [{ userId: "u-upx-ready" }], skipped: [], failed: [], lastAskedYmd: istYmd(at), reason: "asked" };
    },
    loadAskedYmd: loadUpstoxDailyAskedYmd,
    saveAskedYmd: saveUpstoxDailyAskedYmd,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeoutFn: () => undefined,
  });
  assert.equal(fires.length, 0);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, EIGHT_AM - SEVEN_AM);
  now = EIGHT_AM;
  await timers[0].fn();
  assert.equal(fires.length, 1);
  assert.equal(loadUpstoxDailyAskedYmd(), "2026-09-18");
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, NEXT_EIGHT - EIGHT_AM);
  stop();
});
