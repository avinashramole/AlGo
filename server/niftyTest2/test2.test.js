import assert from "node:assert/strict";
import test from "node:test";
import { buildSyntheticChain } from "../optionChain.js";
import { defaultNiftyTest2Algo, isNiftyTest2Algo, niftyTest2Config } from "../niftyVwap/config.js";
import { normalizeAlgo, seedAlgos } from "../strategies.js";
import { writeRollingDay, wipeRollingOptions } from "../dhanRollingOption.js";
import { comboRequiredMargin, dailyOverallLimits, niftyLotOn, pickCombo, replayTest2Day, runTest2Backtest, strikeByMinPremium } from "./Test2Engine.js";
import { Test2Strategy } from "./Test2Strategy.js";

const T0935 = Date.parse("2026-10-07T04:05:00.000Z");

test("TEST2 required margin is higher for BTST than intraday", () => {
  const legs = [
    { side: "SELL", entry: 80 },
    { side: "SELL", entry: 80 },
    { side: "BUY", entry: 20 },
    { side: "BUY", entry: 20 },
  ];
  const btst = comboRequiredMargin({ legs, qty: 65, spot: 24500, holdStyle: "btst" });
  const intra = comboRequiredMargin({ legs, qty: 65, spot: 24500, holdStyle: "intraday" });
  assert.equal(btst > intra, true);
  assert.equal(btst > 100000, true);
});

test("TEST2 seed and name lock", () => {
  const seeded = seedAlgos().find((row) => row.id === "a14");
  assert.equal(seeded.name, "TEST2");
  assert.equal(seeded.kind, "nifty-test2");
  assert.equal(seeded.startTimeIst, "09:35");
  assert.equal(seeded.endTimeIst, "15:15");
  assert.equal(seeded.exitTimeIst, "15:15");
  assert.equal(niftyTest2Config({ exitTimeIst: "09:35" }).exitTimeIst, "15:15");
  assert.equal(seeded.holdStyle, "btst");
  assert.equal(seeded.intradayOnly, false);
  assert.equal(seeded.product, "NRML");
  assert.equal(niftyTest2Config({ holdStyle: "intraday" }).product, "MIS");
  assert.equal(niftyTest2Config({ holdStyle: "intraday" }).holdOvernight, false);
  assert.equal(seeded.sellPremium, 80);
  assert.equal(seeded.hedgePremium, 20);
  assert.equal(seeded.overallTargetPct, 5);
  assert.equal(niftyTest2Config(defaultNiftyTest2Algo()).overallTargetPct, 5);
  assert.equal(isNiftyTest2Algo({ name: "TEST2" }), true);
  assert.equal(normalizeAlgo({ name: "TEST2" }).kind, "nifty-test2");
  assert.equal(defaultNiftyTest2Algo({ name: "other" }).name, "TEST2");
});

test("TEST2 script and option expiry follow TEST1-style choice", () => {
  const bank = niftyTest2Config({ symbol: "BANKNIFTY", lots: 1, sellExpiryKind: "weekly", hedgeExpiryKind: "monthly" });
  assert.equal(bank.symbol, "BANKNIFTY");
  assert.equal(bank.lotSize, 30);
  assert.equal(bank.qty, 30);
  assert.equal(bank.sellExpiryKind, "weekly");
  assert.equal(bank.hedgeExpiryKind, "monthly");
  assert.equal(bank.session, "nse");
  const crude = niftyTest2Config({ symbol: "CRUDEOIL", sellExpiryKind: "weekly", hedgeExpiryKind: "weekly" });
  assert.equal(crude.symbol, "CRUDEOIL");
  assert.equal(crude.lotSize, 100);
  assert.equal(crude.sellExpiryKind, "monthly");
  assert.equal(crude.hedgeExpiryKind, "monthly");
  assert.equal(crude.session, "mcx");
  assert.equal(crude.endTimeIst, "23:15");
  const saved = defaultNiftyTest2Algo({ symbol: "FINNIFTY" });
  assert.equal(saved.symbol, "FINNIFTY");
  assert.equal(saved.lotSize, 60);
  assert.equal(saved.sellExpiryKind, "monthly");
  assert.equal(saved.hedgeExpiryKind, "weekly");
  const rows = buildSyntheticChain(50000, 100, 8);
  const combo = pickCombo({
    monthlyRows: rows,
    weeklyRows: rows,
    sellPremium: 80,
    hedgePremium: 20,
    sellExpiryKind: "weekly",
    hedgeExpiryKind: "monthly",
  });
  assert.equal(combo.legs[0].expiryKind, "weekly");
  assert.equal(combo.legs[2].expiryKind, "monthly");
  const book = { places: [] };
  Test2Strategy.maybeEnter({
    algo: defaultNiftyTest2Algo({ symbol: "BANKNIFTY" }),
    config: bank,
    combo,
    expiries: { monthly: "2026-10-27", weekly: "2026-10-13" },
    marks: {},
    now: T0935,
    adapter: {
      place(payload) {
        book.places.push(payload);
        return { ok: true };
      },
    },
    orders: [],
  });
  assert.equal(book.places[0].symbol.startsWith("BANKNIFTY "), true);
  assert.equal(book.places[0].exchangeSegment !== "MCX_COMM", true);
});

