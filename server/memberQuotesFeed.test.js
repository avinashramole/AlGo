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
const { cardsFromMemberQuotes, memberQuotesForUser } = await import("./memberQuotesFeed.js");
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
    fetchQuotes: async ({ accessToken, clientId }) => {
      seen.push({ accessToken, clientId });
      return [
        { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25111.25, close: 25000 },
        { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 25140.5, expiry: "2026-09-29" },
      ];
    },
  });
  assert.deepEqual(seen, [{ accessToken: "member-dhan-quote-token", clientId: "1100333" }]);
  assert.equal(mine.brokerId, "dhan");
  assert.equal(mine.source, "member");
  const nifty = mine.indices.find((row) => row.symbol === "NIFTY 50");
  assert.equal(nifty.price, 25111.25);
  assert.equal(nifty.future, 25140.5);
  assert.equal(String(JSON.stringify(mine)).includes("member-dhan-quote-token"), false);
});

test("a non-Dhan member broker does not fall back to the admin feed", async () => {
  const other = { id: "u-upstox-quotes", name: "Upstox Quotes", email: "upxquotes@t2s.app", role: "user" };
  selectMemberBroker({ user: other, brokerId: "upstox" });
  installMemberBroker({ user: other, brokerId: "upstox", clientId: "UPX1", accessToken: "upstox-quote-token" });
  let fetched = false;
  const mine = await memberQuotesForUser(other, {
    fetchQuotes: async () => {
      fetched = true;
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 1 }];
    },
  });
  assert.equal(fetched, false);
  assert.equal(mine.brokerId, "upstox");
  assert.deepEqual(mine.indices, []);
  assert.match(mine.reason, /dhan/i);
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
