import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-member-quotes-"));
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const { installMemberBroker, selectMemberBroker, saveClientSettings } = await import("./memberDesk.js");
const { cardsFromMemberQuotes, dayChangeFromQuote, memberQuotesForUser } = await import("./memberQuotesFeed.js");

const user = { id: "u-quotes", name: "Quote Member", email: "quotes@t2s.app", role: "user" };

test("new members without a broker see the admin desk live tape", async () => {
  const adminTape = {
    indices: [
      { symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 20, changePct: 0.08, spark: [25100, 25111.25], future: 25140, lot: 65 },
      { symbol: "BANKNIFTY", name: "BANKNIFTY", price: 52100, change: -10, changePct: -0.02, spark: [], future: 52120, lot: 30 },
    ],
  };
  const mine = await memberQuotesForUser(user, {
    now: Date.now() + 5_000,
    deskQuotes: () => adminTape,
    fetchQuotes: async () => [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 99999 }],
  });
  assert.equal(mine.source, "admin");
  assert.equal(mine.live, true);
  assert.equal(mine.indices.find((row) => row.symbol === "NIFTY 50").price, 25111.25);
  assert.equal(mine.indices.find((row) => row.symbol === "BANKNIFTY").price, 52100);
  assert.match(mine.reason, /admin broker/i);
  assert.equal(JSON.stringify(mine).includes("99999"), false);
});

test("member Dhan quotes are fetched with the member client ID and token", async () => {
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "1100333", accessToken: "member-dhan-quote-token" });
  const seen = [];
  const mine = await memberQuotesForUser(user, {
    now: Date.now() + 10_000,
    fetchQuotes: async (creds) => {
      seen.push(creds);
      return [
        { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25111.25, close: 25000 },
        { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 25140.5, expiry: "2026-09-29" },
      ];
    },
  });
  assert.deepEqual(seen, [
    { brokerId: "dhan", accessToken: "member-dhan-quote-token", clientId: "1100333", apiKey: "" },
  ]);
  assert.equal(mine.brokerId, "dhan");
  assert.equal(mine.source, "member");
  const nifty = mine.indices.find((row) => row.symbol === "NIFTY 50");
  assert.equal(nifty.price, 25111.25);
  assert.equal(nifty.future, 25140.5);
  assert.equal(String(JSON.stringify(mine)).includes("member-dhan-quote-token"), false);
});

test("member Upstox quotes are fetched with the member token, not the admin feed", async () => {
  const other = { id: "u-upstox-quotes", name: "Upstox Quotes", email: "upxquotes@t2s.app", role: "user" };
  selectMemberBroker({ user: other, brokerId: "upstox" });
  installMemberBroker({ user: other, brokerId: "upstox", clientId: "UPX1", accessToken: "upstox-quote-token" });
  const seen = [];
  const mine = await memberQuotesForUser(other, {
    now: Date.now() + 10_000,
    fetchQuotes: async (creds) => {
      seen.push(creds);
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25100.5, close: 25000 }];
    },
  });
  assert.deepEqual(seen, [{ brokerId: "upstox", accessToken: "upstox-quote-token", clientId: "UPX1", apiKey: "" }]);
  assert.equal(mine.brokerId, "upstox");
  assert.equal(mine.source, "member");
  assert.equal(mine.reason, "");
  assert.equal(mine.indices[0].price, 25100.5);
  assert.equal(mine.brokerName, "UPSTOX");
  assert.equal(mine.live, true);
  assert.equal(typeof mine.lastTickAt, "number");
  assert.equal(String(JSON.stringify(mine)).includes("upstox-quote-token"), false);
});

test("member cards include Crude Oil and India VIX when the selected broker returns them", () => {
  const rows = cardsFromMemberQuotes("u-vix-crude", [
    { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 6124.5, close: 6100 },
    { symbol: "INDIA VIX", parent: "INDIA VIX", kind: "index", ltp: 12.75, close: 12.4 },
  ]);
  assert.equal(rows.find((row) => row.symbol === "CRUDEOIL").price, 6124.5);
  assert.equal(rows.find((row) => row.symbol === "INDIA VIX").price, 12.75);
});

test("member board always keeps a Crude Oil card even when LTP is missing", () => {
  const rows = cardsFromMemberQuotes("u-crude-empty", [
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25100, close: 25000 },
  ]);
  assert.equal(rows.some((row) => row.symbol === "CRUDEOIL"), true);
  assert.equal(rows.find((row) => row.symbol === "CRUDEOIL").price, 0);
  assert.equal(rows.find((row) => row.symbol === "NIFTY 50").price, 25100);
});