test("premium >= picks the cheapest qualifying strike", () => {
  const rows = buildSyntheticChain(24500, 50, 8);
  const sellCe = strikeByMinPremium(rows, "CE", 80);
  const hedgeCe = strikeByMinPremium(rows, "CE", 20);
  assert.equal(sellCe.premium >= 80, true);
  assert.equal(hedgeCe.premium >= 20, true);
  const combo = pickCombo({ monthlyRows: rows, weeklyRows: rows, sellPremium: 80, hedgePremium: 20 });
  assert.equal(combo.legs.length, 4);
  assert.equal(combo.legs[0].side, "SELL");
  assert.equal(combo.legs[0].option, "CE");
  assert.equal(combo.legs[0].expiryKind, "monthly");
  assert.equal(combo.legs[2].side, "BUY");
  assert.equal(combo.legs[2].expiryKind, "weekly");
});

test("TEST2 enters four legs after 09:35 and does not retry a reject", () => {
  const algo = defaultNiftyTest2Algo();
  const rows = buildSyntheticChain(24500, 50, 8);
  const places = [];
  const first = Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    minutesToClose: 340,
    monthlyRows: rows,
    weeklyRows: rows,
    expiries: { monthly: "2026-10-27", weekly: "2026-10-13" },
    adapter: {
      place: (payload) => {
        places.push(payload);
        return { queued: true, status: "PENDING" };
      },
    },
    positions: [],
    orders: [],
  });
  assert.equal(first.action, "entry");
  assert.equal(places.length, 4);
  assert.equal(places.every((row) => row.product === "NRML"), true);
  assert.deepEqual(
    places.map((row) => `${row.side} ${row.option}`),
    ["SELL CE", "SELL PE", "BUY CE", "BUY PE"],
  );
  const again = Test2Strategy.tick({
    algo,
    now: T0935 + 60_000,
    feedLive: true,
    minutesToClose: 339,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: { place: (payload) => places.push(payload) },
    positions: [],
    orders: [],
  });
  assert.equal(again.action, "skip");
  assert.equal(places.length, 4);
});

test("TEST2 is BTST: holds past same-day 15:15 and sells tomorrow at 15:15", () => {
  const algo = defaultNiftyTest2Algo();
  const rows = buildSyntheticChain(24500, 50, 8);
  const opens = [
    { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 78, option: "CE", strike: 24600 },
    { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 79, option: "PE", strike: 24400 },
    { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, avg: 20, ltp: 21, option: "CE", strike: 24700 },
    { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 19, option: "PE", strike: 24300 },
  ];
  Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: { place: () => ({ queued: true, status: "PENDING" }) },
    positions: [],
    orders: [],
  });
  const closes = [];
  const sameDay = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T09:50:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(sameDay.action, "hold");
  assert.equal(closes.length, 0);
  const nextMorning = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-08T04:05:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(nextMorning.action, "hold");
  assert.equal(closes.length, 0);
  const nextClose = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-08T09:45:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(nextClose.action, "exit");
  assert.equal(nextClose.reason, "btst");
  assert.equal(closes.length, 4);
  assert.equal(closes.every((row) => row.product === "NRML"), true);
  assert.deepEqual(
    closes.map((row) => `${row.side} ${row.option}`),
    ["BUY CE", "BUY PE", "SELL CE", "SELL PE"],
  );
});

