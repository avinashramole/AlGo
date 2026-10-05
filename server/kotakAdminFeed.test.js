import assert from "node:assert/strict";
import test from "node:test";

const { dhanOwnsAdminTape, pullKotakAdminQuotes } = await import("./kotakAdminFeed.js");

test("a live Dhan websocket keeps the admin tape", () => {
  assert.equal(dhanOwnsAdminTape({ live: true, source: "websocket" }), true);
  assert.equal(dhanOwnsAdminTape({ live: true, source: "rest" }), true);
  assert.equal(dhanOwnsAdminTape({ live: false, source: "websocket" }), true);
  assert.equal(dhanOwnsAdminTape({ live: false, source: "rest" }), true);
  assert.equal(dhanOwnsAdminTape({ live: false, source: "idle" }), false);
  assert.equal(dhanOwnsAdminTape({ live: true, source: "kotak" }), false);
  assert.equal(dhanOwnsAdminTape({ live: false, source: "idle" }, { dhanRunning: true }), true);
});

test("Kotak admin tape fills index prices from the consumer key and does not mark orders live", async () => {
  const seen = [];
  const applied = [];
  const result = await pullKotakAdminQuotes({
    key: "kotak-feed-key",
    feed: { live: false, source: "idle" },
    now: 1_700_000_000_000,
    fetchQuotes: async (creds) => {
      seen.push(creds);
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22421.95, close: 22620.45 }];
    },
    applyQuotes: (quotes) => applied.push(quotes),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [{ brokerId: "kotak", apiKey: "kotak-feed-key", accessToken: "kotak-feed-key" }]);
  assert.equal(applied[0][0].ltp, 22421.95);
  assert.equal(result.patch.source, "kotak");
  assert.equal(result.patch.live, true);
  assert.equal(result.patch.lastTickAt, 1_700_000_000_000);
  assert.equal(JSON.stringify(result.patch).includes("kotak-feed-key"), false);
});

test("Kotak admin tape does not replace a live Dhan tape", async () => {
  let fetches = 0;
  const result = await pullKotakAdminQuotes({
    key: "kotak-feed-key",
    feed: { live: true, source: "websocket" },
    fetchQuotes: async () => {
      fetches += 1;
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 1 }];
    },
  });
  assert.equal(fetches, 0);
  assert.equal(result.reason, "dhan-live");
  assert.equal(result.patch, null);
});

test("an empty Kotak quote leaves the admin tape waiting", async () => {
  const result = await pullKotakAdminQuotes({
    key: "kotak-feed-key",
    feed: { live: false, source: "idle" },
    fetchQuotes: async () => [],
    applyQuotes: () => {
      throw new Error("should not apply");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.patch.source, "kotak");
  assert.equal(result.patch.live, false);
});

test("a Kotak fetch that started while idle does not overwrite Dhan after it goes live", async () => {
  let feed = { live: false, source: "idle" };
  let applied = 0;
  const result = await pullKotakAdminQuotes({
    key: "kotak-feed-key",
    feed,
    currentFeed: () => feed,
    fetchQuotes: async () => {
      feed = { live: true, source: "websocket" };
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22421.95 }];
    },
    applyQuotes: () => {
      applied += 1;
    },
  });
  assert.equal(applied, 0);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "dhan-live");
  assert.equal(result.patch, null);
});

test("an empty Kotak quote does not turn off a Dhan tape that connected during the fetch", async () => {
  let feed = { live: false, source: "idle" };
  const result = await pullKotakAdminQuotes({
    key: "kotak-feed-key",
    feed,
    currentFeed: () => feed,
    fetchQuotes: async () => {
      feed = { live: true, source: "websocket" };
      return [];
    },
    applyQuotes: () => {
      throw new Error("should not apply");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "dhan-live");
  assert.equal(result.patch, null);
});
