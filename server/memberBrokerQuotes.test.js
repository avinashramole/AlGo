import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchMemberBrokerQuotes,
  quotesFromAngelPayload,
  quotesFromFyersPayload,
  quotesFromUpstoxPayload,
  quotesFromZerodhaPayload,
} from "./memberBrokerQuotes.js";

test("Upstox quote payload maps index LTP without using a Dhan token", () => {
  const quotes = quotesFromUpstoxPayload({
    status: "success",
    data: {
      "NSE_INDEX:Nifty 50": { last_price: 25111.25, ohlc: { close: 25000 }, instrument_token: "NSE_INDEX|Nifty 50" },
      "NSE_INDEX:Nifty Bank": { last_price: 52100.5, ohlc: { close: 52000 } },
    },
  });
  const nifty = quotes.find((row) => row.symbol === "NIFTY 50");
  const bank = quotes.find((row) => row.symbol === "BANKNIFTY");
  assert.equal(nifty.ltp, 25111.25);
  assert.equal(nifty.close, 25000);
  assert.equal(nifty.kind, "index");
  assert.equal(bank.ltp, 52100.5);
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

test("fetchMemberBrokerQuotes never calls Dhan for an Upstox member", async () => {
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