test("TEST2 intraday squares off the same day at 15:15", () => {
  const algo = defaultNiftyTest2Algo({ holdStyle: "intraday" });
  assert.equal(niftyTest2Config(algo).product, "MIS");
  const rows = buildSyntheticChain(24500, 50, 8);
  const places = [];
  Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: {
      place: (payload) => {
        places.push(payload);
        return { queued: true, status: "PENDING" };
      },
    },
    positions: [],
    orders: [],
  });
  assert.equal(places.every((row) => row.product === "MIS"), true);
  const closes = [];
  const opens = [
    { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 78, option: "CE", strike: 24600 },
    { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 79, option: "PE", strike: 24400 },
    { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, avg: 20, ltp: 21, option: "CE", strike: 24700 },
    { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 19, option: "PE", strike: 24300 },
  ];
  const midday = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T06:00:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(midday.action, "hold");
  const eod = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T09:50:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(eod.action, "exit");
  assert.equal(eod.reason, "eod");
  assert.equal(closes.length, 4);
  assert.equal(closes.every((row) => row.product === "MIS"), true);
});

test("TEST2 same-day restart does not fire BTST exit", () => {
  const algo = defaultNiftyTest2Algo();
  const rows = buildSyntheticChain(24500, 50, 8);
  Test2Strategy.tick({
    algo,
    now: T0935,
    feedLive: true,
    monthlyRows: rows,
    weeklyRows: rows,
    adapter: { place: () => ({ queued: true, status: "PENDING" }) },
    positions: [],
    orders: [],
  });
  algo.test2State = { entered: true, legs: algo.test2State.legs, entryDate: "", sessionDate: "" };
  const closes = [];
  const sameDay = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T09:50:00.000Z"),
    feedLive: true,
    adapter: { place: (payload) => closes.push(payload) },
    positions: [
      { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 78, option: "CE", strike: 24600 },
      { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 79, option: "PE", strike: 24400 },
      { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, avg: 20, ltp: 21, option: "CE", strike: 24700 },
      { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 19, option: "PE", strike: 24300 },
    ],
    orders: [],
  });
  assert.equal(sameDay.action, "hold");
  assert.equal(closes.length, 0);
});

test("TEST2 hedge SL exits only the hit BUY leg", () => {
  const algo = defaultNiftyTest2Algo();
  algo.test2State = {
    entered: true,
    entryDate: "2026-10-07",
    sessionDate: "2026-10-07",
    legs: [{ option: "CE", strike: 24700, premium: 20, side: "BUY" }],
  };
  const closes = [];
  const hit = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T06:00:00.000Z"),
    feedLive: true,
    marks: { spot: 24500, "NIFTY 24700 CE": 15 },
    adapter: { place: (payload) => closes.push(payload) },
    positions: [
      { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 78, option: "CE", strike: 24600 },
      { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 79, option: "PE", strike: 24400 },
      { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, option: "CE", strike: 24700 },
      { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 19, option: "PE", strike: 24300 },
    ],
    orders: [],
  });
  assert.equal(hit.action, "hold");
  assert.equal(closes.length, 1);
  assert.equal(closes[0].side, "SELL");
  assert.equal(closes[0].option, "CE");
  assert.equal(closes[0].strike, 24700);
});

