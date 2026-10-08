import assert from "node:assert/strict";
import test from "node:test";
import {
  crudeInstrumentKey,
  crudeQuoteFromPayload,
  fetchMemberBrokerQuotes,
  frontMonthFutCode,
  kotakCrudeSymbols,
  kotakNeoFutCode,
  pickCrudeSearchHit,
  quoteFromKotakCrude,
  quotesFromAngelPayload,
  quotesFromFyersPayload,
  quotesFromKotakPayload,
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

test("Kotak Neo Crude symbols include the MCX expiry-day code", () => {
  assert.equal(kotakNeoFutCode("CRUDEOIL", "2026-10-19"), "CRUDEOIL19OCT26FUT");
  assert.equal(kotakNeoFutCode("CRUDEOIL", "2026-11-19"), "CRUDEOIL19NOV26FUT");
  const codes = kotakCrudeSymbols(["2026-10-19", "2026-11-19"]);
  assert.deepEqual(codes, [
    "CRUDEOIL19OCT26FUT",
    "CRUDEOIL19NOV26FUT",
    "CRUDEOIL26OCTFUT",
    "CRUDEOIL26NOVFUT",
    "CRUDEOIL",
  ]);
});

test("Kotak Crude quote reads Neo object payload ts/lp", () => {
  const quote = quoteFromKotakCrude({
    stat: "Ok",
    data: {
      "mcx_fo|CRUDEOIL19OCT26FUT": {
        ts: "CRUDEOIL19OCT26FUT",
        lp: "6124.50",
        c: "6100.00",
        chg: "24.50",
      },
    },
  });
  assert.equal(quote.symbol, "CRUDEOIL");
  assert.equal(quote.kind, "future");
  assert.equal(quote.ltp, 6124.5);
  assert.equal(quote.close, 6100);
  assert.equal(quote.expiry, "2026-10-19");
});

test("Kotak Crude quote ignores mini contracts and CE/PE rows", () => {
  const quote = quoteFromKotakCrude({
    data: [
      { ts: "CRUDEOILM19OCT26FUT", lp: "5000" },
      { ts: "CRUDEOIL19OCT26 6100 CE", lp: "42.5" },
      { trading_symbol: "CRUDEOIL19OCT26FUT", ltp: "6131.2", ohlc: { close: "6108" } },
    ],
  });
  assert.equal(quote.ltp, 6131.2);
  assert.equal(quote.close, 6108);
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
  assert.equal(quotes[0].prevClose, 25010);
});

test("Angel quote payload maps symbol tokens", () => {
  const quotes = quotesFromAngelPayload({
    data: { fetched: [{ symbolToken: "99926000", ltp: 25002, close: 24900 }] },
  });
  assert.equal(quotes[0].symbol, "NIFTY 50");
  assert.equal(quotes[0].ltp, 25002);
  assert.equal(quotes[0].close, 24900);
  assert.equal(quotes[0].prevClose, 24900);
});

test("Kotak Neo quote payload maps index LTP and yesterday close", () => {
  const quotes = quotesFromKotakPayload([
    {
      exchange_token: "Nifty 50",
      display_symbol: "Nifty 50-IN",
      exchange: "nse_cm",
      ltp: "22421.9500",
      change: "-198.5000",
      ohlc: { close: "22620.4500" },
    },
    { exchange_token: "Nifty Bank", exchange: "nse_cm", ltp: "54450.7500", ohlc: { close: "54633.0500" } },
    { exchange_token: "INDIA VIX", exchange: "nse_cm", ltp: "14.5200", ohlc: { close: "14.8000" } },
  ]);
  const nifty = quotes.find((row) => row.symbol === "NIFTY 50");
  assert.equal(nifty.ltp, 22421.95);
  assert.equal(nifty.close, 22620.45);
  assert.equal(nifty.kind, "index");
  assert.equal(quotes.find((row) => row.symbol === "BANKNIFTY").ltp, 54450.75);
  assert.equal(quotes.find((row) => row.symbol === "INDIA VIX").ltp, 14.52);
});

test("fetchMemberBrokerQuotes calls Kotak with the plain consumer key", async () => {
  const seen = [];
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "kotak",
    apiKey: "kotak-consumer-key",
    accessToken: "kotak-consumer-key",
    clientId: "YIX14",
    fetchImpl: async (url, options) => {
      seen.push({ url, auth: options.headers.Authorization });
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { exchange_token: "Nifty 50", exchange: "nse_cm", ltp: "22421.9500", ohlc: { close: "22620.4500" } },
          ]),
      };
    },
  });
  assert.match(seen[0].url, /mis\.kotaksecurities\.com\/script-details\/1\.0\/quotes\/neosymbol\//);
  assert.match(seen[0].url, /Nifty%2050/);
  assert.equal(seen[0].auth, "kotak-consumer-key");
  assert.equal(quotes[0].ltp, 22421.95);
  assert.equal(String(JSON.stringify(quotes)).includes("kotak-consumer-key"), false);
  assert.equal(String(JSON.stringify(quotes)).includes("YIX14"), false);
});

