import assert from "node:assert/strict";
import test from "node:test";
import {
  crudeInstrumentKey,
  crudeQuoteFromPayload,
  fetchMemberBrokerQuotes,
  frontMonthFutCode,
  pickCrudeSearchHit,
  quotesFromAngelPayload,
  quotesFromFyersPayload,
  quotesFromUpstoxPayload,
  quotesFromZerodhaPayload,
  resetUpstoxInstrumentCache,
  rowsFromUpstoxInstrumentText,
} from "./memberBrokerQuotes.js";

test("Upstox instrument master rows parse and pick the front Crude future", () => {
  resetUpstoxInstrumentCache();
  const rows = rowsFromUpstoxInstrumentText(
    JSON.stringify([
      { tradingsymbol: "CRUDEOILM26OCTFUT", instrument_type: "FUT", instrument_key: "MCX_FO|mini", expiry: "2026-10-16" },
      { tradingsymbol: "CRUDEOIL26OCTFUT", instrument_type: "FUT", instrument_key: "MCX_FO|426268", expiry: "2026-10-16" },
      { tradingsymbol: "CRUDEOIL26NOVFUT", instrument_type: "FUT", instrument_key: "MCX_FO|427608", expiry: "2026-11-19" },
    ]),
  );
  assert.equal(pickCrudeSearchHit(rows), "MCX_FO|426268");
});

test("Upstox quote payload maps index LTP without using a Dhan token", () => {
  const quotes = quotesFromUpstoxPayload({
    status: "success",
    data: {
      "NSE_INDEX:Nifty 50": { last_price: 25111.25, ohlc: { close: 25000 }, instrument_token: "NSE_INDEX|Nifty 50" },
      "NSE_INDEX:Nifty Bank": { last_price: 52100.5, ohlc: { close: 52000 } },
      "NSE_INDEX:India VIX": { last_price: 12.8, ohlc: { close: 12.4 } },
    },
  });
  const nifty = quotes.find((row) => row.symbol === "NIFTY 50");
  const bank = quotes.find((row) => row.symbol === "BANKNIFTY");
  assert.equal(nifty.ltp, 25111.25);
  assert.equal(nifty.close, 25000);
  assert.equal(nifty.kind, "index");
  assert.equal(bank.ltp, 52100.5);
  assert.equal(quotes.find((row) => row.symbol === "INDIA VIX").ltp, 12.8);
});

test("front-month Crude key is isolated from the index batch", () => {
  assert.equal(frontMonthFutCode("CRUDEOIL", "2026-10-16"), "CRUDEOIL26OCTFUT");
  assert.equal(crudeInstrumentKey("upstox", "2026-10-16"), "MCX_FO|CRUDEOIL26OCTFUT");
  assert.equal(crudeInstrumentKey("zerodha", "2026-10-16"), "MCX:CRUDEOIL26OCTFUT");
});

test("Upstox Crude search picks the nearest CRUDEOIL future instrument_key", () => {
  assert.equal(
    pickCrudeSearchHit([
      { trading_symbol: "CRUDEOILM 16 OCT 26", instrument_type: "FUT", instrument_key: "MCX_FO|mini" },
      { trading_symbol: "CRUDEOIL 16 OCT 26", instrument_type: "FUT", instrument_key: "MCX_FO|426268", expiry: "2026-10-16" },
      { trading_symbol: "CRUDEOIL 19 NOV 26", instrument_type: "FUT", instrument_key: "MCX_FO|427608", expiry: "2026-11-19" },
    ]),
    "MCX_FO|426268",
  );
});

test("Crude LTP can be read from a numeric Upstox instrument key", () => {
  const quote = crudeQuoteFromPayload({
    data: { "MCX_FO:426268": { last_price: 6124.5, instrument_token: "MCX_FO|CRUDEOIL26OCTFUT", ohlc: { close: 6100 } } },
  });
  assert.equal(quote.symbol, "CRUDEOIL");
  assert.equal(quote.ltp, 6124.5);
});

test("Zerodha quote payload maps NSE/BSE index keys", () => {
  const quotes = quotesFromZerodhaPayload({
    data: {
      "NSE:NIFTY 50": { last_price: 24001, ohlc: { close: 23900 } },
      "BSE:SENSEX": { last_price: 81000, ohlc: { close: 80900 } },
    },
  });
  assert.equal(quotes.find((row) => row.symbol === "NIFTY 50").ltp, 24001);
  assert.equal(quotes.find((row) => row.symbol === "SENSEX").ltp, 81000);
});