test("cardsFromMemberQuotes never copies admin-only fields onto the member board", () => {
  const rows = cardsFromMemberQuotes("u-cards", [
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 24000, close: 23900, vwap: 24111, securityId: 13 },
  ]);
  assert.equal(rows[0].price, 24000);
  assert.equal(rows[0].vwap, undefined);
  assert.equal(rows[0].securityId, undefined);
});

test("concurrent member quote polls share one broker fetch", async () => {
  const busy = { id: "u-inflight-quotes", name: "Inflight", email: "inflight@t2s.app", role: "user" };
  selectMemberBroker({ user: busy, brokerId: "dhan" });
  installMemberBroker({ user: busy, brokerId: "dhan", clientId: "1100444", accessToken: "inflight-token" });
  let fetches = 0;
  const fetchQuotes = () =>
    new Promise((resolve) => {
      fetches += 1;
      setTimeout(() => resolve([{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25001, close: 25000 }]), 20);
    });
  const [a, b] = await Promise.all([
    memberQuotesForUser(busy, { now: Date.now() + 20_000, fetchQuotes }),
    memberQuotesForUser(busy, { now: Date.now() + 20_000, fetchQuotes }),
  ]);
  assert.equal(fetches, 1);
  assert.equal(a.indices[0].price, 25001);
  assert.equal(b.indices[0].price, 25001);
});

test("day change is live LTP versus yesterday close, not zero when close is missing from LTP", () => {
  assert.deepEqual(dayChangeFromQuote(23326.8, { close: 23200 }), { change: 126.8, changePct: 0.55, prevClose: 23200 });
  assert.deepEqual(dayChangeFromQuote(23100, { prevClose: 23200 }), { change: -100, changePct: -0.43, prevClose: 23200 });
  assert.deepEqual(dayChangeFromQuote(23326.8, { netChange: -84.2 }), { change: -84.2, changePct: -0.36, prevClose: 23411 });
  assert.deepEqual(dayChangeFromQuote(23326.8, {}, 23210.4), { change: 116.4, changePct: 0.5, prevClose: 23210.4 });
  assert.deepEqual(dayChangeFromQuote(23326.8, { close: 23326.8 }), { change: 0, changePct: 0, prevClose: 0 });
  assert.deepEqual(dayChangeFromQuote(23329, { close: 23328.9 }, 23414.3), { change: -85.3, changePct: -0.36, prevClose: 23414.3 });
});

test("member cards show daily change vs yesterday close for every index", () => {
  const rows = cardsFromMemberQuotes("u-day-change", [
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 23326.8, close: 23200 },
    { symbol: "BANKNIFTY", parent: "BANKNIFTY", kind: "index", ltp: 52100, prevClose: 52400 },
    { symbol: "FINNIFTY", parent: "FINNIFTY", kind: "index", ltp: 24800, netChange: 120 },
    { symbol: "SENSEX", parent: "SENSEX", kind: "index", ltp: 76500, close: 76000 },
    { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 6124.5, close: 6100 },
    { symbol: "INDIA VIX", parent: "INDIA VIX", kind: "index", ltp: 12.4, close: 12.8 },
  ]);
  const nifty = rows.find((row) => row.symbol === "NIFTY 50");
  const bank = rows.find((row) => row.symbol === "BANKNIFTY");
  const vix = rows.find((row) => row.symbol === "INDIA VIX");
  assert.equal(nifty.change, 126.8);
  assert.equal(nifty.changePct, 0.55);
  assert.equal(nifty.prevClose, 23200);
  assert.ok(bank.change < 0);
  assert.ok(vix.change < 0);
  const again = cardsFromMemberQuotes("u-day-change", [
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 23340 },
  ]);
  assert.equal(again.find((row) => row.symbol === "NIFTY 50").prevClose, 23200);
  assert.equal(again.find((row) => row.symbol === "NIFTY 50").change, 140);
});

function withAdminKotakEnv(run) {
  const saved = {
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
    client: process.env.T2S_KOTAK_CLIENT_ID,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
  };
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-consumer-key";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-access-token";
  process.env.T2S_KOTAK_CLIENT_ID = "YIX14";
  process.env.T2S_KOTAK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [name, value] of [
        ["T2S_KOTAK_CONSUMER_KEY", saved.key],
        ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
        ["T2S_KOTAK_CLIENT_ID", saved.client],
        ["T2S_KOTAK_TOTP_SECRET", saved.totp],
      ]) {
        if (value == null) delete process.env[name];
        else process.env[name] = value;
      }
    });
}

