import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveQuotes,
  applySyntheticOptionChain,
  cacheOptionDesk,
  candleSymbol,
  clearSimulatedDesk,
  createAlgo,
  deleteAlgo,
  getCandles,
  getChainSpot,
  isCrudeSymbol,
  mcxMarketSession,
  nseMarketSession,
  liveSessionOpenForOrder,
  routeManualOrderBrokerId,
  optionRowsForSymbol,
  bookMemberCopyOnAdminDesk,
  drainPendingLiveAlgoOrders,
  getAlgo,
  noteLiveAlgoOrderResult,
  queueLiveAlgoOrder,
  replaceDhanOrders,
  resolveAlgoTrade,
  setCrudeFutureChartCandles,
  setDhanFeed,
  setLiveCandles,
  setOptionDesk,
  snapshot,
  tickMarket,
  toggleAlgo,
  hasLastLiveBook,
} from "./market.js";
import { hydrateAlgos, normalizeAlgo, seedAlgos } from "./strategies.js";

test("candleSymbol and isCrudeSymbol map Crude Oil ids", () => {
  assert.equal(candleSymbol("CRUDEOIL"), "CRUDEOIL");
  assert.equal(candleSymbol("CRUDE OIL"), "CRUDEOIL");
  assert.equal(candleSymbol("CRUDEOIL 6100 CE"), "CRUDEOIL");
  assert.equal(isCrudeSymbol("CRUDEOIL"), true);
  assert.equal(isCrudeSymbol("NIFTY"), false);
  assert.equal(candleSymbol("NIFTY 50"), "NIFTY");
});

test("MCX session is 09:00–23:30 IST on weekdays", () => {
  const fridayMorning = new Date("2026-09-18T03:30:00.000Z");
  const fridayEvening = new Date("2026-09-18T17:00:00.000Z");
  const fridayNight = new Date("2026-09-18T18:00:00.000Z");
  const saturday = new Date("2026-09-19T06:00:00.000Z");
  assert.equal(mcxMarketSession(fridayMorning).open, true);
  assert.equal(mcxMarketSession(fridayEvening).open, true);
  assert.equal(mcxMarketSession(fridayNight).open, false);
  assert.equal(mcxMarketSession(saturday).open, false);
  assert.equal(nseMarketSession(fridayEvening).open, false);
});

test("crude option-chain BUY stays live after NSE close", () => {
  const afterNse = new Date("2026-09-18T10:31:00.000Z");
  assert.equal(nseMarketSession(afterNse).open, false);
  assert.equal(mcxMarketSession(afterNse).open, true);
  assert.equal(liveSessionOpenForOrder({ symbol: "NIFTY 24600 CE", exchangeSegment: "NSE_FNO" }, afterNse), false);
  assert.equal(liveSessionOpenForOrder({ symbol: "CRUDEOIL 6100 CE", exchangeSegment: "MCX_COMM" }, afterNse), true);
});

test("option-chain BUY goes to Dhan when LIVE even if Paper is selected", () => {
  assert.equal(
    routeManualOrderBrokerId({ brokerId: "paper", kind: "option", securityId: "12345" }, { dhanLive: true }),
    "dhan",
  );
  assert.equal(
    routeManualOrderBrokerId({ brokerId: "paper", kind: "future" }, { dhanLive: true }),
    "dhan",
  );
  assert.equal(
    routeManualOrderBrokerId({ brokerId: "paper", kind: "option" }, { dhanLive: false }),
    "paper",
  );
  assert.equal(
    routeManualOrderBrokerId({ brokerId: "paper" }, { dhanLive: true }),
    "paper",
  );
});

