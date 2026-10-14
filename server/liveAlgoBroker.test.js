import assert from "node:assert/strict";
import test from "node:test";
import {
  armLiveTarget,
  drainPendingLiveAlgoOrders,
  fundsHoldBlocks,
  kickLiveAlgoFlush,
  liveAlgoBrokerSignal,
  noteLiveAlgoOrderResult,
  onLiveAlgoOrders,
  queueLiveAlgoOrder,
  recoverWaitOrderLiveBuy,
  releaseStaleLiveSend,
  replaceDhanOrders,
  requeueLiveAlgoOrders,
} from "./market.js";
import { STALE_LIVE_SEND_MS } from "./niftyVwap/index.js";

test("broker accept is AT BROKER and a reject names the reason", () => {
  const accepted = liveAlgoBrokerSignal({
    payload: { side: "BUY", option: "CE" },
    live: { orderId: "OID1", status: "TRANSIT" },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.lastSignal, "BUY CE AT BROKER OID1");
  const rejected = liveAlgoBrokerSignal({
    payload: { side: "BUY", option: "CE" },
    live: { status: "REJECTED" },
    error: new Error("Dhan is not LIVE. Connect Access Token on Brokers."),
  });
  assert.equal(rejected.accepted, false);
  assert.match(rejected.lastSignal, /^BROKER · Dhan is not LIVE/);
});

test("a buy uses one limit price so the admin and user books match", () => {
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22650,
    qty: 65,
    price: 232.47,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
    type: "MARKET",
  });
  const [order] = drainPendingLiveAlgoOrders();
  assert.equal(order.type, "LIMIT");
  assert.equal(order.price, 232.45);
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "SELL",
    option: "CE",
    qty: 65,
    price: 232.45,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
  });
  const [exit] = drainPendingLiveAlgoOrders();
  assert.equal(exit.side, "SELL");
  assert.notEqual(exit.type, "LIMIT");
  assert.equal(exit.price, 232.45);
});

test("a strategy order asks for the broker send immediately", async () => {
  drainPendingLiveAlgoOrders();
  let calls = 0;
  onLiveAlgoOrders(() => {
    calls += 1;
  });
  const queued = queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22650,
    qty: 65,
    symbol: "NIFTY 22650 CE",
    brokerId: "dhan",
  });
  assert.equal(queued.queued, true);
  assert.ok(calls >= 1);
  await new Promise((resolve) => {
    queueMicrotask(resolve);
  });
  assert.ok(calls >= 1);
  onLiveAlgoOrders(() => {});
  drainPendingLiveAlgoOrders();
});

test("stale SENDING with no pending or book is released so admin and user can send again", () => {
  drainPendingLiveAlgoOrders();
  const algo = {
    name: "NIFTY",
    allowFreshLiveEntry: false,
    lastSignal: "BUY CE SENDING · PREVIEW NIFTY FUT GREEN CE 22800",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: Date.now() - STALE_LIVE_SEND_MS - 1_000,
      lastEntryBarTime: Date.now() - STALE_LIVE_SEND_MS - 1_000,
      lockedStrike: 22800,
      lockedOption: "CE",
    },
  };
  assert.equal(releaseStaleLiveSend(algo), true);
  assert.equal(algo.vwapState.buyPhase, "");
  assert.equal(algo.vwapState.inFlight, false);
  assert.equal(algo.vwapState.lastEntryBarTime, 0);
  assert.equal(algo.allowFreshLiveEntry, true);
});

test("leftover WAIT ORDER with no book is released so admin and user can send", () => {
  drainPendingLiveAlgoOrders();
  const algo = {
    name: "NIFTY",
    allowFreshLiveEntry: false,
    lastSignal: "WAIT ORDER · PREVIEW NIFTY FUT RED CE 22750 RED PE 22750 GREEN · BUY PE 22750",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: Date.now(),
      lastEntryBarTime: Date.now(),
      lockedStrike: 22750,
      lockedOption: "PE",
    },
  };
  assert.equal(releaseStaleLiveSend(algo), true);
  assert.equal(algo.vwapState.buyPhase, "");
  assert.equal(algo.allowFreshLiveEntry, true);
});

