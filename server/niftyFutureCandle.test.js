import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveQuotes,
  createAlgo,
  crudeFuturePreviewBar,
  crudeFutureSignalBars,
  deleteAlgo,
  drainPendingLiveAlgoOrders,
  formatLiveFuturePreview,
  niftyFuturePreviewBar,
  niftyFutureSignalBars,
  peekNiftyFutureBars,
  setCrudeFutureChartCandles,
  setDhanFeed,
  setLiveCandles,
  setNiftyFutureChartCandles,
  setOptionDesk,
  snapshot,
  tickMarket,
  toggleAlgo,
} from "./market.js";

const OPEN_0915 = Date.parse("2026-09-29T03:45:00.000Z");
const FIVE = 5 * 60 * 1000;

function minute(i, open, close) {
  return {
    time: OPEN_0915 + i * 60_000,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 10,
  };
}

test("first candle uses the Nifty future 5m candle, not the index tape", () => {
  const futureMinutes = [
    minute(0, 22663, 22658),
    minute(1, 22658, 22655),
    minute(2, 22655, 22652),
    minute(3, 22652, 22650),
    minute(4, 22650, 22647.5),
    minute(5, 22647.5, 22640),
  ];
  setNiftyFutureChartCandles(futureMinutes);
  setLiveCandles(
    [
      {
        time: OPEN_0915,
        open: 22678.6,
        high: 22690,
        low: 22660,
        close: 22668.5,
        volume: 1,
      },
    ],
    "NIFTY",
    "INDEX",
  );
  const closed = niftyFutureSignalBars("5m", OPEN_0915 + FIVE);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].time, OPEN_0915);
  assert.equal(closed[0].open, 22663);
  assert.equal(closed[0].close, 22647.5);

  applyLiveQuotes([
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22678.6, open: 22678.6, high: 22690, low: 22660 },
  ]);
  const afterIndex = niftyFutureSignalBars("5m", OPEN_0915 + FIVE);
  assert.equal(afterIndex[0].open, 22663);
  assert.equal(afterIndex[0].close, 22647.5);
  setNiftyFutureChartCandles([]);
  setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
});

test("live preview candle keeps its own open and close while the 5m bar is still forming", () => {
  const start = OPEN_0915;
  const now = start + FIVE + 60_000;
  setNiftyFutureChartCandles([
    { time: start, open: 22678.6, high: 22690, low: 22660, close: 22668.5, volume: 20 },
    { time: start + FIVE, open: 22663, high: 22670, low: 22647.5, close: 22647.5, volume: 12 },
  ]);
  const preview = niftyFuturePreviewBar("5m", now);
  assert.equal(preview.open, 22663);
  assert.equal(preview.close, 22647.5);
  assert.equal(
    formatLiveFuturePreview(preview, 5),
    "LIVE NIFTY FUT RED O 22663.00 C 22647.50 · 09:20–09:25 IST · WAIT PE",
  );
  assert.equal(
    formatLiveFuturePreview(
      preview,
      5,
      {
        ce: { open: 120, close: 100 },
        pe: { open: 80, close: 95 },
      },
    ),
    "LIVE NIFTY FUT RED CE RED PE GREEN O 22663.00 C 22647.50 · 09:20–09:25 IST · BUY PE",
  );
  assert.equal(
    formatLiveFuturePreview(
      preview,
      5,
      {
        ce: { open: 120, close: 140 },
        pe: { open: 90, close: 70 },
        ceStrike: 22550,
        peStrike: 22550,
      },
    ),
    "LIVE NIFTY FUT RED CE 22550 GREEN PE 22550 RED O 22663.00 C 22647.50 · 09:20–09:25 IST · NO TRADE PE 22550 RED",
  );
  const closed = niftyFutureSignalBars("5m", now);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].open, 22678.6);
  assert.equal(closed[0].close, 22668.5);
  setNiftyFutureChartCandles([]);
});