test("nifty first candle ATM+2 and ATM-2 resolve to 22800 and 22600, not the ATM strike", () => {
  const expiry = "2026-10-06";
  setOptionDesk({
    symbol: "NIFTY",
    expiry,
    expiries: [expiry],
    spot: 22720,
    source: "dhan",
    rows: [
      { strike: 22600, atm: false, callLtp: 180, putLtp: 40, callId: "ce-22600", putId: "pe-22600" },
      { strike: 22700, atm: true, callLtp: 110, putLtp: 95, callId: "ce-22700", putId: "pe-22700" },
      { strike: 22800, atm: false, callLtp: 48, putLtp: 170, callId: "ce-22800", putId: "pe-22800" },
    ],
  });
  const plus = normalizeAlgo({ name: "NIFTY 5m first candle", kind: "nifty-first-candle", strikeOffset: 2 });
  const plusTrade = resolveAlgoTrade(plus);
  assert.equal(plusTrade.strike, 22800);
  assert.equal(plusTrade.securityId, "ce-22800");
  assert.match(String(plusTrade.symbol), /22800/);
  assert.doesNotMatch(String(plusTrade.symbol), /22700/);

  const minus = normalizeAlgo({ name: "NIFTY 5m first candle", kind: "nifty-first-candle", strikeOffset: -2 });
  const minusTrade = resolveAlgoTrade(minus);
  assert.equal(minusTrade.strike, 22600);
  assert.equal(minusTrade.securityId, "ce-22600");
  assert.match(String(minusTrade.symbol), /22600/);
});

test("resolveAlgoTrade uses the CRUDEOIL option chain and keeps it after switching to NIFTY", () => {
  applySyntheticOptionChain("CRUDEOIL");
  const algo = normalizeAlgo({
    name: "CRUDE OIL VWAP ATM",
    kind: "indicator",
    symbol: "CRUDEOIL",
    instrument: "option",
    optionType: "CE",
    indicator: "VWAP",
  });
  const trade = resolveAlgoTrade(algo);
  assert.equal(trade.kind, "option");
  assert.equal(trade.option, "CE");
  assert.match(String(trade.symbol), /CRUDEOIL/);
  assert.equal(Number(trade.strike) > 0, true);
  assert.equal(optionRowsForSymbol("CRUDEOIL").length > 0, true);
  applySyntheticOptionChain("NIFTY");
  const cached = resolveAlgoTrade(algo);
  assert.match(String(cached.symbol), /CRUDEOIL/);
  assert.equal(optionRowsForSymbol("CRUDEOIL").length > 0, true);
});

test("cacheOptionDesk stores Crude Oil chain without changing the visible NIFTY desk", () => {
  applySyntheticOptionChain("NIFTY");
  cacheOptionDesk({
    symbol: "CRUDEOIL",
    expiry: "2026-09-17",
    expiries: ["2026-09-17", "2026-10-16"],
    rows: [
      { strike: 6100, atm: true, callLtp: 42.5, putLtp: 38.1, callId: "c-6100", putId: "p-6100" },
      { strike: 6150, atm: false, callLtp: 28.4, putLtp: 51.2, callId: "c-6150", putId: "p-6150" },
    ],
    spot: 6124,
    source: "dhan",
  });
  const algo = normalizeAlgo({
    name: "CRUDE OIL Supertrend ATM",
    kind: "indicator",
    symbol: "CRUDEOIL",
    instrument: "option",
    optionType: "CE",
    indicator: "SUPERTREND",
  });
  const trade = resolveAlgoTrade(algo);
  assert.equal(trade.kind, "option");
  assert.match(String(trade.symbol), /CRUDEOIL/);
  assert.equal(trade.strike, 6100);
  assert.equal(trade.ltp, 42.5);
  assert.equal(trade.source, "dhan");
  assert.equal(trade.ready, true);
});

