import assert from "node:assert/strict";
import test from "node:test";
import { formatConditionGroup, hydrateAlgos, mappedClientIdsForMembers, normalizeAlgo, seedAlgos } from "./strategies.js";

test("normalizeAlgo keeps AND/OR condition rows and mirrors the first BUY row", () => {
  const algo = normalizeAlgo({
    name: "Multi VWAP",
    kind: "indicator",
    indicator: "VWAP",
    buyConditions: {
      join: "or",
      rows: [
        { left: "price", op: "close_above", right: "vwap" },
        { left: "rsi", op: "lt", right: "value", value: 30 },
      ],
    },
    sellConditions: {
      join: "and",
      rows: [
        { left: "price", op: "close_below", right: "vwap" },
        { left: "rsi", op: "gt", right: "value", value: 70 },
      ],
    },
  });
  assert.equal(algo.enabled, false);
  assert.equal(algo.buyConditions.join, "or");
  assert.equal(algo.buyConditions.rows.length, 2);
  assert.equal(algo.buyLeft, "price");
  assert.equal(algo.buyOp, "close_above");
  assert.equal(algo.sellConditions.join, "and");
  assert.equal(algo.sellConditions.rows.length, 2);
  assert.equal(algo.sellConditions.rows[1].value, 70);
  assert.match(algo.summary, /OR/);
});

test("formatConditionGroup joins rows with AND or OR", () => {
  assert.equal(
    formatConditionGroup({
      join: "or",
      rows: [
        { left: "price", op: "close_above", right: "vwap", value: 0 },
        { left: "rsi", op: "lt", right: "value", value: 30 },
      ],
    }),
    "Price close above VWAP OR RSI < 30",
  );
});

test("normalizeAlgo keeps mapped clients and mapping scope", () => {
  const created = normalizeAlgo({ name: "Map Desk", kind: "nifty-vwap-hedge" });
  assert.deepEqual(created.mappedClientIds, []);
  assert.equal(created.mappingScope, "both");
  const saved = normalizeAlgo(
    { mappedClientIds: ["u-arpit", "u-ramesh"], mappingScope: "clients" },
    created,
  );
  assert.deepEqual(saved.mappedClientIds, ["u-arpit", "u-ramesh"]);
  assert.equal(saved.mappingScope, "clients");
  assert.equal(saved.enabled, false);
});

test("mappedClientIdsForMembers keeps only clients that still exist", () => {
  assert.deepEqual(mappedClientIdsForMembers(["u-arpit", "u-gone", "u-arpit", ""], ["u-arpit"]), ["u-arpit"]);
  assert.deepEqual(mappedClientIdsForMembers(["u-a", "u-b"], new Set(["u-b"])), ["u-b"]);
});

test("hydrate first boot seeds the paused catalog", () => {
  const next = hydrateAlgos({}, seedAlgos());
  assert.equal(next.algos.length, 4);
  assert.equal(next.algos.map((row) => row.id).join(","), "a10,a12,a13,a14");
  assert.equal(next.removedIds.length, 0);
});