test("official Nifty future 5m open stays put when the index and the future tick", () => {
  const now = Date.now();
  const start = now - (now % FIVE) - FIVE;
  const official = [
    { time: start, open: 22663, high: 22670, low: 22647.5, close: 22647.5, volume: 20 },
    { time: start + FIVE, open: 22647.5, high: 22655, low: 22640, close: 22650, volume: 20 },
  ];
  setNiftyFutureChartCandles(official);
  setLiveCandles(official, "NIFTY", "FUTIDX");
  applyLiveQuotes([
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 22678.6, open: 22678.6 },
  ]);
  const afterIndex = peekNiftyFutureBars();
  assert.equal(afterIndex[0].open, 22663);
  assert.equal(afterIndex[0].close, 22647.5);
  assert.equal(afterIndex[1].open, 22647.5);

  applyLiveQuotes([
    { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22652, securityId: "58072" },
  ]);
  const afterFuture = peekNiftyFutureBars();
  assert.equal(afterFuture[1].open, 22647.5);
  assert.equal(afterFuture.length, 2);
  const printed = niftyFutureSignalBars("5m", now);
  const shown = printed.find((bar) => bar.time === start);
  assert.equal(shown.open, 22663);
  assert.equal(shown.close, 22647.5);
  setNiftyFutureChartCandles([]);
  setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
});

test("a Dhan 15:05 stamp is the 15:00-15:05 candle, and the buy uses the current 15:05 candle", () => {
  const close0920 = OPEN_0915 + FIVE;
  const close1505 = Date.parse("2026-09-29T09:35:00.000Z");
  const open1500 = close1505 - FIVE;
  const open1505 = close1505;
  const now = Date.parse("2026-09-29T09:37:00.000Z");
  const realNow = Date.now;
  Date.now = () => now;
  try {
    setNiftyFutureChartCandles([
      { time: close0920, open: 22600, high: 22620, low: 22590, close: 22610, volume: 10 },
      { time: close1505, open: 22665, high: 22680, low: 22660, close: 22672.4, volume: 12 },
    ]);
    const stored = peekNiftyFutureBars();
    assert.equal(stored[1].time, open1500);
    assert.equal(stored[1].open, 22665);
    assert.equal(stored[1].close, 22672.4);
    applyLiveQuotes([
      { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22660, securityId: "58072" },
    ]);
    applyLiveQuotes([
      { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 22655, securityId: "58072" },
    ]);
    const preview = niftyFuturePreviewBar("5m", now);
    assert.equal(preview.time, open1505);
    assert.equal(preview.open, 22660);
    assert.equal(preview.close, 22655);
    const text = formatLiveFuturePreview(preview, 5);
    assert.match(text, /NIFTY FUT RED/);
    assert.match(text, /15:05–15:10 IST/);
    assert.doesNotMatch(text, /BUY CE/);
    const previous = peekNiftyFutureBars().find((bar) => bar.time === open1500);
    assert.equal(previous.open, 22665);
    assert.equal(previous.close, 22672.4);
  } finally {
    Date.now = realNow;
    setNiftyFutureChartCandles([]);
    setLiveCandles([{ time: Date.now(), open: 1, high: 1, low: 1, close: 1, volume: 1 }], "NIFTY");
  }
});

test("crude future 5m close stamp keeps that candle open and close", () => {
  const open0900 = Date.parse("2026-09-29T03:30:00.000Z");
  const close0905 = open0900 + FIVE;
  const close0910 = close0905 + FIVE;
  const open0910 = close0910;
  const now = open0910 + 2 * 60_000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    setCrudeFutureChartCandles([
      { time: close0905, open: 6100, high: 6130, low: 6090, close: 6120, volume: 30 },
      { time: close0910, open: 6120, high: 6134, low: 6110, close: 6115, volume: 18 },
    ]);
    const closed = crudeFutureSignalBars("5m", now);
    const checked = closed[closed.length - 1];
    assert.equal(checked.time, close0905);
    assert.equal(checked.open, 6120);
    assert.equal(checked.close, 6115);
    assert.equal(closed[0].open, 6100);
    assert.equal(closed[0].close, 6120);
    applyLiveQuotes([
      { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 6111, securityId: "426268" },
    ]);
    applyLiveQuotes([
      { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 6104, securityId: "426268" },
    ]);
    const afterTick = crudeFutureSignalBars("5m", now);
    assert.equal(afterTick[afterTick.length - 1].open, 6120);
    assert.equal(afterTick[afterTick.length - 1].close, 6115);
    const forming = crudeFuturePreviewBar("5m", now);
    assert.equal(forming.time, open0910);
    assert.equal(forming.open, 6111);
    assert.equal(forming.close, 6104);
    const text = formatLiveFuturePreview(afterTick[afterTick.length - 1], 5, {}, "CRUDE FUT").replace(/^LIVE /, "PREVIEW ");
    assert.match(text, /CRUDE FUT RED/);
    assert.match(text, /O 6120\.00 C 6115\.00/);
    assert.match(text, /09:05–09:10 IST/);
    setCrudeFutureChartCandles([
      { time: close0905, open: 6100, high: 6130, low: 6090, close: 6120, volume: 30 },
      { time: close0910, open: 6120, high: 6134, low: 6110, close: 6115, volume: 18 },
    ]);
    assert.equal(crudeFutureSignalBars("5m", now).at(-1).close, 6115);
    assert.equal(crudeFuturePreviewBar("5m", now).open, 6111);
  } finally {
    Date.now = realNow;
    setCrudeFutureChartCandles([]);
  }
});

