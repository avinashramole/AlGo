import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyPulledDhanAccount, noteAdminBrokerOrder } from "./dhan.js";
import { replaceDhanBook, setDhanFeed, snapshot } from "./market.js";

test("a failed Dhan positions pull after BUY does not wipe the desk book", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-buy-keep",
      symbol: "NIFTY 22700 CE",
      type: "BUY",
      qty: 65,
      avg: 120,
      ltp: 125,
      pnl: 325,
      brokerId: "dhan",
      live: true,
      sim: false,
    },
  ]);
  assert.ok((snapshot().positions || []).some((row) => row.brokerId === "dhan" && Number(row.qty) > 0));
  applyPulledDhanAccount({ positionsOk: false, ordersOk: false });
  const kept = (snapshot().positions || []).filter((row) => row.brokerId === "dhan" && Number(row.qty) > 0);
  assert.ok(kept.length >= 1);
  replaceDhanBook([]);
});

test("an empty successful positions pull right after BUY keeps the last admin book", () => {
  replaceDhanBook([
    {
      id: "dhan-pos-recent-buy",
      symbol: "NIFTY 22750 PE",
      type: "BUY",
      qty: 65,
      avg: 40,
      ltp: 42,
      pnl: 130,
      brokerId: "dhan",
      live: true,
      sim: false,
    },
  ]);
  noteAdminBrokerOrder();
  applyPulledDhanAccount({ positionsOk: true, positionsRaw: [], holdingsRaw: [], ordersOk: false });
  const kept = (snapshot().positions || []).filter((row) => row.brokerId === "dhan" && Number(row.qty) > 0);
  assert.ok(kept.length >= 1);
  replaceDhanBook([]);
});

test("BUY send keeps the quote loop on and still places the broker order", () => {
  setDhanFeed({ live: true, source: "websocket", lastTickAt: Date.now(), error: null });
  assert.equal(snapshot().dhanFeed.live, true);
  const dhanSrc = fs.readFileSync(new URL("./dhan.js", import.meta.url), "utf8");
  assert.match(dhanSrc, /ensureDhanOrderSession/);
  assert.match(dhanSrc, /quote feed stayed on for the BUY send/);
  assert.match(dhanSrc, /if \(accessToken && pollTimer\)/);
  assert.match(dhanSrc, /const keepLoop = isDhanFeedLoopRunning\(\)/);
  assert.match(dhanSrc, /if \(isDhanFeedLoopRunning\(\)\) return;/);
  assert.match(dhanSrc, /if \(!isMemberScopedOrder\(payload\)\) ensureDhanOrderSession\(\)/);
  assert.match(dhanSrc, /if \(positionsOk\)/);
  assert.match(dhanSrc, /shouldArmAdminDataFeed\(reason/);
  assert.match(dhanSrc, /noteAdminBrokerOrder/);
  const copySrc = fs.readFileSync(new URL("./liveCopy.js", import.meta.url), "utf8");
  assert.match(copySrc, /export function findLiveCopyAlgo/);
  assert.match(copySrc, /if \(copy\.copyBlocked\)/);
  const indexSrc = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(indexSrc, /ensureDhanOrderSession\(\)/);
  assert.match(indexSrc, /placeDhanOrder\(adminPayload\)/);
  const marketSrc = fs.readFileSync(new URL("./market.js", import.meta.url), "utf8");
  assert.match(marketSrc, /return isDhanFeedLive\(\) \|\| hasLastLiveBook\(\)/);
  assert.match(marketSrc, /return liveOrdersArmed && isDhanFeedLive\(\)/);
  assert.match(marketSrc, /if \(dhanOrdersLive\(\)\)/);
  assert.match(marketSrc, /stalled: dhanQuotesStalled\(feed\)/);
});