test("Fyers quote payload reads lp from the d array", () => {
  const quotes = quotesFromFyersPayload({
    s: "ok",
    d: [{ n: "NSE:NIFTY50-INDEX", v: { lp: 25140, prev_close_price: 25010 } }],
  });
  assert.equal(quotes[0].symbol, "NIFTY 50");
  assert.equal(quotes[0].ltp, 25140);
  assert.equal(quotes[0].close, 25010);
});

test("Angel quote payload maps symbol tokens", () => {
  const quotes = quotesFromAngelPayload({
    data: { fetched: [{ symbolToken: "99926000", ltp: 25002, close: 24900 }] },
  });
  assert.equal(quotes[0].symbol, "NIFTY 50");
  assert.equal(quotes[0].ltp, 25002);
});

test("fetchMemberBrokerQuotes calls Upstox with the member Bearer token", async () => {
  resetUpstoxInstrumentCache();
  const seen = [];
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "upstox",
    accessToken: "upstox-member-token",
    clientId: "UPX1",
    fetchImpl: async (url, options) => {
      seen.push({ url, auth: options.headers.Authorization });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { "NSE_INDEX:Nifty 50": { last_price: 25111.25, ohlc: { close: 25000 } } },
          }),
      };
    },
  });
  assert.match(seen[0].url, /api\.upstox\.com\/v2\/market-quote/);
  assert.equal(seen[0].auth, "Bearer upstox-member-token");
  assert.equal(quotes[0].ltp, 25111.25);
  assert.equal(String(JSON.stringify(quotes)).includes("upstox-member-token"), false);
});

test("fetchMemberBrokerQuotes resolves Crude from the public MCX instrument file", async () => {
  resetUpstoxInstrumentCache();
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "upstox",
    accessToken: "upstox-member-token",
    clientId: "UPX1",
    fetchImpl: async (url) => {
      if (String(url).includes("instruments/exchange/MCX.json")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              { tradingsymbol: "CRUDEOIL26OCTFUT", instrument_type: "FUT", instrument_key: "MCX_FO|426268", expiry: "2026-10-16" },
            ]),
        };
      }
      if (String(url).includes("MCX_FO%7C426268") || String(url).includes("MCX_FO|426268")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { "MCX_FO:426268": { last_price: 6131.2, instrument_token: "MCX_FO|426268" } } }),
        };
      }
      if (String(url).includes("/instruments/search") || String(url).includes("/search/instruments")) {
        return { ok: false, status: 404, text: async () => JSON.stringify({ message: "not found" }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { "NSE_INDEX:Nifty 50": { last_price: 25111 } } }),
      };
    },
  });
  assert.equal(quotes.find((row) => row.symbol === "NIFTY 50").ltp, 25111);
  assert.equal(quotes.find((row) => row.symbol === "CRUDEOIL").ltp, 6131.2);
});

test("fetchMemberBrokerQuotes resolves Crude from the Upstox search instrument_key", async () => {
  resetUpstoxInstrumentCache();
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "upstox",
    accessToken: "upstox-member-token",
    clientId: "UPX1",
    fetchImpl: async (url) => {
      if (String(url).includes("/instruments/search") || String(url).includes("/search/instruments")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              data: [{ trading_symbol: "CRUDEOIL 16 OCT 26", instrument_type: "FUT", instrument_key: "MCX_FO|426268", expiry: "2026-10-16" }],
            }),
        };
      }
      if (String(url).includes("MCX_FO%7C426268") || String(url).includes("MCX_FO|426268")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { "MCX_FO:426268": { last_price: 6128.4, instrument_token: "MCX_FO|CRUDEOIL26OCTFUT" } } }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { "NSE_INDEX:Nifty 50": { last_price: 25111 } } }),
      };
    },
  });
  assert.equal(quotes.find((row) => row.symbol === "NIFTY 50").ltp, 25111);
  assert.equal(quotes.find((row) => row.symbol === "CRUDEOIL").ltp, 6128.4);
});

test("fetchMemberBrokerQuotes never calls Dhan for an Upstox member", async () => {
  resetUpstoxInstrumentCache();
  let dhan = false;
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "upstox",
    accessToken: "upstox-member-token",
    clientId: "UPX1",
    fetchDhan: async () => {
      dhan = true;
      return [{ symbol: "NIFTY 50", parent: "NIFTY 50", kind: "index", ltp: 1 }];
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { "NSE_INDEX:Nifty 50": { last_price: 25100 } } }),
    }),
  });
  assert.equal(dhan, false);
  assert.equal(quotes[0].ltp, 25100);
});