test("TEST2 overall profit 5% of margin exits all four live legs", () => {
  const algo = defaultNiftyTest2Algo();
  const cfg = niftyTest2Config(algo);
  assert.equal(cfg.overallTargetPct, 5);
  const opens = [
    { symbol: "NIFTY 24600 CE", side: "SELL", qty: 65, avg: 80, ltp: 20, option: "CE", strike: 24600 },
    { symbol: "NIFTY 24400 PE", side: "SELL", qty: 65, avg: 80, ltp: 20, option: "PE", strike: 24400 },
    { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, avg: 20, ltp: 20, option: "CE", strike: 24700 },
    { symbol: "NIFTY 24300 PE", side: "BUY", qty: 65, avg: 20, ltp: 20, option: "PE", strike: 24300 },
  ];
  const margin = comboRequiredMargin({
    legs: opens.map((row) => ({ side: row.side, entry: row.avg })),
    qty: 65,
    spot: 24500,
    holdStyle: "btst",
  });
  const limits = dailyOverallLimits({ config: cfg, margin });
  assert.equal(limits.target > 5000, true);
  assert.equal(limits.target < 8000, true);
  const closes = [];
  const hit = Test2Strategy.tick({
    algo,
    now: Date.parse("2026-10-07T06:00:00.000Z"),
    feedLive: true,
    marks: { spot: 24500, NIFTY: 24500 },
    adapter: { place: (payload) => closes.push(payload) },
    positions: opens,
    orders: [],
  });
  assert.equal(hit.action, "exit");
  assert.equal(hit.reason, "overall-target");
  assert.equal(closes.length, 4);
  assert.equal(closes.every((row) => row.strategy === "TEST2"), true);
});

test("TEST2 backtest exits all legs when daily overall profit hits 5%", () => {
  const algo = defaultNiftyTest2Algo({ overallTargetPct: 0.01, overallTarget: 0, overallSl: 0 });
  const day = Date.parse("2026-09-01T04:05:00.000Z");
  const candles = Array.from({ length: 3 }, (_, i) => ({
    time: day + i * 86_400_000,
    open: 24500,
    high: 24520,
    low: 24480,
    close: 24510,
    volume: 1,
  }));
  const result = runTest2Backtest(algo, candles);
  assert.equal(result.overallTargetPct, 0.01);
  assert.equal(result.optionSource, "synth");
  assert.equal(result.trades >= 1, true);
  const session = {
    day: "2026-09-01",
    open: 24500,
    close: 24510,
    high: 24520,
    low: 24480,
    bars: [
      { time: day, open: 24500, high: 24520, low: 24480, close: 24510 },
      { time: day + 5 * 60 * 1000, open: 24510, high: 24530, low: 24500, close: 24520 },
    ],
  };
  const longBars = Array.from({ length: 36 }, (_, i) => ({
    time: day + i * 5 * 60 * 1000,
    open: 24500,
    high: 24520,
    low: 24480,
    close: 24510,
  }));
  const combo = replayTest2Day(
    { ...session, bars: longBars, close: 24510 },
    niftyTest2Config(algo),
  );
  assert.equal(combo.exitReason, "overall-target");
  assert.equal(combo.legs.length, 4);
  assert.equal(combo.legs.every((leg) => Number(leg.exit) > 0), true);
});

test("NIFTY lot follows the NSE schedule", () => {
  assert.equal(niftyLotOn("2014-12-31"), 50);
  assert.equal(niftyLotOn("2015-01-01"), 75);
  assert.equal(niftyLotOn("2021-10-28"), 75);
  assert.equal(niftyLotOn("2021-10-29"), 50);
  assert.equal(niftyLotOn("2024-07-24"), 50);
  assert.equal(niftyLotOn("2024-07-25"), 25);
  assert.equal(niftyLotOn("2024-10-30"), 25);
  assert.equal(niftyLotOn("2024-10-31"), 65);
  assert.equal(niftyLotOn("2026-09-01"), 65);
});

test("TEST2 backtest counts one combo as one trade", () => {
  const algo = defaultNiftyTest2Algo();
  const day = Date.parse("2026-09-01T04:05:00.000Z");
  const candles = Array.from({ length: 10 }, (_, i) => ({
    time: day + i * 86_400_000,
    open: 24500,
    high: 24580,
    low: 24420,
    close: 24500 + (i % 2 ? 40 : -30),
    volume: 1,
  }));
  const result = runTest2Backtest(algo, candles);
  assert.equal(result.holdStyle, "btst");
  assert.equal(result.optionSource, "synth");
  assert.equal(result.combos, 9);
  assert.equal(result.trades, 9);
  assert.equal(result.legs, 36);
  assert.equal(result.tradesBook.every((row) => row.side === "COMBO"), true);
  const intra = runTest2Backtest(defaultNiftyTest2Algo({ holdStyle: "intraday" }), candles);
  assert.equal(intra.holdStyle, "intraday");
  assert.equal(intra.trades, 10);
  assert.equal(niftyTest2Config(algo).sellPremium, 80);
});