test("crude first candle copies the nifty candle rule and uses the CRUDEOIL option scrip", () => {
  const niftyExpiry = "2026-10-06";
  const crudeExpiry = "2026-10-19";
  applyLiveQuotes([{ symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 6120, securityId: "426268" }]);
  setOptionDesk({
    symbol: "NIFTY",
    expiry: niftyExpiry,
    rows: [{ strike: 6100, atm: false, callLtp: 9, putLtp: 9, callId: "nifty-ce-6100", putId: "nifty-pe-6100" }],
    source: "dhan",
  });
  cacheOptionDesk({
    symbol: "CRUDEOIL",
    expiry: crudeExpiry,
    expiries: [crudeExpiry],
    rows: [{ strike: 6100, atm: true, callLtp: 40, putLtp: 50, callId: "crude-ce-6100", putId: "crude-pe-6100" }],
    spot: 6120,
    source: "dhan",
  });
  const savedAsIndicator = normalizeAlgo({
    name: "CRUDE OIL 5m first candle",
    kind: "indicator",
    symbol: "NIFTY",
    indicator: "VWAP",
    buyLeft: "price",
    buyOp: "close_above",
    buyRight: "vwap",
    sellLeft: "price",
    sellOp: "close_below",
    sellRight: "vwap",
    pattern: "ORB",
  });
  assert.equal(savedAsIndicator.kind, "crude-first-candle");
  assert.equal(savedAsIndicator.symbol, "CRUDEOIL");
  assert.equal(savedAsIndicator.indicator, "CRUDE_FIRST_CANDLE");
  assert.equal(savedAsIndicator.buyOp, undefined);
  assert.equal(savedAsIndicator.pattern, undefined);
  assert.equal(savedAsIndicator.enabled, false);
  const trade = resolveAlgoTrade(savedAsIndicator);
  assert.equal(trade.securityId, "crude-ce-6100");
  assert.equal(trade.strike, 6100);
  assert.match(String(trade.symbol), /^CRUDEOIL 6100/);
  const nifty = normalizeAlgo({ name: "NIFTY 5m first candle", kind: "nifty-first-candle" });
  const niftyTrade = resolveAlgoTrade(nifty);
  assert.match(String(niftyTrade.symbol), /^NIFTY /);
  assert.notEqual(niftyTrade.securityId, "crude-ce-6100");

  const open0900 = Date.parse("2026-09-29T03:30:00.000Z");
  const open0905 = open0900 + 5 * 60_000;
  const duringFirst = open0900 + 2 * 60_000;
  const duringNext = open0905 + 2 * 60_000;
  const realNow = Date.now;
  const created = createAlgo({
    name: "CRUDE first candle scrip",
    kind: "indicator",
    symbol: "NIFTY",
    indicator: "VWAP",
    buyLeft: "price",
    buyOp: "close_above",
    buyRight: "vwap",
    runMode: "paper",
  });
  Date.now = () => duringFirst;
  setDhanFeed({ live: true, source: "websocket", lastTickAt: duringFirst });
  try {
    assert.equal(created.kind, "crude-first-candle");
    assert.equal(created.enabled, false);
    setCrudeFutureChartCandles([{ time: open0900, open: 6100, high: 6130, low: 6090, close: 6120, volume: 20 }]);
    const started = toggleAlgo(created.id, { enabled: true });
    assert.equal(started.status, "PAPER");
    assert.equal(started.enabled, true);
    tickMarket();
    tickMarket();
    cacheOptionDesk({
      symbol: "CRUDEOIL",
      expiry: crudeExpiry,
      expiries: [crudeExpiry],
      rows: [{ strike: 6100, atm: true, callLtp: 48, putLtp: 44, callId: "crude-ce-6100", putId: "crude-pe-6100" }],
      spot: 6120,
      source: "dhan",
    });
    tickMarket();
    Date.now = () => duringNext;
    setCrudeFutureChartCandles([
      { time: open0900, open: 6100, high: 6130, low: 6090, close: 6120, volume: 20 },
      { time: open0905, open: 6120, high: 6128, low: 6116, close: 6124, volume: 8 },
    ]);
    tickMarket();
    const desk = snapshot();
    const algo = desk.algos.find((row) => row.id === created.id);
    const order = desk.orders.find((row) => row.strategy === "CRUDE first candle scrip" && row.side === "BUY");
    assert.equal(algo.kind, "crude-first-candle");
    assert.equal(algo.buyOp, undefined);
    assert.match(String(algo.lastSignal || ""), /PREVIEW CRUDE FUT GREEN/, String(algo.lastSignal || ""));
    assert.equal(order?.symbol, "CRUDEOIL 6100 CE", String(algo.lastSignal || ""));
    assert.equal(order.securityId, "crude-ce-6100");
    assert.notEqual(order.securityId, "nifty-ce-6100");
    assert.equal(desk.orders.filter((row) => row.strategy === "CRUDE first candle scrip" && row.side === "BUY").length, 1);
  } finally {
    Date.now = realNow;
    toggleAlgo(created.id, { enabled: false });
    deleteAlgo(created.id);
    setCrudeFutureChartCandles([]);
    setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  }
});