test("leftover buyPhase does not block a fresh admin BUY when nothing is pending", async () => {
  drainPendingLiveAlgoOrders();
  const { createAlgo, deleteAlgo, toggleAlgo, setDhanFeed, withLiveAlgo } = await import("./market.js");
  setDhanFeed({ live: true });
  const created = createAlgo({
    name: `NIFTY leftover phase ${Date.now()}`,
    kind: "nifty-first-candle",
    runMode: "live",
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    withLiveAlgo(created.id, (algo) => {
      algo.vwapState = { ...(algo.vwapState || {}), buyPhase: "entry", inFlight: true };
      algo.allowFreshLiveEntry = false;
    });
    const queued = queueLiveAlgoOrder({
      strategy: created.name,
      side: "BUY",
      option: "PE",
      strike: 22750,
      qty: 65,
      price: 110,
      symbol: "NIFTY 22750 PE",
      brokerId: "dhan",
    });
    assert.equal(queued.queued, true);
    const rows = drainPendingLiveAlgoOrders().filter((row) => row.strategy === created.name && !row.copyUserId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].option, "PE");
    assert.equal(Number(rows[0].strike), 22750);
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("recoverWaitOrderLiveBuy queues BUY PE 22750 for admin when the tape is WAIT ORDER", async () => {
  drainPendingLiveAlgoOrders();
  const { createAlgo, deleteAlgo, toggleAlgo, setDhanFeed, withLiveAlgo } = await import("./market.js");
  setDhanFeed({ live: true });
  const created = createAlgo({
    name: `NIFTY wait PE ${Date.now()}`,
    kind: "nifty-first-candle",
    runMode: "live",
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    const live = withLiveAlgo(created.id, (algo) => {
      algo.lastSignal =
        "WAIT ORDER · PREVIEW NIFTY FUT RED CE 22750 RED PE 22750 GREEN O 22759.90 C 22750.00 · 12:00–12:15 IST · BUY PE 22750";
      algo.vwapState = {
        ...(algo.vwapState || {}),
        buyPhase: "entry",
        inFlight: true,
        lastEntryAt: Date.now(),
        lockedStrike: 22750,
        lockedOption: "PE",
      };
      return algo;
    });
    const recovered = recoverWaitOrderLiveBuy(live, {
      peStrike: 22750,
      ceStrike: 22750,
      peLtp: 110,
      ceLtp: 80,
      peSecurityId: "pe-22750",
      ceSecurityId: "ce-22750",
      expiry: "2026-10-14",
      config: { qty: 65, lots: 1, lotSize: 65, symbol: "NIFTY" },
      now: Date.now(),
    });
    assert.equal(recovered, true);
    assert.match(String(live.lastSignal || ""), /BUY PE SENDING/);
    const rows = drainPendingLiveAlgoOrders().filter((row) => row.strategy === created.name);
    assert.ok(rows.some((row) => !row.copyUserId && row.option === "PE" && Number(row.strike) === 22750));
    assert.equal(rows.find((row) => !row.copyUserId).securityId, "pe-22750");
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setDhanFeed({ live: false });
  }
});

test("RMS insufficient funds holds this signal and sends on the next bar", async () => {
  drainPendingLiveAlgoOrders();
  const { createAlgo, deleteAlgo, getAlgo, toggleAlgo, withLiveAlgo, armLiveOrders } = await import("./market.js");
  armLiveOrders();
  const rms = "RMS:23826101487909:You have insufficient funds. Please add Rs.2385.80 to trade.";
  const barTime = Date.parse("2026-10-14T15:33:00.000Z");
  const nextBar = barTime + 15 * 60 * 1000;
  const created = createAlgo({
    name: `CRUDE funds ${Date.now()}`,
    kind: "crude-first-candle",
    symbol: "CRUDEOIL",
    runMode: "live",
  });
  try {
    toggleAlgo(created.id, { enabled: true });
    withLiveAlgo(created.id, (algo) => {
      noteLiveAlgoOrderResult(
        { strategy: algo.name, side: "BUY", option: "PE", strike: 9050, barTime },
        { status: "REJECTED", reason: rms },
        rms,
      );
    });
    const held = getAlgo(created.id);
    assert.match(String(held.lastSignal || ""), /MARGIN · add ₹2385\.80/);
    assert.equal(fundsHoldBlocks(held, barTime), true);
    const same = queueLiveAlgoOrder({
      strategy: held.name,
      side: "BUY",
      qty: 1,
      symbol: "CRUDEOIL 9050 PE",
      option: "PE",
      strike: 9050,
      brokerId: "dhan",
      barTime,
    });
    assert.equal(same.queued, false);
    assert.equal(same.status, "MARGIN");
    const next = queueLiveAlgoOrder({
      strategy: held.name,
      side: "BUY",
      qty: 1,
      symbol: "CRUDEOIL 9100 PE",
      option: "PE",
      strike: 9100,
      brokerId: "dhan",
      barTime: nextBar,
    });
    assert.equal(next.queued, true);
    drainPendingLiveAlgoOrders();
    replaceDhanOrders([
      {
        id: "dhan-rms-crude",
        symbol: "CRUDEOIL-15Oct2026-9050-PE",
        side: "BUY",
        qty: 1,
        filledQty: 0,
        price: 108.7,
        product: "INTRADAY",
        type: "LIMIT",
        status: "REJECTED",
        strategy: held.name,
        brokerId: "dhan",
        reason: rms,
        barTime,
      },
    ]);
    const afterFeed = getAlgo(created.id);
    assert.match(String(afterFeed.lastSignal || ""), /MARGIN · add ₹2385\.80/);
    assert.equal(
      queueLiveAlgoOrder({
        strategy: afterFeed.name,
        side: "BUY",
        qty: 1,
        symbol: "CRUDEOIL 9050 PE",
        option: "PE",
        strike: 9050,
        brokerId: "dhan",
        barTime,
      }).status,
      "MARGIN",
    );
  } finally {
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
  }
});

test("insufficient funds does not unlock the same candle after 20s", () => {
  drainPendingLiveAlgoOrders();
  const barTime = Date.now() - STALE_LIVE_SEND_MS - 1_000;
  const algo = {
    name: "CRUDE OIL",
    lastSignal: "MARGIN · add ₹2385.80",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: barTime,
      lastEntryBarTime: barTime,
      sentSignalBarTime: barTime,
      marginHoldBarTime: barTime,
    },
  };
  assert.equal(releaseStaleLiveSend(algo), false);
  assert.equal(algo.vwapState.lastEntryBarTime, barTime);
  assert.equal(algo.vwapState.marginHoldBarTime, barTime);
  assert.equal(algo.allowFreshLiveEntry, undefined);
});

test("a fresh SENDING is held while the flush can still run", () => {
  const algo = {
    name: "NIFTY",
    vwapState: {
      buyPhase: "entry",
      inFlight: true,
      lastEntryAt: Date.now(),
      lastEntryBarTime: Date.now(),
    },
  };
  assert.equal(releaseStaleLiveSend(algo), false);
  assert.equal(algo.vwapState.buyPhase, "entry");
  assert.equal(algo.vwapState.inFlight, true);
});

test("a drained send is put back when the broker flush throws", () => {
  drainPendingLiveAlgoOrders();
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22800,
    qty: 65,
    symbol: "NIFTY 22800 CE",
    brokerId: "dhan",
  });
  const drained = drainPendingLiveAlgoOrders();
  assert.ok(drained.length >= 1);
  assert.equal(drainPendingLiveAlgoOrders().length, 0);
  assert.ok(requeueLiveAlgoOrders(drained) >= 1);
  const again = drainPendingLiveAlgoOrders();
  assert.equal(again.length, drained.length);
  assert.equal(again[0].option, "CE");
  assert.equal(again[0].strike, 22800);
});

test("tick kick asks for the broker send without waiting for a later microtask", () => {
  drainPendingLiveAlgoOrders();
  let calls = 0;
  onLiveAlgoOrders(() => {
    calls += 1;
  });
  queueLiveAlgoOrder({
    strategy: "NIFTY 5m first candle",
    side: "BUY",
    option: "CE",
    strike: 22800,
    qty: 65,
    symbol: "NIFTY 22800 CE",
    brokerId: "dhan",
  });
  assert.ok(calls >= 1);
  const before = calls;
  kickLiveAlgoFlush();
  assert.ok(calls > before);
  onLiveAlgoOrders(() => {});
  drainPendingLiveAlgoOrders();
});

test("after a live buy no TGT limit is sent until the mark hits target or stop", () => {
  drainPendingLiveAlgoOrders();
  const open = {
    id: "p-22500pe",
    symbol: "NIFTY 22500 PE",
    qty: 65,
    avg: 111.45,
    ltp: 111.45,
    product: "MIS",
    securityId: "sec-22500pe",
    strike: 22500,
    option: "PE",
    expiry: "2026-10-06",
    brokerId: "dhan",
  };
  const resting = armLiveTarget({
    algo: { name: "NIFTY 5m first candle" },
    open,
    target: 155.99,
    mark: 111.45,
    mode: "live",
  });
  assert.equal(resting, false);
  const queued = drainPendingLiveAlgoOrders();
  assert.equal(queued.length, 0);
  assert.equal(
    queued.some((row) => row.side === "SELL" && row.role === "target"),
    false,
  );
});