test("TEST2 still shows a BANKNIFTY research book when rolling tape is missing", () => {
  wipeRollingOptions();
  const day = Date.parse("2026-07-08T04:05:00.000Z");
  const candles = Array.from({ length: 5 }, (_, i) => ({
    time: day + i * 86_400_000,
    open: 57600,
    high: 57800,
    low: 57400,
    close: 57650,
    volume: 1,
  }));
  const result = runTest2Backtest(defaultNiftyTest2Algo({ symbol: "BANKNIFTY", holdStyle: "intraday", hedgeSlPct: 10 }), candles);
  assert.equal(result.optionSource, "synth");
  assert.equal(result.trades >= 1, true);
  assert.equal(result.legsBook.length >= 4, true);
  assert.equal(result.legsBook.some((row) => row.side === "BUY"), true);
});

test("TEST2 hedge SL does not fire from model theta at 09:35", () => {
  const open = Date.parse("2026-07-08T04:05:00.000Z");
  const bars = Array.from({ length: 69 }, (_, i) => ({
    time: open + i * 5 * 60 * 1000,
    open: 57600,
    high: 57640,
    low: 57560,
    close: 57610,
    volume: 1,
  }));
  const session = {
    day: "2026-07-08",
    open: 57600,
    close: 57610,
    high: 57640,
    low: 57560,
    bars,
  };
  const combo = replayTest2Day(session, niftyTest2Config(defaultNiftyTest2Algo({ holdStyle: "intraday", hedgeSlPct: 10 })));
  const buys = combo.legs.filter((leg) => leg.side === "BUY");
  assert.equal(buys.length, 2);
  assert.equal(
    buys.every((leg) => String(leg.exitAt).endsWith("15:15")),
    true,
  );
  assert.equal(
    buys.every((leg) => String(leg.exitAt) !== String(leg.entryAt)),
    true,
  );
  assert.equal(
    buys.every((leg) => Number(leg.exit) !== Number((leg.entry * 0.9).toFixed(2))),
    true,
  );
});

test("TEST2 hedge SL still fires later when spot kills the buy premium", () => {
  const open = Date.parse("2026-07-08T04:05:00.000Z");
  const bars = Array.from({ length: 12 }, (_, i) => ({
    time: open + i * 5 * 60 * 1000,
    open: i ? 56400 : 57600,
    high: i ? 56500 : 57620,
    low: i ? 56300 : 57580,
    close: i ? 56400 : 57600,
    volume: 1,
  }));
  const session = { day: "2026-07-08", open: 57600, close: 56400, high: 57620, low: 56300, bars };
  const combo = replayTest2Day(session, niftyTest2Config(defaultNiftyTest2Algo({ holdStyle: "intraday", hedgeSlPct: 10 })));
  const buyCe = combo.legs.find((leg) => leg.side === "BUY" && leg.option === "CE");
  assert.equal(Number(buyCe.exit), Number((buyCe.entry * 0.9).toFixed(2)));
  assert.notEqual(String(buyCe.exitAt), String(buyCe.entryAt));
});