test("Kotak crude is requested on MCX after the index quotes", async () => {
  const seen = [];
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "kotak",
    apiKey: "member-consumer-key",
    accessToken: "trade-token-1452",
    clientId: "YT2Vm",
    fetchImpl: async (url) => {
      const raw = decodeURIComponent(String(url));
      seen.push(raw);
      if (raw.includes("mcx_fo|CRUDEOIL/")) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ message: "invalid symbol" }) };
      }
      if (raw.includes("mcx_fo|CRUDEOIL")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              { exchange_token: "CRUDEOILM26OCTFUT", trading_symbol: "CRUDEOILM26OCTFUT", ltp: "5000" },
              { exchange_token: "CRUDEOIL26OCTFUT", trading_symbol: "CRUDEOIL26OCTFUT", exchange: "mcx_fo", ltp: "6124.5", ohlc: { close: "6100" } },
            ]),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ exchange_token: "Nifty 50", exchange: "nse_cm", ltp: "22421.95", ohlc: { close: "22620.45" } }]),
      };
    },
  });
  assert.match(seen[0], /nse_cm\|Nifty 50/);
  assert.ok(seen.some((url) => url.includes("mcx_fo|CRUDEOIL")));
  assert.equal(quotes.find((row) => row.symbol === "NIFTY 50").ltp, 22421.95);
  const crude = quotes.find((row) => row.symbol === "CRUDEOIL");
  assert.equal(crude.ltp, 6124.5);
  assert.equal(crude.kind, "future");
  assert.equal(JSON.stringify(quotes).includes("YT2Vm"), false);
  assert.equal(JSON.stringify(quotes).includes("trade-token-1452"), false);
});

test("Kotak Crude feed uses the Neo expiry-day symbol when Kite-style codes fail", async () => {
  const seen = [];
  const quotes = await fetchMemberBrokerQuotes({
    brokerId: "kotak",
    apiKey: "member-consumer-key",
    accessToken: "trade-token-1452",
    clientId: "YT2VM",
    fetchImpl: async (url) => {
      const raw = decodeURIComponent(String(url));
      seen.push(raw);
      if (raw.includes("mcx_fo|CRUDEOIL19OCT26FUT") || raw.includes("mcx_fo|CRUDEOIL19NOV26FUT")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              stat: "Ok",
              data: {
                "mcx_fo|CRUDEOIL19OCT26FUT": { ts: "CRUDEOIL19OCT26FUT", lp: "6140.00", c: "6112.00" },
              },
            }),
        };
      }
      if (raw.includes("mcx_fo|")) {
        return { ok: false, status: 400, text: async () => JSON.stringify({ message: "invalid symbol" }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{ exchange_token: "Nifty 50", exchange: "nse_cm", ltp: "22421.95", ohlc: { close: "22620.45" } }]),
      };
    },
  });
  assert.ok(seen.some((url) => url.includes("mcx_fo|CRUDEOIL19OCT26FUT") || url.includes("mcx_fo|CRUDEOIL19NOV26FUT")));
  assert.equal(quotes.find((row) => row.symbol === "NIFTY 50").ltp, 22421.95);
  const crude = quotes.find((row) => row.symbol === "CRUDEOIL");
  assert.equal(crude.ltp, 6140);
  assert.equal(crude.kind, "future");
  assert.equal(crude.close, 6112);
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