test("changing the strategy to 15m builds 15-minute candles from 09:00", () => {
  const open0900 = Date.parse("2026-09-29T03:30:00.000Z");
  const five = 5 * 60 * 1000;
  setNiftyFutureChartCandles([
    { time: open0900, open: 100, high: 110, low: 99, close: 108, volume: 1 },
    { time: open0900 + five, open: 108, high: 112, low: 107, close: 111, volume: 1 },
    { time: open0900 + 2 * five, open: 111, high: 115, low: 110, close: 114, volume: 1 },
    { time: open0900 + 3 * five, open: 114, high: 120, low: 113, close: 118, volume: 1 },
  ]);
  const bars = niftyFutureSignalBars("15m", open0900 + 6 * five, {
    sessionOpenMinutes: 9 * 60,
    sessionCloseMinutes: 15 * 60 + 30,
  });
  assert.equal(bars.length, 2);
  assert.equal(bars[0].time, open0900);
  assert.equal(bars[0].open, 100);
  assert.equal(bars[0].close, 114);
  assert.equal(bars[1].time, open0900 + 3 * five);
  assert.equal(bars[1].open, 114);
  assert.equal(bars[1].close, 118);
  setNiftyFutureChartCandles([]);
});

test("paused NIFTY and CRUDE OIL always show future candle green or red", () => {
  const open0900 = Date.parse("2026-09-29T03:30:00.000Z");
  const now = open0900 + FIVE + 60_000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    setNiftyFutureChartCandles([
      { time: open0900, open: 22600, high: 22680, low: 22590, close: 22670, volume: 20 },
    ]);
    setCrudeFutureChartCandles([
      { time: open0900, open: 6120, high: 6130, low: 6090, close: 6100, volume: 20 },
    ]);
    const desk = snapshot();
    if (!desk.algos.some((row) => row.kind === "nifty-first-candle")) {
      createAlgo({ name: "NIFTY", kind: "nifty-first-candle", runMode: "live" });
    }
    if (!desk.algos.some((row) => row.kind === "crude-first-candle")) {
      createAlgo({ name: "CRUDE OIL", kind: "crude-first-candle", runMode: "live" });
    }
    tickMarket();
    const after = snapshot();
    const nifty = after.algos.find((row) => row.kind === "nifty-first-candle");
    const crude = after.algos.find((row) => row.kind === "crude-first-candle");
    assert.equal(nifty.name, "NIFTY");
    assert.equal(crude.name, "CRUDE OIL");
    assert.equal(nifty.futureColor, "green");
    assert.equal(crude.futureColor, "red");
    assert.match(String(nifty.lastSignal || ""), /NIFTY FUT GREEN/);
    assert.match(String(crude.lastSignal || ""), /CRUDE FUT RED/);
  } finally {
    Date.now = realNow;
    setNiftyFutureChartCandles([]);
    setCrudeFutureChartCandles([]);
  }
});

const WEEKLY_EXPIRY = "2026-10-01";
const OPEN_1420 = Date.parse("2026-09-29T08:50:00.000Z");

function niftyRedFutDesk(now) {
  Date.now = () => now;
  setDhanFeed({ live: true, source: "websocket", lastTickAt: now });
  setNiftyFutureChartCandles([
    { time: OPEN_1420, open: 22302, high: 22310, low: 22290, close: 22293, volume: 20 },
  ]);
  setOptionDesk({
    symbol: "NIFTY",
    expiry: WEEKLY_EXPIRY,
    expiries: [WEEKLY_EXPIRY],
    rows: [{ strike: 22300, atm: true, callLtp: 120, putLtp: 80, callId: "ce-22300", putId: "pe-22300" }],
    spot: 22293,
    source: "dhan",
  });
}