test("crude live order keeps the CRUDEOIL contract while the desk shows NIFTY", () => {
  const crudeExpiry = "2026-10-19";
  setOptionDesk({
    symbol: "NIFTY",
    expiry: "2026-10-06",
    rows: [{ strike: 22650, atm: true, callLtp: 120, putLtp: 110, callId: "nifty-ce-22650", putId: "nifty-pe-22650" }],
    source: "dhan",
  });
  cacheOptionDesk({
    symbol: "CRUDEOIL",
    expiry: crudeExpiry,
    expiries: [crudeExpiry],
    rows: [{ strike: 6100, atm: true, callLtp: 42.5, putLtp: 38.1, callId: "crude-ce-6100", putId: "crude-pe-6100" }],
    spot: 6120,
    source: "dhan",
  });
  drainPendingLiveAlgoOrders();
  const queuedResult = queueLiveAlgoOrder({
    strategy: "CRUDE OIL broker send",
    side: "BUY",
    symbol: "CRUDEOIL 6100 CE",
    qty: 100,
    lots: 1,
    lotSize: 100,
    price: 42.5,
    option: "CE",
    strike: 6100,
    expiry: crudeExpiry,
    kind: "option",
    exchangeSegment: "MCX_COMM",
    brokerId: "dhan",
  });
  assert.equal(queuedResult.queued, true);
  const queued = drainPendingLiveAlgoOrders();
  const admin = queued.find((row) => row.strategy === "CRUDE OIL broker send" && !row.copyUserId);
  assert.equal(admin.securityId, "crude-ce-6100");
  assert.equal(admin.symbol, "CRUDEOIL 6100 CE");
  assert.equal(admin.exchangeSegment, "MCX_COMM");
  assert.equal(admin.qty, 100);
  assert.equal(admin.lotSize, 100);
  for (const copy of queued.filter((row) => row.copyUserId && row.strategy === "CRUDE OIL broker send")) {
    assert.equal(copy.securityId, "crude-ce-6100");
    assert.equal(copy.symbol, "CRUDEOIL 6100 CE");
    assert.equal(copy.exchangeSegment, "MCX_COMM");
  }
});

test("getCandles keeps NIFTY and CRUDEOIL live bars separate", () => {
  const nifty = [{ time: 1, open: 24500, high: 24510, low: 24490, close: 24505, volume: 10 }];
  const crude = [{ time: 1, open: 6100, high: 6110, low: 6090, close: 6108, volume: 8 }];
  setLiveCandles(nifty, "NIFTY");
  setLiveCandles(crude, "CRUDEOIL");
  setDhanFeed({ live: true });
  try {
    assert.equal(getCandles("1m", "NIFTY")[0].close, 24505);
    assert.equal(getCandles("1m", "CRUDEOIL")[0].close, 6108);
    assert.notEqual(getCandles("1m", "NIFTY")[0].close, getCandles("1m", "CRUDEOIL")[0].close);
  } finally {
    setDhanFeed({ live: false });
  }
});

