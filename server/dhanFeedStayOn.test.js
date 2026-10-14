import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { markDhanLive, idleDhan, publicBrokers } from "./brokers.js";
import { adminQuoteFeed, isDhanFeedLive, setDhanFeed, snapshot } from "./market.js";
import { shouldArmAdminDataFeed } from "./dhanToken.js";

test("a rest or websocket tape stays live after a stale live:false stamp", () => {
  setDhanFeed({ live: true, source: "websocket", lastTickAt: Date.now(), error: null });
  setDhanFeed({ live: false, source: "kotak", error: "Kotak Neo did not return index quotes.", quoteCount: 0 });
  const feed = snapshot().dhanFeed;
  assert.equal(feed.live, true);
  assert.equal(feed.source, "websocket");
  assert.equal(isDhanFeedLive(), true);
  assert.equal(adminQuoteFeed().live, true);
  assert.equal(adminQuoteFeed().source, "websocket");
});

test("public feed stays live when the flag drops but the source is still rest", () => {
  setDhanFeed({ live: false, source: "rest", lastTickAt: Date.now(), error: null });
  const feed = snapshot().dhanFeed;
  assert.equal(feed.live, true);
  assert.equal(feed.source, "rest");
  assert.equal(isDhanFeedLive(), true);
  setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  assert.equal(snapshot().dhanFeed.live, false);
  assert.equal(isDhanFeedLive(), false);
});

test("Stop data feed is the only watchdog that stays off", () => {
  assert.equal(shouldArmAdminDataFeed("watchdog", { feedStopped: true }), false);
  assert.equal(shouldArmAdminDataFeed("boot", { feedStopped: true }), true);
  assert.equal(shouldArmAdminDataFeed("deploy", { feedStopped: true }), true);
  assert.equal(shouldArmAdminDataFeed("live-start", { feedStopped: true }), true);
  assert.equal(shouldArmAdminDataFeed("watchdog", { feedStopped: false }), true);
});

test("markDhanLive keeps funds when a later stamp has none", () => {
  idleDhan();
  markDhanLive({ clientId: "1100333", funds: 125000, marginUsed: 2000, keyHint: "ab12", displayName: "Dhan · Test" });
  markDhanLive({ clientId: "1100333", keyHint: "ab12" });
  const dhan = publicBrokers().brokers.find((row) => row.id === "dhan");
  assert.equal(dhan.liveFeed, true);
  assert.equal(dhan.funds, 125000);
  assert.equal(dhan.marginUsed, 2000);
  idleDhan();
});

test("refresh UI keeps Stop data feed when the quote loop is live", () => {
  const brokersUi = fs.readFileSync(new URL("../src/pages/Brokers.tsx", import.meta.url), "utf8");
  assert.match(brokersUi, /feed\?\.live \|\| broker\.liveFeed/);
  assert.match(brokersUi, /feedOn/);
  assert.match(brokersUi, /browser refresh or later/);
  const deskUi = fs.readFileSync(new URL("../src/context/MarketContext.tsx", import.meta.url), "utf8");
  assert.match(deskUi, /syncDhanBrokerLive/);
  assert.match(deskUi, /Snapshot\["brokers"\]/);
  assert.match(deskUi, /defaultBrokers/);
  const dhanSrc = fs.readFileSync(new URL("./dhan.js", import.meta.url), "utf8");
  assert.match(dhanSrc, /stampAdminFeedLive\(\)/);
  assert.match(dhanSrc, /shouldArmAdminDataFeed\(reason/);
  assert.match(dhanSrc, /reason: "feed-stopped"/);
  const marketSrc = fs.readFileSync(new URL("./market.js", import.meta.url), "utf8");
  assert.match(marketSrc, /dhanSourceOwnsTape/);
  assert.match(marketSrc, /nextSource !== "idle"/);
});
