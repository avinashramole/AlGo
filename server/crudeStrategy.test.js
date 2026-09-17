import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLiveQuotes,
  applySyntheticOptionChain,
  cacheOptionDesk,
  candleSymbol,
  clearSimulatedDesk,
  getCandles,
  getChainSpot,
  isCrudeSymbol,
  mcxMarketSession,
  nseMarketSession,
  liveSessionOpenForOrder,
  routeManualOrderBrokerId,
  optionRowsForSymbol,
  resolveAlgoTrade,
  setDhanFeed,
  setLiveCandles,
  setOptionDesk,
  snapshot,
  tickMarket,
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

test("seed catalog hydrates Crude Oil strategies onto an existing NIFTY-only desk", () => {
  const catalog = seedAlgos();
  const saved = catalog.filter((row) => ["a4", "a5", "a6"].includes(row.id));
  const next = hydrateAlgos({ algos: saved, removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a7"), true);
  assert.equal(next.algos.find((row) => row.id === "a7").enabled, false);
  assert.equal(next.algos.find((row) => row.id === "a8").timeframe, "15m");
  assert.equal(next.algos.find((row) => row.id === "a9").indicator, "SUPERTREND");
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