test("Shivam Fintech on Kotak does not receive the admin Dhan tape", async () => {
  const member = { id: "u-shivam-kotak", name: "Shivam Fintech", email: "shivam.fintech@gmail.com", role: "user" };
  saveClientSettings(member.id, {
    brokerId: "kotak",
    accountId: "YIX14",
    brokerApiKey: "cd-consumer-key-3e77",
    brokerToken: "kotak-desk-token",
    tradeMode: "real",
  });
  await withAdminKotakEnv(async () => {
    const seen = [];
    const mine = await memberQuotesForUser(member, {
      now: Date.now() + 30_000,
      fetchQuotes: async (creds) => {
        seen.push(creds);
        return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 1 }];
      },
      deskQuotes: () => ({
        indices: [
          { symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 20, changePct: 0.08, spark: [25100, 25111.25], future: 25140, lot: 65 },
          { symbol: "BANKNIFTY", name: "BANKNIFTY", price: 52100, change: -10, changePct: -0.02, spark: [], future: 52120, lot: 30 },
        ],
      }),
    });
    assert.equal(mine.brokerId, "kotak");
    assert.equal(mine.brokerName, "KOTAK");
    assert.equal(mine.source, "kotak");
    assert.equal(seen.length === 0 || seen[0].clientId === "YIX14", true);
    const body = JSON.stringify(mine);
    assert.equal(body.includes("25111.25"), false);
    assert.equal(body.includes("YIX14"), false);
    assert.equal(body.includes("kotak-desk-token"), false);
    assert.equal(body.includes("admin-consumer-key"), false);
    assert.equal(body.includes("admin-access-token"), false);
  });
});

test("admin Kotak login stays off Shivam Fintech's feed", async () => {
  const member = { id: "u-shivam-live", name: "Shivam Fintech", email: "shivam.live@gmail.com", role: "user" };
  saveClientSettings(member.id, { brokerId: "kotak", tradeMode: "paper" });
  await withAdminKotakEnv(async () => {
    let fetches = 0;
    const mine = await memberQuotesForUser(member, {
      now: Date.now() + 60_000,
      deskKotak: {
        clientId: "YIX14",
        apiKey: "kotak-consumer-key",
        accessToken: "kotak-consumer-key",
        totpSecret: "JBSWY3DPEHPK3PXP",
      },
      fetchQuotes: async () => {
        fetches += 1;
        return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22421.95, close: 22620.45 }];
      },
      deskQuotes: () => ({
        indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 20, changePct: 0.08, spark: [], future: 25140, lot: 65 }],
      }),
    });
    assert.equal(fetches, 0);
    assert.equal(mine.brokerId, "kotak");
    assert.equal(mine.brokerName, "KOTAK");
    assert.equal(mine.live, false);
    assert.equal(mine.source, "kotak");
    assert.deepEqual(mine.indices, []);
    assert.match(mine.reason, /admin feed stays on the admin side/);
    const body = JSON.stringify(mine);
    assert.equal(body.includes("22421.95"), false);
    assert.equal(body.includes("25111.25"), false);
    assert.equal(body.includes("kotak-consumer-key"), false);
    assert.equal(body.includes("YIX14"), false);
    assert.equal(body.includes("JBSWY3DPEHPK3PXP"), false);
    assert.equal(body.includes("admin-access-token"), false);
  });
});

test("an empty Kotak quote does not fill in the admin Dhan tape", async () => {
  const member = { id: "u-shivam-empty", name: "Shivam Fintech", email: "shivam.empty@gmail.com", role: "user" };
  selectMemberBroker({ user: member, brokerId: "kotak" });
  installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "SHIVAM-EMPTY",
    apiKey: "shivam-empty-key",
    accessToken: "shivam-empty-token",
  });
  await withAdminKotakEnv(async () => {
    const seen = [];
    const mine = await memberQuotesForUser(member, {
      now: Date.now() + 90_000,
      fetchQuotes: async (creds) => {
        seen.push(creds);
        return [];
      },
      deskQuotes: () => ({
        indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 20, changePct: 0.08, spark: [], future: 25140, lot: 65 }],
      }),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].clientId, "SHIVAM-EMPTY");
    assert.equal(seen[0].apiKey, "shivam-empty-key");
    assert.equal(mine.source, "kotak");
    assert.equal(mine.brokerId, "kotak");
    assert.equal(mine.live, false);
    assert.deepEqual(mine.indices, []);
    assert.match(mine.reason, /Kotak Neo did not return/);
    const body = JSON.stringify(mine);
    assert.equal(body.includes("25111.25"), false);
    assert.equal(body.includes("YIX14"), false);
    assert.equal(body.includes("admin-access-token"), false);
  });
});