test("TEST2 replay picks chain premiums, not a flat 80/20 fill", () => {
  const session = {
    day: "2026-09-01",
    open: 24500,
    close: 24540,
    high: 24580,
    low: 24420,
    bars: [{ time: Date.parse("2026-09-01T04:05:00.000Z"), open: 24500, high: 24580, low: 24420, close: 24540 }],
  };
  const combo = replayTest2Day(session, niftyTest2Config(defaultNiftyTest2Algo()));
  assert.equal(combo.legs.length, 4);
  assert.equal(combo.qty, 65);
  assert.match(String(combo.entryAt), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.match(String(combo.exitAt), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(combo.legs.every((leg) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(leg.entryAt))), true);
  assert.equal(combo.legs.every((leg) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(leg.exitAt))), true);
  assert.equal(combo.legs[0].entry >= 80, true);
  assert.equal(combo.legs[2].entry >= 20, true);
  assert.notEqual(combo.legs[0].entry, 80);
  const oldLot = replayTest2Day({ ...session, day: "2021-10-20", open: 17500, close: 17540 }, niftyTest2Config(defaultNiftyTest2Algo()));
  assert.equal(oldLot.qty, 75);
  const midLot = replayTest2Day({ ...session, day: "2024-08-01" }, niftyTest2Config(defaultNiftyTest2Algo()));
  assert.equal(midLot.qty, 25);
});

test("TEST2 backtest uses the full session, not only the first 5m bar", () => {
  const algo = defaultNiftyTest2Algo();
  const open = Date.parse("2026-09-01T04:05:00.000Z");
  const quiet = [
    ...Array.from({ length: 12 }, (_, i) => ({
      time: open + i * 5 * 60 * 1000,
      open: 24500,
      high: 24520,
      low: 24480,
      close: 24505,
      volume: 1,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      time: open + 86_400_000 + i * 5 * 60 * 1000,
      open: 24510,
      high: 24530,
      low: 24490,
      close: 24515,
      volume: 1,
    })),
  ];
  const quietBook = runTest2Backtest(algo, quiet);
  assert.equal(quietBook.optionSource, "synth");
  assert.equal(quietBook.combos, 1);
  assert.equal(quietBook.trades, 1);
  assert.equal(quietBook.legs, 4);
  assert.equal(quietBook.pnl > 0, true);
  const trend = [
    { time: open, open: 24500, high: 24510, low: 24490, close: 24500, volume: 1 },
    { time: open + 86_400_000, open: 25100, high: 25200, low: 24780, close: 25100, volume: 1 },
  ];
  const trendBook = runTest2Backtest(algo, trend);
  assert.equal(trendBook.combos, 1);
  assert.notEqual(trendBook.pnl, quietBook.pnl);
});

test("TEST2 uses Dhan rolling chains and fills a weekly-only day from that tape", () => {
  wipeRollingOptions();
  const open = Date.parse("2026-09-01T04:05:00.000Z");
  const next = open + 86_400_000;
  writeRollingDay("NIFTY", "2026-09-01", {
    weekly: {
      slots: [
        { t: open, spot: 24500, rows: [{ s: 24700, ce: 24, pe: 23, ceL: 20, peL: 19 }] },
        { t: next, spot: 24540, rows: [{ s: 24700, ce: 21, pe: 20, ceL: 18, peL: 17 }] },
      ],
    },
    monthly: {
      slots: [
        { t: open, spot: 24500, rows: [{ s: 24600, ce: 90, pe: 88, ceL: 80, peL: 79 }] },
        { t: next, spot: 24540, rows: [{ s: 24600, ce: 82, pe: 84, ceL: 78, peL: 80 }] },
      ],
    },
  });
  const session = {
    day: "2026-09-01",
    open: 24500,
    close: 24540,
    high: 24580,
    low: 24420,
    bars: [{ time: open, open: 24500, high: 24580, low: 24420, close: 24540 }],
  };
  const exit = {
    day: "2026-09-02",
    open: 24540,
    close: 24550,
    high: 24580,
    low: 24510,
    bars: [{ time: next, open: 24540, high: 24580, low: 24510, close: 24550 }],
  };
  const combo = replayTest2Day(session, niftyTest2Config(defaultNiftyTest2Algo()), exit);
  assert.equal(combo.source, "stored");
  assert.equal(combo.skip, undefined);
  assert.equal(combo.legs[0].entry, 90);
  assert.equal(Number(combo.cost), 80);
  writeRollingDay("NIFTY", "2026-09-03", {
    weekly: {
      slots: [
        {
          t: open + 2 * 86_400_000,
          spot: 24500,
          rows: [
            { s: 24600, ce: 90, pe: 88 },
            { s: 24700, ce: 24, pe: 23 },
          ],
        },
      ],
    },
    monthly: { slots: [] },
  });
  const weeklyOnly = replayTest2Day(
    { ...session, day: "2026-09-03", bars: [{ time: open + 2 * 86_400_000, open: 24500, high: 24510, low: 24490, close: 24500 }] },
    niftyTest2Config(defaultNiftyTest2Algo()),
  );
  assert.equal(weeklyOnly.skip, undefined);
  assert.equal(weeklyOnly.source, "stored");
  assert.equal(weeklyOnly.legs[0].entry > 0, true);
  wipeRollingOptions();
});

