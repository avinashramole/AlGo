import assert from "node:assert/strict";
import test from "node:test";
import { flattenQuotes } from "./dhan.js";
import { fallbackFrontFutures, parseScripMasterText } from "./frontFutures.js";
import { applyLiveQuotes, snapshot } from "./market.js";
import { UNDERLYINGS } from "./optionChain.js";

test("Market tape paints live Natural Gas and Copper futures like Crude", () => {
  applyLiveQuotes([
    { symbol: "NATURALGAS FUT", parent: "NATURALGAS", kind: "future", ltp: 312.4, prevClose: 308.1, securityId: "570750" },
    { symbol: "COPPER FUT", parent: "COPPER", kind: "future", ltp: 918.6, prevClose: 911.2, securityId: "574829" },
  ]);
  const gas = snapshot().indices.find((row) => row.symbol === "NATURALGAS");
  const copper = snapshot().indices.find((row) => row.symbol === "COPPER");
  assert.equal(gas.price, 312.4);
  assert.equal(gas.future, 312.4);
  assert.equal(copper.price, 918.6);
  assert.equal(copper.future, 918.6);
  assert.equal(gas.name, "NATURAL GAS");
});

test("scrip master keeps NATURALGAS and COPPER futures and drops minis", async () => {
  const csv = [
    "SEM_EXM_EXCH_ID,SEM_SEGMENT,SEM_SMST_SECURITY_ID,SEM_INSTRUMENT_NAME,SEM_EXPIRY_CODE,SEM_TRADING_SYMBOL,SEM_LOT_UNITS,SEM_CUSTOM_SYMBOL,SEM_EXPIRY_DATE,SEM_STRIKE_PRICE,SEM_OPTION_TYPE,SEM_TICK_SIZE,SEM_EXPIRY_FLAG,SEM_EXCH_INSTRUMENT_TYPE,SEM_SERIES,SM_SYMBOL_NAME",
    "MCX,M,570750,FUTCOM,0,NATURALGAS-27Oct2026-FUT,1.0,NATURALGAS OCT FUT,2026-10-27 23:30:00,0.00000,XX,10.0000,M,FUTCOM,2,NATURALGAS",
    "MCX,M,570751,FUTCOM,0,NATGASMINI-27Oct2026-FUT,1.0,NATURALGASM OCT FUT,2026-10-27 23:30:00,0.00000,XX,10.0000,M,FUTCOM,2,NATGASMINI",
    "MCX,M,574829,FUTCOM,0,COPPER-30Oct2026-FUT,1.0,COPPER OCT FUT,2026-10-30 23:30:00,0.00000,XX,5.0000,M,FUTCOM,2,COPPER",
  ].join("\n");
  const parsed = await parseScripMasterText(csv, { T2S_SCRIP_YIELD_EVERY: "0" });
  const gas = parsed.instruments.find((row) => row.parent === "NATURALGAS");
  const copper = parsed.instruments.find((row) => row.parent === "COPPER");
  assert.equal(Number(gas?.securityId), 570750);
  assert.equal(Number(copper?.securityId), 574829);
  assert.equal(
    parsed.instruments.some((row) => String(row.symbol || "").includes("NATGASMINI")),
    false,
  );
});

test("REST MCX quotes attach Natural Gas and Copper", () => {
  const instruments = [
    { symbol: "NATURALGAS FUT", parent: "NATURALGAS", segment: "MCX_COMM", securityId: 570750, kind: "future" },
    { symbol: "COPPER FUT", parent: "COPPER", segment: "MCX_COMM", securityId: 574829, kind: "future" },
  ];
  const quotes = flattenQuotes(
    {
      data: {
        MCX_COMM: {
          570750: { last_price: 314.2 },
          574829: { last_price: 921.5 },
        },
      },
    },
    instruments,
  );
  assert.equal(quotes.find((row) => row.parent === "NATURALGAS").ltp, 314.2);
  assert.equal(quotes.find((row) => row.parent === "COPPER").ltp, 921.5);
});

test("fallback futures and option scrips include Natural Gas and Copper", () => {
  const parents = fallbackFrontFutures().map((row) => row.parent);
  assert.equal(parents.includes("NATURALGAS"), true);
  assert.equal(parents.includes("COPPER"), true);
  assert.equal(UNDERLYINGS.find((row) => row.id === "NATURALGAS").scrip, 570750);
  assert.equal(UNDERLYINGS.find((row) => row.id === "COPPER").scrip, 574829);
});