test("Shivam Fintech quotes use his own Kotak token, not the admin Dhan tape", async () => {
  const member = { id: "u-shivam-own", name: "Shivam Fintech", email: "shivam.own@gmail.com", role: "user" };
  selectMemberBroker({ user: member, brokerId: "kotak" });
  installMemberBroker({
    user: member,
    brokerId: "kotak",
    clientId: "SHIVAM1",
    apiKey: "shivam-consumer-key",
    accessToken: "shivam-access-token",
  });
  await withAdminKotakEnv(async () => {
    const seen = [];
    const mine = await memberQuotesForUser(member, {
      now: Date.now() + 120_000,
      deskKotak: {
        clientId: "YIX14",
        apiKey: "desk-consumer-key",
        accessToken: "desk-access-token",
      },
      fetchQuotes: async (creds) => {
        seen.push(creds);
        return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22480.1, close: 22620.45 }];
      },
      deskQuotes: () => ({
        indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 20, changePct: 0.08, spark: [], future: 25140, lot: 65 }],
      }),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].clientId, "SHIVAM1");
    assert.equal(seen[0].apiKey, "shivam-consumer-key");
    assert.equal(seen[0].accessToken, "shivam-access-token");
    assert.equal(seen[0].totpSecret, undefined);
    assert.equal(mine.source, "kotak");
    assert.equal(mine.live, true);
    assert.equal(mine.indices.find((row) => row.symbol === "NIFTY 50").price, 22480.1);
    const body = JSON.stringify(mine);
    assert.equal(body.includes("25111.25"), false);
    assert.equal(body.includes("shivam-access-token"), false);
    assert.equal(body.includes("desk-consumer-key"), false);
    assert.equal(body.includes("YIX14"), false);
    assert.equal(body.includes("admin-access-token"), false);
    assert.equal(body.includes("JBSWY3DPEHPK3PXP"), false);
  });
});

test("a paper-mode user quotes their own Dhan token", async () => {
  const member = { id: "u-paper-dhan-own", name: "Paper Dhan", email: "paper.dhan.own@gmail.com", role: "user" };
  saveClientSettings(member.id, {
    brokerId: "dhan",
    accountId: "DHAN-PAPER",
    brokerToken: "dhan-paper-token",
    tradeMode: "paper",
  });
  const seen = [];
  const mine = await memberQuotesForUser(member, {
    now: Date.now() + 150_000,
    fetchQuotes: async (creds) => {
      seen.push(creds);
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22400 }];
    },
    deskQuotes: () => ({
      indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 1, changePct: 0.01, spark: [], future: 25140, lot: 65 }],
    }),
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].accessToken, "dhan-paper-token");
  assert.equal(seen[0].clientId, "DHAN-PAPER");
  assert.equal(mine.brokerId, "dhan");
  assert.equal(mine.live, true);
  assert.equal(mine.indices.find((row) => row.symbol === "NIFTY 50").price, 22400);
  assert.equal(JSON.stringify(mine).includes("25111.25"), false);
  assert.equal(JSON.stringify(mine).includes("dhan-paper-token"), false);
});

test("a selected broker with no token still uses the admin desk tape", async () => {
  const fresh = { id: "u-dhan-not-setup", name: "New Dhan", email: "new.dhan@t2s.app", role: "user" };
  selectMemberBroker({ user: fresh, brokerId: "dhan" });
  const mine = await memberQuotesForUser(fresh, {
    now: Date.now() + 200_000,
    fetchQuotes: async () => [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 99999 }],
    deskQuotes: () => ({
      indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 24880.5, change: 12, changePct: 0.05, spark: [], future: 24910, lot: 65 }],
    }),
  });
  assert.equal(mine.source, "admin");
  assert.equal(mine.indices.find((row) => row.symbol === "NIFTY 50").price, 24880.5);
  assert.equal(JSON.stringify(mine).includes("99999"), false);
});

test("paper members see admin desk cards until they install a broker", async () => {
  const paper = { id: "u-paper-quotes", name: "Paper Quotes", email: "paperq@t2s.app", role: "user" };
  selectMemberBroker({ user: paper, brokerId: "paper" });
  saveClientSettings(paper.id, { brokerId: "paper", tradeMode: "paper" });
  const mine = await memberQuotesForUser(paper, {
    now: Date.now() + 180_000,
    fetchQuotes: async () => [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 99999 }],
    deskQuotes: () => ({
      indices: [{ symbol: "NIFTY 50", name: "NIFTY", price: 25111.25, change: 1, changePct: 0.01, spark: [], future: 25140, lot: 65 }],
    }),
  });
  assert.equal(mine.source, "admin");
  assert.equal(mine.live, true);
  assert.equal(mine.indices.find((row) => row.symbol === "NIFTY 50").price, 25111.25);
  assert.equal(JSON.stringify(mine).includes("99999"), false);
});
