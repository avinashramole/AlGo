import assert from "node:assert/strict";
import test from "node:test";
import { formatConditionGroup, hydrateAlgos, normalizeAlgo, seedAlgos } from "./strategies.js";

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

test("hydrate first boot seeds the paused catalog", () => {
  const next = hydrateAlgos({}, seedAlgos());
  assert.equal(next.algos.length, 3);
  assert.equal(next.algos.map((row) => row.id).join(","), "a4,a5,a6");
  assert.equal(next.removedIds.length, 0);
});

test("hydrate does not resurrect a deleted catalog strategy after deploy", () => {
  const catalog = seedAlgos();
  const saved = catalog.filter((row) => row.id !== "a6");
  const next = hydrateAlgos({ algos: saved, removedIds: ["a6"] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a6"), false);
  assert.equal(next.algos.some((row) => row.name === "NIFTY 15m VWAP hedge"), false);
  assert.deepEqual(next.removedIds, ["a6"]);
  assert.equal(next.algos.length, 2);
});

test("hydrate still adds a new catalog strategy that was never deleted", () => {
  const catalog = seedAlgos();
  const next = hydrateAlgos({ algos: catalog.slice(0, 2), removedIds: [] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a6"), true);
  assert.equal(next.algos.find((row) => row.id === "a6").enabled, false);
});

test("hydrate keeps a user-created strategy and pauses a saved LIVE algo", () => {
  const catalog = seedAlgos();
  const custom = normalizeAlgo({ name: "My RSI", kind: "indicator" }, { id: "a99" });
  const liveAtm = { ...catalog[0], enabled: true, status: "LIVE" };
  const next = hydrateAlgos({ algos: [liveAtm, custom], removedIds: ["a5"] }, catalog);
  assert.equal(next.algos.some((row) => row.id === "a99"), true);
  assert.equal(next.algos.some((row) => row.id === "a5"), false);
  const atm = next.algos.find((row) => row.id === "a4");
  assert.equal(atm.enabled, false);
  assert.equal(atm.status, "PAUSED");
  assert.equal(next.algos.some((row) => row.id === "a6"), true);
});

