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
  assert.equal(next.algos.length, 9);
  assert.equal(next.algos.map((row) => row.id).join(","), "a4,a5,a6,a7,a8,a9,a10,a11,a12");
  assert.equal(next.removedIds.length, 0);
});

test("hydrate does not resurrect a deleted catalog strategy after deploy", () => {
  const catalog = seedAlgos();
  const saved = catalog.filter((row) => row.id !== "a6");
  const next = hydrateAlgos({ algos: saved, removedIds: ["a6"] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a6"), false);
  assert.equal(next.algos.some((row) => row.name === "NIFTY 15m VWAP hedge"), false);
  assert.deepEqual(next.removedIds, ["a6"]);
  assert.equal(next.algos.length, 8);
});

test("hydrate still adds a new catalog strategy that was never deleted", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos({ algos: catalog.slice(0, 2), removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a6"), true);
  assert.equal(next.algos.find((row) => row.id === "a6").enabled, false);
  assert.equal(next.algos.some((row) => row.id === "a7"), true);
  assert.equal(next.algos.find((row) => row.id === "a7").symbol, "CRUDEOIL");
  assert.equal(next.algos.find((row) => row.id === "a7").enabled, false);
  assert.equal(next.algos.some((row) => row.id === "a10"), true);
  assert.equal(next.algos.find((row) => row.id === "a10").enabled, false);
});

test("hydrate keeps a user-created strategy and a started LIVE algo after reload", () => {
  const catalog = seedAlgos();
  const custom = normalizeAlgo({ name: "My RSI", kind: "indicator" }, { id: "a99" });
  const liveAtm = { ...catalog[0], enabled: true, status: "LIVE" };
  const next = hydrateAlgos({ algos: [liveAtm, custom], removedIds: ["a5"] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a99"), true);
  assert.equal(next.algos.some((row) => row.id === "a5"), false);
  const atm = next.algos.find((row) => row.id === "a4");
  assert.equal(atm.enabled, true);
  assert.equal(atm.status, "LIVE");
  assert.equal(next.algos.some((row) => row.id === "a6"), true);
  assert.equal(next.algos.some((row) => row.id === "a7"), true);
  assert.equal(next.algos.find((row) => row.id === "a7").enabled, false);
});

test("hydrate does not start a paused strategy from the catalog", () => {
  const catalog = seedAlgos();
  const paused = { ...catalog[0], enabled: false, status: "PAUSED" };
  const next = hydrateAlgos({ algos: [paused], removedIds: [] }, catalog);
  const atm = next.algos.find((row) => row.id === "a4");
  assert.equal(atm.enabled, false);
  assert.equal(atm.status, "PAUSED");
});

test("seed includes paused CRUDE OIL option strategies", () => {
  const seeded = seedAlgos();
  const crude = seeded.filter((row) => row.symbol === "CRUDEOIL");
  assert.equal(crude.length, 4);
  assert.equal(crude.every((row) => row.enabled === false), true);
  assert.equal(crude.every((row) => row.status === "PAUSED"), true);
  assert.equal(crude.every((row) => row.instrument === "option"), true);
  assert.equal(crude.every((row) => row.lotSize === 100), true);
  assert.equal(crude.filter((row) => row.kind === "indicator").length, 3);
  assert.equal(seeded.find((row) => row.id === "a7").name, "CRUDE OIL VWAP ATM");
  assert.equal(seeded.find((row) => row.id === "a8").name, "CRUDE OIL 15m VWAP reversal");
  assert.equal(seeded.find((row) => row.id === "a8").timeframe, "15m");
  assert.equal(seeded.find((row) => row.id === "a9").name, "CRUDE OIL Supertrend ATM");
  assert.equal(seeded.find((row) => row.id === "a9").indicator, "SUPERTREND");
  assert.equal(seeded.find((row) => row.id === "a6").symbol, "NIFTY");
  const firstCandle = seeded.find((row) => row.id === "a10");
  assert.equal(firstCandle.name, "NIFTY 5m first candle");
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
  assert.equal(crudeFirst.name, "CRUDE OIL 5m first candle");
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
  assert.match(row.summary, /preview/i);
  assert.doesNotMatch(row.summary, /close above|price action/i);
  const nifty = normalizeAlgo({ name: "NIFTY 5m first candle", kind: "indicator" });
  assert.equal(nifty.kind, "nifty-first-candle");
  assert.equal(nifty.symbol, "NIFTY");
  assert.equal(nifty.endTimeIst, "15:15");
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

test("seed includes paused nifty test future strategy", () => {
  const seeded = seedAlgos();
  const row = seeded.find((item) => item.id === "a11");
  assert.equal(row.name, "nifty test");
  assert.equal(row.kind, "nifty-test");
  assert.equal(row.strategyType, "NIFTY_TEST");
  assert.equal(row.symbol, "NIFTY");
  assert.equal(row.instrument, "future");
  assert.equal(row.side, "BOTH");
  assert.equal(row.timeframe, "5m");
  assert.equal(row.startTimeIst, "09:15");
  assert.equal(row.endTimeIst, "15:15");
  assert.equal(row.enabled, false);
  assert.equal(row.status, "PAUSED");
  assert.match(row.summary, /current candle above open → BUY/);
  assert.match(row.summary, /current candle below open → SELL/);
});

test("nifty test time input is kept when the saved row is generic", () => {
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
  const row = next.algos.find((item) => item.id === "a11");
  assert.equal(row.kind, "nifty-test");
  assert.equal(row.instrument, "future");
  assert.equal(row.side, "BOTH");
  assert.equal(row.timeframe, "15m");
  assert.equal(row.startTimeIst, "09:20");
  assert.equal(row.endTimeIst, "15:00");
  assert.equal(row.slPct, 0.5);
  assert.equal(row.targetPct, 1);
  assert.equal(row.enabled, false);
});

