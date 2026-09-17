import assert from "node:assert/strict";
import test from "node:test";
import { flattenQuotes, matchLiveInstrument, parseFeedPackets, staleQuoteFamilies } from "./dhan.js";
import { applyLiveQuotes, snapshot } from "./market.js";

const BOTH = [
  { symbol: "NIFTY FUT", parent: "NIFTY 50", segment: "NSE_FNO", securityId: 565899, kind: "future" },
  { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", segment: "MCX_COMM", securityId: 565899, kind: "future" },
  { symbol: "NIFTY 50", parent: "NIFTY 50", segment: "IDX_I", securityId: 13, kind: "index" },
];

function tickerPacket({ code = 2, segment, securityId, ltp }) {
  const buf = Buffer.alloc(16);
  buf.writeUInt8(code, 0);
  buf.writeUInt16LE(16, 1);
  buf.writeUInt8(segment, 3);
  buf.writeInt32LE(securityId, 4);
  buf.writeFloatLE(ltp, 8);
  return buf;
}

test("matchLiveInstrument keeps NSE and MCX ids on different segments", () => {
  assert.equal(matchLiveInstrument(BOTH, 565899, "MCX_COMM").symbol, "CRUDEOIL FUT");
  assert.equal(matchLiveInstrument(BOTH, 565899, "NSE_FNO").symbol, "NIFTY FUT");
  assert.equal(matchLiveInstrument(BOTH, 565899, 5).symbol, "CRUDEOIL FUT");
  assert.equal(matchLiveInstrument(BOTH, 565899, 2).symbol, "NIFTY FUT");
  assert.equal(matchLiveInstrument(BOTH, 565899, "IDX_I"), null);
});

test("websocket packets with the same security id stay on their exchange", () => {
  const mcx = parseFeedPackets(tickerPacket({ segment: 5, securityId: 565899, ltp: 5840.5 }), BOTH);
  const nse = parseFeedPackets(tickerPacket({ segment: 2, securityId: 565899, ltp: 25110 }), BOTH);
  const idx = parseFeedPackets(tickerPacket({ code: 1, segment: 0, securityId: 13, ltp: 25080 }), BOTH);
  assert.equal(mcx[0].parent, "CRUDEOIL");
  assert.ok(Math.abs(mcx[0].ltp - 5840.5) < 0.02);
  assert.equal(nse[0].parent, "NIFTY 50");
  assert.equal(idx[0].kind, "index");
  assert.ok(Math.abs(idx[0].ltp - 25080) < 0.02);
});

test("REST quotes keyed by MCX_COMM do not attach to NSE_FNO", () => {
  const quotes = flattenQuotes(
    {
      data: {
        MCX_COMM: { 565899: { last_price: 5840 } },
        NSE_FNO: { 565899: { last_price: 25110 } },
        IDX_I: { 13: { last_price: 25080, net_change: 40 } },
      },
    },
    BOTH,
  );
  const crude = quotes.find((row) => row.parent === "CRUDEOIL");
  const niftyFut = quotes.find((row) => row.kind === "future" && row.parent === "NIFTY 50");
  const nifty = quotes.find((row) => row.kind === "index");
  assert.equal(crude.ltp, 5840);
  assert.equal(niftyFut.ltp, 25110);
  assert.equal(nifty.ltp, 25080);
});

test("desk shows NSE spot/future and MCX crude separately", () => {
  applyLiveQuotes([
    { symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 25100 },
    { symbol: "NIFTY FUT", parent: "NIFTY 50", kind: "future", ltp: 25200 },
    { symbol: "CRUDEOIL FUT", parent: "CRUDEOIL", kind: "future", ltp: 5840 },
  ]);
  const nifty = snapshot().indices.find((row) => row.symbol === "NIFTY 50");
  const crude = snapshot().indices.find((row) => row.symbol === "CRUDEOIL");
  assert.equal(nifty.price, 25100);
  assert.equal(nifty.future, 25200);
  assert.equal(crude.price, 5840);
  assert.equal(crude.future, 5840);
});

test("staleQuoteFamilies still REST-fetches NSE after close while MCX ticks", () => {
  const now = Date.parse("2026-09-18T10:31:00.000Z");
  assert.deepEqual(
    staleQuoteFamilies({
      now,
      nseTickAt: 0,
      mcxTickAt: now - 400,
      nseOpen: false,
      mcxOpen: true,
    }),
    ["nse"],
  );
  assert.deepEqual(
    staleQuoteFamilies({
      now,
      nseTickAt: now - 2_000,
      mcxTickAt: now - 400,
      nseOpen: false,
      mcxOpen: true,
    }),
    [],
  );
  assert.deepEqual(
    staleQuoteFamilies({
      now,
      nseTickAt: now - 20_000,
      mcxTickAt: now - 400,
      nseOpen: false,
      mcxOpen: true,
    }),
    ["nse"],
  );
  assert.deepEqual(
    staleQuoteFamilies({
      now,
      nseTickAt: now - 1_000,
      mcxTickAt: now - 1_000,
      nseOpen: true,
      mcxOpen: true,
    }),
    [],
  );
});

test("flattenQuotes uses official close when last_price is 0 after NSE close", () => {
  const quotes = flattenQuotes(
    {
      data: {
        IDX_I: { 13: { last_price: 0, ohlc: { open: 25000, close: 25080.4 } } },
        NSE_FNO: { 565899: { last_price: 0, close: 25110 } },
        MCX_COMM: { 565899: { last_price: 5840 } },
      },
    },
    BOTH,
  );
  const crude = quotes.find((row) => row.parent === "CRUDEOIL");
  const niftyFut = quotes.find((row) => row.kind === "future" && row.parent === "NIFTY 50");
  const nifty = quotes.find((row) => row.kind === "index");
  assert.equal(nifty.ltp, 25080.4);
  assert.equal(niftyFut.ltp, 25110);
  assert.equal(crude.ltp, 5840);
});

test("flattenQuotes prefers last_price over previous close", () => {
  const quotes = flattenQuotes(
    {
      data: {
        IDX_I: { 13: { last_price: 25091.2, ohlc: { close: 24980 } } },
      },
    },
    BOTH,
  );
  assert.equal(quotes[0].ltp, 25091.2);
  assert.equal(quotes[0].close, 24980);
});

test("prev-close websocket packets do not invent an NSE last price", () => {
  const buf = Buffer.alloc(16);
  buf.writeUInt8(6, 0);
  buf.writeUInt16LE(16, 1);
  buf.writeUInt8(0, 3);
  buf.writeInt32LE(13, 4);
  buf.writeFloatLE(24980, 8);
  const quotes = parseFeedPackets(buf, BOTH);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].prevClose, 24980);
  assert.equal(quotes[0].ltp, undefined);
});