test("seed catalog hydrates the crude first-candle strategy onto a NIFTY-only desk", () => {
  const catalog = seedAlgos();
  const saved = catalog.filter((row) => row.id === "a10");
  const next = hydrateAlgos({ algos: saved, removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a12"), true);
  assert.equal(next.algos.find((row) => row.id === "a12").enabled, false);
  assert.equal(next.algos.find((row) => row.id === "a12").kind, "crude-first-candle");
  assert.equal(next.algos.some((row) => row.kind === "indicator"), false);
});

test("switching option desk does not keep the previous underlying strikes", () => {
  applySyntheticOptionChain("NIFTY");
  const niftyStrike = snapshot().optionChain[0]?.strike;
  assert.equal(Number(niftyStrike) > 20000, true);
  cacheOptionDesk({
    symbol: "CRUDEOIL",
    expiry: "2026-09-17",
    expiries: ["2026-09-17"],
    rows: [
      { strike: 6100, atm: true, callLtp: 42.5, putLtp: 38.1, callId: "c-6100", putId: "p-6100" },
    ],
    spot: 6124,
    source: "dhan",
  });
  setOptionDesk({ symbol: "CRUDEOIL", expiry: "2026-09-17", rows: [] });
  const desk = snapshot();
  assert.equal(desk.optionMeta.symbol, "CRUDEOIL");
  assert.equal(desk.optionChain[0].strike, 6100);
  assert.notEqual(desk.optionChain[0].strike, niftyStrike);
});

test("same-symbol option feed keeps the open strike window", () => {
  applySyntheticOptionChain("NIFTY");
  const first = snapshot().optionChain.map((row) => row.strike);
  assert.equal(first.length > 5, true);
  const shifted = [
    { strike: first[0] - 50, atm: false, callLtp: 1, putLtp: 1 },
    ...snapshot().optionChain.map((row, index) => ({
      ...row,
      atm: index === 2,
      callLtp: Number(row.callLtp) + 1,
    })),
    { strike: first[first.length - 1] + 50, atm: false, callLtp: 1, putLtp: 1 },
  ];
  setOptionDesk({
    symbol: "NIFTY",
    expiry: snapshot().optionMeta.expiry,
    rows: shifted,
  });
  const second = snapshot().optionChain.map((row) => row.strike);
  assert.deepEqual(second, first);
  assert.equal(snapshot().optionChain[0].callLtp, shifted[1].callLtp);
});

test("tickMarket keeps last Dhan quotes after the feed stops", () => {
  applyLiveQuotes([{ symbol: "NIFTY 50", parent: "NIFTY 50", ltp: 24880, kind: "index" }]);
  setOptionDesk({
    symbol: "NIFTY",
    expiry: snapshot().optionMeta.expiry,
    rows: snapshot().optionChain.map((row, index) => ({ ...row, callLtp: 111 + index, putLtp: 88 + index })),
    source: "dhan",
  });
  setDhanFeed({ live: false, source: "rest", lastTickAt: Date.now() });
  const before = snapshot();
  const nifty = before.indices.find((row) => row.symbol === "NIFTY 50");
  const callLtp = before.optionChain[0].callLtp;
  assert.equal(hasLastLiveBook(), true);
  tickMarket();
  tickMarket();
  const after = snapshot();
  assert.equal(after.indices.find((row) => row.symbol === "NIFTY 50")?.price, nifty?.price);
  assert.equal(after.optionChain[0].callLtp, callLtp);
  assert.equal(after.optionMeta.source, "dhan");
  assert.equal(after.dhanFeed.hasQuotes, true);
  setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  applySyntheticOptionChain("NIFTY");
});

test("tickMarket never invents DEMO prices", () => {
  applyLiveQuotes([{ symbol: "NIFTY 50", parent: "NIFTY 50", ltp: 25001, kind: "index" }]);
  setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  const before = snapshot().indices.find((row) => row.symbol === "NIFTY 50")?.price;
  assert.equal(before, 25001);
  tickMarket();
  tickMarket();
  assert.equal(snapshot().indices.find((row) => row.symbol === "NIFTY 50")?.price, 25001);
});

test("getChainSpot does not use Crude Oil desk spot for NIFTY algos", () => {
  applySyntheticOptionChain("CRUDEOIL");
  applyLiveQuotes([{ symbol: "NIFTY 50", parent: "NIFTY 50", ltp: 24850, kind: "index" }]);
  cacheOptionDesk({
    symbol: "NIFTY",
    expiry: "2026-09-22",
    expiries: ["2026-09-22"],
    rows: [{ strike: 24850, atm: true, callLtp: 120, putLtp: 110, callId: "c-24850", putId: "p-24850" }],
    spot: 24850,
    source: "dhan",
  });
  const niftySpot = getChainSpot("NIFTY");
  const crudeSpot = getChainSpot("CRUDEOIL");
  assert.equal(crudeSpot > 1000 && crudeSpot < 20000, true);
  assert.notEqual(niftySpot, crudeSpot);
  assert.equal(niftySpot, 24850);
  const algo = normalizeAlgo({ name: "NIFTY VWAP ATM spot", kind: "nifty-vwap" });
  const trade = resolveAlgoTrade(algo);
  assert.equal(trade.strike, 24850);
  assert.match(String(trade.symbol), /NIFTY 24850/);
});

test("clearSimulatedDesk keeps real Dhan candles so algos can still fire", () => {
  const nifty = [{ time: 1, open: 24500, high: 24510, low: 24490, close: 24505, volume: 10 }];
  setLiveCandles(nifty, "NIFTY");
  clearSimulatedDesk();
  const kept = getCandles("1m", "NIFTY");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].close, 24505);
});