test("hydrate does not resurrect a deleted catalog strategy after deploy", () => {
  const catalog = seedAlgos();
  const saved = catalog.filter((row) => row.id !== "a13");
  const next = hydrateAlgos({ algos: saved, removedIds: ["a13"] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a13"), false);
  assert.equal(next.algos.some((row) => row.name === "TEST1"), false);
  assert.deepEqual(next.removedIds, ["a13"]);
  assert.equal(next.algos.length, 3);
  assert.equal(next.algos.some((row) => row.id === "a10"), true);
  assert.equal(next.algos.some((row) => row.id === "a12"), true);
  assert.equal(next.algos.some((row) => row.id === "a14"), true);
});

test("hydrate always shows NIFTY and CRUDE OIL even if they were deleted", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos({ algos: [], removedIds: ["a10", "a12", "a13"] }, catalog);
  const nifty = next.algos.find((row) => row.id === "a10");
  const crude = next.algos.find((row) => row.id === "a12");
  assert.equal(nifty.name, "NIFTY");
  assert.equal(crude.name, "CRUDE OIL");
  assert.equal(next.algos.some((row) => row.id === "a13"), false);
  assert.equal(next.algos.some((row) => row.id === "a14"), true);
  assert.deepEqual(next.removedIds, ["a13"]);
});

test("hydrate still adds a new catalog strategy that was never deleted", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos({ algos: catalog.slice(0, 1), removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a10"), true);
  assert.equal(next.algos.find((row) => row.id === "a10").enabled, false);
  assert.equal(next.algos.some((row) => row.id === "a12"), true);
  assert.equal(next.algos.find((row) => row.id === "a12").symbol, "CRUDEOIL");
  assert.equal(next.algos.find((row) => row.id === "a12").enabled, false);
});

test("hydrate keeps a user-created strategy and a started LIVE algo after reload", () => {
  const catalog = seedAlgos();
  const custom = normalizeAlgo({ name: "My crude copy", kind: "crude-first-candle" }, { id: "a99" });
  const liveFirst = { ...catalog[0], enabled: true, status: "LIVE" };
  const next = hydrateAlgos({ algos: [liveFirst, custom], removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a99"), true);
  const first = next.algos.find((row) => row.id === "a10");
  assert.equal(first.enabled, true);
  assert.equal(first.status, "LIVE");
  assert.equal(next.algos.some((row) => row.id === "a12"), true);
  assert.equal(next.algos.find((row) => row.id === "a12").enabled, false);
});

test("hydrate does not start a paused strategy from the catalog", () => {
  const catalog = seedAlgos();
  const paused = { ...catalog[0], enabled: false, status: "PAUSED" };
  const next = hydrateAlgos({ algos: [paused], removedIds: [] }, catalog);
  const first = next.algos.find((row) => row.id === "a10");
  assert.equal(first.enabled, false);
  assert.equal(first.status, "PAUSED");
});

test("hydrate drops retired strategies and records them as removed", () => {
  const catalog = seedAlgos();
  const retired = [
    normalizeAlgo({ name: "NIFTY VWAP ATM", kind: "nifty-vwap" }, { id: "a4" }),
    normalizeAlgo({ name: "NIFTY 15m VWAP reversal", kind: "nifty-vwap-reversal" }, { id: "a5" }),
    normalizeAlgo({ name: "NIFTY 15m VWAP hedge", kind: "nifty-vwap-hedge" }, { id: "a6" }),
    normalizeAlgo({ name: "My RSI", kind: "indicator", indicator: "RSI" }, { id: "a20" }),
    normalizeAlgo({ name: "ORB desk", kind: "price-action", pattern: "ORB" }, { id: "a21" }),
    normalizeAlgo({ name: "nifty test", kind: "nifty-test" }, { id: "a11" }),
  ];
  const next = hydrateAlgos({ algos: [...retired, ...catalog], removedIds: [] }, catalog);
  for (const id of ["a4", "a5", "a6", "a20", "a21", "a11"]) {
    assert.equal(next.algos.some((row) => row.id === id), false);
    assert.equal(next.removedIds.includes(id), true);
  }
  assert.equal(next.algos.some((row) => row.id === "a10"), true);
  assert.equal(next.algos.some((row) => row.id === "a12"), true);
  assert.equal(next.algos.some((row) => row.id === "a13"), true);
  assert.equal(next.algos.some((row) => row.id === "a14"), true);
});

test("seed includes paused CRUDE OIL option strategies", () => {
  const seeded = seedAlgos();
  const crude = seeded.filter((row) => row.symbol === "CRUDEOIL");
  assert.equal(crude.length, 1);
  assert.equal(crude.every((row) => row.enabled === false), true);
  assert.equal(crude.every((row) => row.status === "PAUSED"), true);
  assert.equal(crude.every((row) => row.instrument === "option"), true);
  assert.equal(crude.every((row) => row.lotSize === 100), true);
  assert.equal(crude.filter((row) => row.kind === "indicator").length, 0);
  assert.equal(seeded.some((row) => row.kind === "nifty-vwap" || row.kind === "nifty-test" || row.kind === "indicator"), false);
  const firstCandle = seeded.find((row) => row.id === "a10");
  assert.equal(firstCandle.name, "NIFTY");
  assert.equal(firstCandle.kind, "nifty-first-candle");
  assert.equal(firstCandle.enabled, false);
  assert.equal(firstCandle.status, "PAUSED");
  assert.equal(firstCandle.initialSlPct, 20);
  assert.equal(firstCandle.targetPct, 40);
  assert.equal(firstCandle.dailyLiveIst, "09:00");
  assert.equal(firstCandle.firstBarStartIst, "09:00");
  assert.equal(firstCandle.entryEvaluationIst, "09:05");
  assert.equal(firstCandle.endTimeIst, "15:15");
  assert.equal(firstCandle.expiryKind, "weekly");
  assert.equal(firstCandle.maxTradesPerDay, 5);
  assert.equal(firstCandle.strikeOffset, 0);
  const crudeFirst = seeded.find((row) => row.id === "a12");
  assert.equal(crudeFirst.name, "CRUDE OIL");
  assert.equal(crudeFirst.kind, "crude-first-candle");
  assert.equal(crudeFirst.symbol, "CRUDEOIL");
  assert.equal(crudeFirst.enabled, false);
  assert.equal(crudeFirst.status, "PAUSED");
  assert.equal(crudeFirst.lotSize, 100);
  assert.equal(crudeFirst.qty, 100);
  assert.equal(crudeFirst.expiryKind, "monthly");
  assert.equal(crudeFirst.endTimeIst, "23:15");
  assert.equal(crudeFirst.maxTradesPerDay, 5);
  assert.notEqual(crudeFirst.kind, firstCandle.kind);
  const test1 = seeded.find((row) => row.id === "a13");
  assert.equal(test1.name, "TEST1");
  assert.equal(test1.kind, "nifty-test1");
  assert.equal(test1.enabled, false);
  assert.equal(test1.status, "PAUSED");
  assert.equal(test1.timeframe, "5m");
  assert.equal(test1.strikeOffset, 0);
  assert.equal(test1.startTimeIst, "09:30");
  assert.equal(test1.minBodyPct, 0.9);
  assert.equal(test1.maxWickPct, 0.1);
  const test2 = seeded.find((row) => row.id === "a14");
  assert.equal(test2.name, "TEST2");
  assert.equal(test2.kind, "nifty-test2");
  assert.equal(test2.enabled, false);
  assert.equal(test2.status, "PAUSED");
  assert.equal(test2.startTimeIst, "09:35");
  assert.equal(test2.endTimeIst, "15:15");
  assert.equal(test2.exitTimeIst, "15:15");
  assert.equal(test2.holdStyle, "btst");
  assert.equal(test2.intradayOnly, false);
  assert.equal(test2.product, "NRML");
  assert.equal(test2.sellPremium, 80);
  assert.equal(test2.hedgePremium, 20);
  assert.equal(test2.hedgeSlPct, 20);
});

test("crude oil 5m name stays crude and does not become the nifty first candle", () => {
  const row = normalizeAlgo({ name: "CRUDE OIL 5m first candle", kind: "indicator" });
  assert.equal(row.kind, "crude-first-candle");
  assert.equal(row.symbol, "CRUDEOIL");
  assert.equal(row.lotSize, 100);
  assert.equal(row.endTimeIst, "23:15");
  assert.equal(row.expiryKind, "monthly");
  assert.equal(row.enabled, false);
  assert.notEqual(row.status, "LIVE");
  assert.equal(row.buyConditions, undefined);
  assert.equal(row.buyOp, undefined);
  assert.equal(row.pattern, undefined);
  assert.match(row.summary, /every 5m|until a signal/i);
  assert.doesNotMatch(row.summary, /close above|price action/i);
  const nifty = normalizeAlgo({ name: "NIFTY 5m first candle", kind: "indicator" });
  assert.equal(nifty.kind, "nifty-first-candle");
  assert.equal(nifty.name, "NIFTY");
  assert.equal(nifty.symbol, "NIFTY");
  assert.equal(nifty.endTimeIst, "15:15");
  const shortCrude = normalizeAlgo({ name: "CRUDE OIL", kind: "indicator" });
  assert.equal(shortCrude.kind, "crude-first-candle");
  assert.equal(shortCrude.name, "CRUDE OIL");
  const shortNifty = normalizeAlgo({ name: "NIFTY", kind: "indicator" });
  assert.equal(shortNifty.kind, "nifty-first-candle");
  assert.equal(shortNifty.name, "NIFTY");
});

test("crude oil 5m saved as price action drops indicator conditions and stays paused", () => {
  const row = normalizeAlgo(
    {
      name: "CRUDE OIL 5m first candle",
      kind: "price-action",
      pattern: "ORB",
      rangeMinutes: 15,
      symbol: "CRUDEOIL",
      instrument: "option",
      buyLeft: "price",
      buyOp: "close_above",
      buyRight: "vwap",
      sellLeft: "price",
      sellOp: "close_below",
      sellRight: "vwap",
      buyConditions: { join: "and", rows: [{ left: "price", op: "close_above", right: "vwap", value: 0 }] },
      enabled: true,
    },
    { id: "a12", enabled: false, status: "PAUSED" },
  );
  assert.equal(row.kind, "crude-first-candle");
  assert.equal(row.indicator, "CRUDE_FIRST_CANDLE");
  assert.equal(row.strategyType, "CRUDE_FIRST_CANDLE_5M");
  assert.equal(row.symbol, "CRUDEOIL");
  assert.equal(row.enabled, false);
  assert.equal(row.status, "PAUSED");
  assert.equal(row.buyConditions, undefined);
  assert.equal(row.buyOp, undefined);
  assert.equal(row.pattern, undefined);
  assert.match(row.summary, /one signal places one order/i);
  const nifty = normalizeAlgo(
    { name: "NIFTY 5m first candle", kind: "price-action", pattern: "ORB" },
    { id: "a10", kind: "nifty-first-candle", enabled: false, status: "PAUSED" },
  );
  assert.equal(nifty.kind, "price-action");
});

test("spaced crude first candle name is not stored as an indicator", () => {
  const row = normalizeAlgo(
    {
      name: "CRUDE OIL 5 m first candle",
      kind: "indicator",
      symbol: "CRUDEOIL",
      indicator: "VWAP",
      buyLeft: "price",
      buyOp: "close_above",
      buyRight: "vwap",
      sellOp: "close_below",
      pattern: "ORB",
      enabled: true,
    },
    { id: "a12", enabled: false, status: "PAUSED" },
  );
  assert.equal(row.kind, "crude-first-candle");
  assert.equal(row.indicator, "CRUDE_FIRST_CANDLE");
  assert.equal(row.symbol, "CRUDEOIL");
  assert.equal(row.enabled, false);
  assert.equal(row.status, "PAUSED");
  assert.equal(row.buyOp, undefined);
  assert.equal(row.pattern, undefined);
  assert.match(row.summary, /every 5m|until a signal/i);
  assert.doesNotMatch(row.summary, /Indicator|close above/i);
  const vwap = normalizeAlgo(
    { name: "CRUDE OIL VWAP ATM", kind: "indicator", symbol: "CRUDEOIL", indicator: "VWAP" },
    { id: "a7", enabled: false, status: "PAUSED" },
  );
  assert.equal(vwap.kind, "indicator");
  assert.match(vwap.summary, /^Indicator /);
});

test("crude oil indicator keeps the trade limit and stays paused", () => {
  const row = normalizeAlgo(
    { name: "CRUDE OIL VWAP ATM", kind: "indicator", symbol: "CRUDEOIL", indicator: "VWAP", maxTradesPerDay: 3 },
    { id: "a7", enabled: false, status: "PAUSED" },
  );
  assert.equal(row.kind, "indicator");
  assert.equal(row.maxTradesPerDay, 3);
  assert.equal(row.enabled, false);
  assert.notEqual(row.status, "LIVE");
  const nifty = normalizeAlgo(
    { name: "NIFTY 5m first candle", kind: "indicator", maxTradesPerDay: 1 },
    { id: "a10", enabled: false, status: "PAUSED" },
  );
  assert.equal(nifty.kind, "nifty-first-candle");
  assert.equal(nifty.maxTradesPerDay, 5);
});

test("hydrate rematerializes first candle saved as a generic indicator", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos(
    {
      algos: [
        {
          id: "a10",
          name: "NIFTY 5m first candle",
          kind: "indicator",
          indicator: "NIFTY_FIRST_CANDLE",
          timeframe: "5m",
          symbol: "NIFTY",
          runMode: "live",
          enabled: false,
          status: "PAUSED",
        },
      ],
      removedIds: [],
    },
    catalog,
  );
  const row = next.algos.find((item) => item.id === "a10");
  assert.equal(row.kind, "nifty-first-candle");
  assert.equal(row.strategyType, "NIFTY_FIRST_CANDLE_5M");
  assert.equal(row.firstBarStartIst, "09:00");
  assert.equal(row.entryEvaluationIst, "09:05");
  assert.equal(row.enabled, false);
});

test("seed does not include nifty test", () => {
  const seeded = seedAlgos();
  assert.equal(seeded.some((item) => item.kind === "nifty-test" || item.id === "a11"), false);
});

test("normalizeAlgo keeps Multi-Index Reversal paper and disabled on create", () => {
  const algo = normalizeAlgo({
    kind: "multi-index-reversal",
    symbol: "SENSEX",
    timeframe: "30m",
    strikeOffset: 2,
    initialTargetPct: 40,
    reversalLossPct: 20,
    reversalQtyMultiple: 2,
    combinedTargetPct: 20,
    combinedTargetBasis: "original",
    runMode: "paper",
  });
  assert.equal(algo.kind, "multi-index-reversal");
  assert.equal(algo.name, "Multi-Index Reversal Strategy");
  assert.equal(algo.symbol, "SENSEX");
  assert.equal(algo.timeframe, "30m");
  assert.equal(algo.strikeOffset, 2);
  assert.equal(algo.enabled, false);
  assert.equal(algo.runMode, "paper");
  assert.equal(algo.brokerId, "paper");
  assert.equal(algo.status, "PAUSED");
  assert.match(algo.summary, /SENSEX/);
});

test("a saved nifty test is dropped with the retired strategies", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos(
    {
      algos: [
        {
          id: "a11",
          name: "nifty test",
          kind: "indicator",
          symbol: "NIFTY",
          timeframe: "15m",
          startTimeIst: "09:20",
          endTimeIst: "15:00",
          slPct: 0.5,
          targetPct: 1,
          runMode: "live",
          enabled: false,
          status: "PAUSED",
        },
      ],
      removedIds: [],
    },
    catalog,
  );
  assert.equal(next.algos.some((item) => item.id === "a11"), false);
  assert.equal(next.removedIds.includes("a11"), true);
  assert.equal(next.algos.some((item) => item.id === "a10"), true);
});