test("TEST2 BTST marks max win/loss and drawdown on the sell-tomorrow day", () => {
  const algo = defaultNiftyTest2Algo({ holdStyle: "btst" });
  const start = Date.parse("2026-09-28T03:45:00.000Z");
  const candles = Array.from({ length: 5 }, (_, i) => ({
    time: start + i * 86_400_000,
    open: 24500,
    high: 24600,
    low: 24400,
    close: 24500 + (i === 0 ? 80 : i === 3 ? -90 : 10),
    volume: 1,
  }));
  const result = runTest2Backtest(algo, candles);
  assert.equal(result.holdStyle, "btst");
  assert.equal(result.tradesBook.every((row) => row.exitDay && row.exitDay >= row.day), true);
  assert.equal(result.maxProfitDay === result.maxLossDay || Boolean(result.maxProfitDay || result.maxLossDay), true);
  assert.match(String(result.maxDdFrom || result.maxProfitDay || ""), /^\d{4}-\d{2}-\d{2}$/);
});

test("TEST2 this-month window does not replay September candles", async () => {
  const { backtestAlgo, createAlgo, deleteAlgo } = await import("../market.js");
  const created = createAlgo({
    name: "TEST2-window",
    kind: "nifty-test2",
    runMode: "backtest",
  });
  try {
    const sep = Date.parse("2026-09-28T03:45:00.000Z");
    const oct = Date.parse("2026-10-01T03:45:00.000Z");
    const candles = [
      ...Array.from({ length: 3 }, (_, i) => ({
        time: sep + i * 86_400_000,
        open: 24500,
        high: 24600,
        low: 24400,
        close: 24600,
        volume: 1,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        time: oct + i * 86_400_000,
        open: 24500,
        high: 24600,
        low: 24400,
        close: 24420,
        volume: 1,
      })),
    ];
    const replay = await backtestAlgo(created.id, {
      range: "custom",
      from: "2026-10-01",
      to: "2026-10-07",
      candles,
    });
    const book = replay.backtest?.book || replay.algo.lastBacktest?.book || [];
    assert.equal(book.some((row) => String(row.day || "").startsWith("2026-09")), false);
    assert.equal(String(replay.algo.lastBacktest?.from || ""), "2026-10-01");
  } finally {
    deleteAlgo(created.id);
  }
});

test("reset backtest clears stored TEST2 result", async () => {
  const { backtestAlgo, createAlgo, deleteAlgo, resetBacktestAlgo } = await import("../market.js");
  const created = createAlgo({
    name: "TEST2",
    kind: "nifty-test2",
    runMode: "backtest",
  });
  try {
    const replay = await backtestAlgo(created.id, {
      range: "custom",
      from: "2026-09-01",
      to: "2026-09-10",
      candles: Array.from({ length: 10 }, (_, i) => ({
        time: Date.parse("2026-09-01T04:05:00.000Z") + i * 86_400_000,
        open: 24500,
        high: 24580,
        low: 24420,
        close: 24500 + (i % 2 ? 40 : -30),
        volume: 1,
      })),
    });
    assert.equal(Number(replay.algo.lastBacktest?.trades || 0) > 0, true);
    const reset = resetBacktestAlgo(created.id);
    assert.equal(reset.ok, true);
    assert.equal(reset.algo.lastBacktest, null);
    assert.equal(reset.algo.pnl, 0);
    assert.equal(reset.algo.winRate, 0);
  } finally {
    deleteAlgo(created.id);
  }
});