test("tickMarket still evaluates live algos from last Dhan quotes when the socket is down", () => {
  applyLiveQuotes([{ symbol: "NIFTY 50", parent: "NIFTY 50", ltp: 24880, kind: "index" }]);
  setOptionDesk({
    symbol: "NIFTY",
    expiry: snapshot().optionMeta.expiry,
    rows: snapshot().optionChain,
    source: "dhan",
  });
  setDhanFeed({ live: false, source: "rest", lastTickAt: Date.now() });
  const liveAlgo = snapshot().algos.find((row) => row.enabled && row.runMode === "live");
  tickMarket();
  if (liveAlgo) {
    const after = snapshot().algos.find((row) => row.id === liveAlgo.id);
    assert.equal(typeof after?.lastSignal, "string");
    assert.notEqual(String(after.lastSignal || "").trim(), "");
  }
});

test("a mapped user refusal does not change the crude strategy signal", () => {
  const created = createAlgo({
    name: "CRUDE copy refuse",
    kind: "crude-first-candle",
    symbol: "CRUDEOIL",
    runMode: "live",
  });
  try {
    noteLiveAlgoOrderResult(
      { strategy: created.name, side: "BUY", option: "CE", copyUserId: "u-copy" },
      { status: "REJECTED" },
      new Error("This member has no Dhan Client ID + Access Token"),
    );
    assert.equal(getAlgo(created.id)?.lastSignal || "", "");
  } finally {
    deleteAlgo(created.id);
  }
});

test("a user copy stays on the admin order book after the Dhan refresh", () => {
  const booked = bookMemberCopyOnAdminDesk(
    {
      copyUserId: "u-show",
      symbol: "CRUDEOIL 6100 CE",
      side: "BUY",
      qty: 100,
      price: 42.5,
      type: "LIMIT",
      strategy: "CRUDE OIL 5m first candle",
      brokerId: "dhan",
      securityId: "crude-ce-6100",
      exchangeSegment: "MCX_COMM",
    },
    { error: new Error("This member has no Dhan Client ID + Access Token. Install them on My plan.") },
  );
  assert.equal(booked.status, "REJECTED");
  assert.equal(booked.copyUserId, "u-show");
  assert.equal(booked.securityId, "crude-ce-6100");
  assert.match(booked.reason, /Access Token/);
  replaceDhanOrders([
    {
      id: "admin-crude-1",
      symbol: "CRUDEOIL 6100 CE",
      side: "BUY",
      qty: 100,
      status: "PENDING",
      brokerId: "dhan",
      live: true,
      price: 42.5,
    },
  ]);
  const orders = snapshot().orders;
  assert.ok(orders.some((row) => row.id === "admin-crude-1"));
  assert.ok(orders.some((row) => row.copyUserId === "u-show" && row.status === "REJECTED" && row.symbol === "CRUDEOIL 6100 CE"));
});