test("NIFTY FUT RED + ATM PE green sends BUY PE after the 5m close", () => {
  const during1420 = OPEN_1420 + 2 * 60_000;
  const after1425 = OPEN_1420 + FIVE + 60_000;
  const realNow = Date.now;
  const created = createAlgo({
    name: "NIFTY wait PE send",
    kind: "nifty-first-candle",
    runMode: "paper",
    expiryKind: "weekly",
  });
  try {
    niftyRedFutDesk(during1420);
    toggleAlgo(created.id, { enabled: true });
    tickMarket();
    setOptionDesk({
      symbol: "NIFTY",
      expiry: WEEKLY_EXPIRY,
      expiries: [WEEKLY_EXPIRY],
      rows: [{ strike: 22300, atm: true, callLtp: 110, putLtp: 95, callId: "ce-22300", putId: "pe-22300" }],
      spot: 22293,
      source: "dhan",
    });
    tickMarket();
    Date.now = () => after1425;
    setDhanFeed({ live: true, source: "websocket", lastTickAt: after1425 });
    setNiftyFutureChartCandles([
      { time: OPEN_1420, open: 22302, high: 22310, low: 22290, close: 22293, volume: 20 },
      { time: OPEN_1420 + FIVE, open: 22293, high: 22300, low: 22280, close: 22285, volume: 8 },
    ]);
    tickMarket();
    const desk = snapshot();
    const algo = desk.algos.find((row) => row.id === created.id);
    const order = desk.orders.find(
      (row) =>
        String(row.side || "").toUpperCase() === "BUY" &&
        (/22300 PE/.test(String(row.symbol || "")) || row.option === "PE" && Number(row.strike) === 22300),
    );
    assert.ok(order, String(algo?.lastSignal || ""));
    assert.match(String(order.symbol || `${order.strike} ${order.option}`), /22300 PE/);
    assert.match(String(algo.lastSignal || ""), /BUY 22300 PE/, String(algo.lastSignal || ""));
    assert.doesNotMatch(String(algo.lastSignal || ""), /WAIT PE/);
  } finally {
    Date.now = realNow;
    toggleAlgo(created.id, { enabled: false });
    deleteAlgo(created.id);
    setNiftyFutureChartCandles([]);
    setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  }
});

test("NIFTY first-candle live still sends BUY PE when T2S_SKIP_LIVE_ALGOS is on", () => {
  const prevSkip = process.env.T2S_SKIP_LIVE_ALGOS;
  process.env.T2S_SKIP_LIVE_ALGOS = "1";
  const during1420 = OPEN_1420 + 2 * 60_000;
  const after1425 = OPEN_1420 + FIVE + 60_000;
  const realNow = Date.now;
  const created = createAlgo({
    name: "NIFTY live skip PE send",
    kind: "nifty-first-candle",
    runMode: "live",
    expiryKind: "weekly",
  });
  drainPendingLiveAlgoOrders();
  try {
    niftyRedFutDesk(during1420);
    toggleAlgo(created.id, { enabled: true });
    tickMarket();
    setOptionDesk({
      symbol: "NIFTY",
      expiry: WEEKLY_EXPIRY,
      expiries: [WEEKLY_EXPIRY],
      rows: [{ strike: 22300, atm: true, callLtp: 110, putLtp: 95, callId: "ce-22300", putId: "pe-22300" }],
      spot: 22293,
      source: "dhan",
    });
    tickMarket();
    Date.now = () => after1425;
    setDhanFeed({ live: true, source: "websocket", lastTickAt: after1425 });
    setNiftyFutureChartCandles([
      { time: OPEN_1420, open: 22302, high: 22310, low: 22290, close: 22293, volume: 20 },
      { time: OPEN_1420 + FIVE, open: 22293, high: 22300, low: 22280, close: 22285, volume: 8 },
    ]);
    tickMarket();
    const desk = snapshot();
    const algo = desk.algos.find((row) => row.id === created.id);
    const queued = drainPendingLiveAlgoOrders().filter(
      (row) => row.strategy === "NIFTY live skip PE send" && row.side === "BUY" && !row.copyUserId,
    );
    assert.equal(queued.length >= 1, true, String(algo?.lastSignal || ""));
    assert.equal(queued[0].option, "PE");
    assert.equal(Number(queued[0].strike), 22300);
    assert.match(String(algo.lastSignal || ""), /BUY/, String(algo.lastSignal || ""));
    assert.doesNotMatch(String(algo.lastSignal || ""), /WAIT PE/);
  } finally {
    if (prevSkip == null) delete process.env.T2S_SKIP_LIVE_ALGOS;
    else process.env.T2S_SKIP_LIVE_ALGOS = prevSkip;
    Date.now = realNow;
    toggleAlgo(created.id, { enabled: false });
    deleteAlgo(created.id);
    drainPendingLiveAlgoOrders();
    setNiftyFutureChartCandles([]);
    setDhanFeed({ live: false, source: "idle", lastTickAt: null });
  }
});
