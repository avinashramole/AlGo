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
const { memberQuotes } = await import("./market.js");

const user = { id: "u-quotes", name: "Quote Member", email: "quotes@t2s.app", role: "user" };

test("member quotes do not reuse the admin desk tape when no token is installed", async () => {
  const adminTape = memberQuotes();
  const mine = await memberQuotesForUser(user);
  assert.equal(mine.source, "member");
  assert.deepEqual(mine.indices, []);
  assert.match(mine.reason, /your token/i);
  assert.notDeepEqual(mine.indices, adminTape.indices);
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

test("paper members stay on an empty board even if admin quotes exist", async () => {
  const paper = { id: "u-paper-quotes", name: "Paper Quotes", email: "paperq@t2s.app", role: "user" };
  selectMemberBroker({ user: paper, brokerId: "paper" });
  saveClientSettings(paper.id, { brokerId: "paper", tradeMode: "paper" });
  const mine = await memberQuotesForUser(paper, {
    fetchQuotes: async () => [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 99999 }],
  });
  assert.deepEqual(mine.indices, []);
  assert.equal(mine.brokerId, "paper");
});
