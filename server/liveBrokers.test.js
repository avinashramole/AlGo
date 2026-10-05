import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setLivePriceReader } from "./executionSpeed.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-live-brokers-"));
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const {
  connectLiveBroker,
  disconnectLiveBroker,
  fyersAuthHeader,
  fyersPlaceOrderBody,
  fyersSymbol,
  isLiveBrokerReady,
  clearKotakTradeCache,
  firstKotakMobile,
  kotakMobileNumber,
  kotakMobileNumberCandidates,
  kotakOrderAmo,
  kotakTotpCandidates,
  nfoTradingSymbol,
  parseDeskFutureSymbol,
  parseDeskOptionSymbol,
  pickUpstoxOptionHit,
  placeLiveBrokerOrder,
  resetUpstoxMasterCache,
  resetUpstoxMcxApiDisable,
  upstoxErrorMessage,
  upstoxExpiryDate,
  upstoxExpiryDay,
  upstoxInstrumentKeyFromPayload,
} = await import("./liveBrokers.js");

test("Upstox copy maps a Dhan desk option to an NSE_FO instrument key", () => {
  assert.deepEqual(parseDeskOptionSymbol("NIFTY 22850 CE"), { root: "NIFTY", strike: 22850, option: "CE" });
  assert.deepEqual(parseDeskOptionSymbol("NIFTY-Sep2026-22850-PE"), {
    root: "NIFTY",
    strike: 22850,
    option: "PE",
    expiry: "2026-09",
  });
  assert.deepEqual(parseDeskOptionSymbol("NIFTY-23Sep2026-22850-PE"), {
    root: "NIFTY",
    strike: 22850,
    option: "PE",
    expiry: "2026-09-23",
  });
  assert.equal(upstoxInstrumentKeyFromPayload({ securityId: "55123" }), "");
  assert.equal(upstoxInstrumentKeyFromPayload({ instrumentKey: "NSE_FO|426268" }), "NSE_FO|426268");
  assert.equal(
    pickUpstoxOptionHit(
      [
        { trading_symbol: "BANKNIFTY 23 SEP 25 22850 CE", instrument_type: "CE", strike_price: 22850, instrument_key: "NSE_FO|bank" },
        { trading_symbol: "NIFTY 23 SEP 25 22850 CE", underlying_symbol: "NIFTY", instrument_type: "CE", strike_price: 22850, expiry: "2026-09-23", instrument_key: "NSE_FO|98765" },
      ],
      { root: "NIFTY", strike: 22850, option: "CE", expiry: "2026-09-23" },
    ),
    "NSE_FO|98765",
  );
  assert.equal(
    pickUpstoxOptionHit(
      [
        { trading_symbol: "NIFTY 30 JUN 26 22850 PE", instrument_type: "PE", strike_price: 22850, expiry: "2026-06-30", instrument_key: "NSE_FO|june" },
        { trading_symbol: "NIFTY 29 SEP 26 22850 PE", instrument_type: "PE", strike_price: 22850, expiry: "2026-09-29", instrument_key: "NSE_FO|426269" },
      ],
      { root: "NIFTY", strike: 22850, option: "PE", expiry: "2026-09" },
    ),
    "NSE_FO|426269",
  );
});

test("Upstox crude copy uses the CRUDEOIL contract, not NIFTY or CRUDEOILM", () => {
  assert.deepEqual(parseDeskOptionSymbol("CRUDEOIL 8700 CE"), { root: "CRUDEOIL", strike: 8700, option: "CE" });
  assert.deepEqual(parseDeskOptionSymbol("CRUDEOIL 15 OCT 8700 CALL"), {
    root: "CRUDEOIL",
    strike: 8700,
    option: "CE",
    expiry: "2026-10-15",
  });
  assert.deepEqual(parseDeskOptionSymbol("CRUDEOIL 15 OCT 26 8700 CALL"), {
    root: "CRUDEOIL",
    strike: 8700,
    option: "CE",
    expiry: "2026-10-15",
  });
  assert.deepEqual(parseDeskOptionSymbol("CRUDEOIL-15Oct2026-8700-CE"), {
    root: "CRUDEOIL",
    strike: 8700,
    option: "CE",
    expiry: "2026-10-15",
  });
  assert.equal(parseDeskOptionSymbol("CRUDEOIL", { strike: 8700, option: "CE", expiry: "2026-10-15" }).root, "CRUDEOIL");
  assert.equal(
    pickUpstoxOptionHit(
      [
        {
          trading_symbol: "CRUDEOILM 15 OCT 26 8700 CE",
          underlying_symbol: "CRUDEOILM",
          instrument_type: "CE",
          strike_price: 8700,
          expiry: "2026-10-15",
          instrument_key: "MCX_FO|mini",
        },
        {
          trading_symbol: "CRUDEOIL 15 OCT 26 8700 CALL",
          underlying_symbol: "CRUDEOIL",
          instrument_type: "CE",
          strike_price: 8700,
          expiry: "2026-10-15",
          instrument_key: "MCX_FO|8700ce",
        },
      ],
      { root: "CRUDEOIL", strike: 8700, option: "CE", expiry: "2026-10-15" },
    ),
    "MCX_FO|8700ce",
  );
});

test("placeLiveBrokerOrder sends the crude Upstox copy as a 1-lot limit", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes("search/instruments")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "CRUDEOILM 15 OCT 26 8700 CE",
                underlying_symbol: "CRUDEOILM",
                instrument_type: "CE",
                strike_price: 8700,
                expiry: "2026-10-15",
                instrument_key: "MCX_FO|mini",
              },
              {
                trading_symbol: "CRUDEOIL 15 OCT 26 8700 CE",
                underlying_symbol: "CRUDEOIL",
                instrument_type: "CE",
                strike_price: 8700,
                expiry: "2026-10-15",
                instrument_key: "MCX_FO|8700ce",
              },
            ],
          }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "upx-crude-1" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox-crude",
      brokerSession: { accessToken: "upstox-member-token", clientId: "UPX1" },
      symbol: "CRUDEOIL 8700 CE",
      side: "BUY",
      qty: 100,
      lots: 1,
      lotSize: 100,
      type: "LIMIT",
      price: 468.6,
      strike: 8700,
      option: "CE",
      expiry: "2026-10-15",
      exchangeSegment: "MCX_COMM",
      securityId: "55123",
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-crude-1");
  assert.match(calls[0].url, /search\/instruments/);
  assert.match(calls[0].url, /CRUDEOIL%208700%20CE/);
  assert.equal(calls[0].url.includes("NIFTY"), false);
  assert.match(calls[1].url, /api-hft\.upstox\.com\/v3\/order\/place/);
  const placed = JSON.parse(calls[1].body);
  assert.equal(placed.instrument_token, "MCX_FO|8700ce");
  assert.equal(placed.quantity, 100);
  assert.equal(placed.order_type, "LIMIT");
  assert.equal(placed.price, 468.6);
  assert.equal(placed.transaction_type, "BUY");
});

test("Upstox master file resolves crude, NIFTY options, and the NIFTY future when search is empty", async () => {
  resetUpstoxMasterCache();
  const ist = (ymd) => new Date(`${ymd}T23:59:59+05:30`).getTime();
  assert.equal(upstoxExpiryDay(ist("2026-10-15")), "2026-10-15");
  assert.deepEqual(parseDeskFutureSymbol("NIFTY-Sep2026-FUT"), { root: "NIFTY", expiry: "2026-09", future: true });
  const nse = [
    {
      trading_symbol: "CRUDEOIL 8700 CE 08 OCT 26",
      underlying_symbol: "CRUDEOIL",
      instrument_type: "CE",
      strike_price: 8700,
      expiry: ist("2026-10-08"),
      instrument_key: "NSE_COM|133060",
      lot_size: 1,
      segment: "NSE_COM",
    },
    {
      trading_symbol: "NIFTY 22900 CE 29 SEP 26",
      underlying_symbol: "NIFTY",
      instrument_type: "CE",
      strike_price: 22900,
      expiry: ist("2026-09-29"),
      instrument_key: "NSE_FO|73899",
      lot_size: 65,
    },
    {
      trading_symbol: "NIFTY 22650 CE 06 OCT 26",
      underlying_symbol: "NIFTY",
      instrument_type: "CE",
      strike_price: 22650,
      expiry: ist("2026-10-06"),
      instrument_key: "NSE_FO|40704",
      lot_size: 65,
    },
    {
      trading_symbol: "NIFTY 22650 CE 27 OCT 26",
      underlying_symbol: "NIFTY",
      instrument_type: "CE",
      strike_price: 22650,
      expiry: ist("2026-10-27"),
      instrument_key: "NSE_FO|51338",
      lot_size: 65,
    },
    {
      trading_symbol: "NIFTY FUT 29 SEP 26",
      underlying_symbol: "NIFTY",
      instrument_type: "FUT",
      expiry: ist("2026-09-29"),
      instrument_key: "NSE_FO|68407",
      lot_size: 65,
    },
  ];
  const mcx = [
    {
      trading_symbol: "CRUDEOILM 8700 CE 15 OCT 26",
      underlying_symbol: "CRUDEOILM",
      instrument_type: "CE",
      strike_price: 8700,
      expiry: ist("2026-10-15"),
      instrument_key: "MCX_FO|mini",
      lot_size: 10,
    },
    {
      trading_symbol: "CRUDEOIL 8700 CE 15 OCT 26",
      underlying_symbol: "CRUDEOIL",
      instrument_type: "CE",
      strike_price: 8700,
      expiry: ist("2026-10-15"),
      instrument_key: "MCX_FO|580473",
      lot_size: 100,
      tick_size: 10,
    },
    {
      trading_symbol: "CRUDEOIL 8850 PE 15 OCT 26",
      underlying_symbol: "CRUDEOIL",
      instrument_type: "PE",
      strike_price: 8850,
      expiry: ist("2026-10-15"),
      instrument_key: "MCX_FO|580627",
      lot_size: 100,
      tick_size: 10,
    },
  ];
  const placed = [];
  const fetchImpl = async (url, options) => {
    const href = String(url);
    if (href.includes("NSE.json")) return { ok: true, status: 200, text: async () => JSON.stringify(nse) };
    if (href.includes("MCX.json")) return { ok: true, status: 200, text: async () => JSON.stringify(mcx) };
    if (href.includes("search/instruments") || href.includes("option/contract")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
    }
    placed.push(JSON.parse(options.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { order_id: `upx-${placed.length}` } }) };
  };
  const orders = [
    { symbol: "CRUDEOIL 8700 CE", qty: 100, lots: 1, lotSize: 100, type: "LIMIT", price: 468.6, strike: 8700, option: "CE", expiry: "2026-10-15", exchangeSegment: "MCX_COMM" },
    { symbol: "CRUDEOIL-15Oct2026-8850-PE", qty: 1, lots: 1, lotSize: 100, type: "LIMIT", price: 10, exchangeSegment: "MCX_COMM" },
    { symbol: "NIFTY-Sep2026-22900-CE", qty: 65 },
    { symbol: "NIFTY-Oct2026-22650-CE", qty: 65 },
    { symbol: "NIFTY-Sep2026-FUT", qty: 65 },
  ];
  try {
    for (const order of orders) {
      await placeLiveBrokerOrder(
        "upstox",
        { copyUserId: "u-upstox", brokerSession: { accessToken: "upstox-member-token", clientId: "UPX1" }, side: "BUY", securityId: "55123", ...order },
        fetchImpl,
      );
    }
  } finally {
    resetUpstoxMasterCache();
  }
  assert.deepEqual(
    placed.map((row) => [row.instrument_token, row.quantity, row.order_type]),
    [
      ["MCX_FO|580473", 100, "LIMIT"],
      ["MCX_FO|580627", 100, "LIMIT"],
      ["NSE_FO|73899", 65, "MARKET"],
      ["NSE_FO|40704", 65, "MARKET"],
      ["NSE_FO|68407", 65, "MARKET"],
    ],
  );
  assert.equal(placed[0].price, 468.6);
});

test("Upstox switches a crude copy to NSE NSCOM when MCX orders are disabled and keeps NIFTY on NSE_FO", async () => {
  resetUpstoxMasterCache();
  resetUpstoxMcxApiDisable();
  const rows = [
    {
      trading_symbol: "CRUDEOIL 8700 CE 15 OCT 26",
      underlying_symbol: "CRUDEOIL",
      instrument_type: "CE",
      strike_price: 8700,
      expiry: "2026-10-15",
      instrument_key: "MCX_FO|580473",
      lot_size: 100,
      qty_multiplier: 100,
      tick_size: 10,
    },
    {
      trading_symbol: "CRUDEOIL 8700 CE 08 OCT 26",
      underlying_symbol: "CRUDEOIL",
      instrument_type: "CE",
      strike_price: 8700,
      expiry: "2026-10-08",
      instrument_key: "NSE_COM|133060",
      lot_size: 1,
      qty_multiplier: 100,
      tick_size: 10,
    },
    {
      trading_symbol: "NIFTY 22650 CE 06 OCT 26",
      underlying_symbol: "NIFTY",
      instrument_type: "CE",
      strike_price: 22650,
      expiry: "2026-10-06",
      instrument_key: "NSE_FO|51338",
      lot_size: 65,
    },
  ];
  const placed = [];
  const fetchImpl = async (url, options) => {
    const href = String(url);
    if (href.includes("NSE.json") || href.includes("MCX.json")) {
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    if (href.includes("search/instruments") || href.includes("option/contract")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: rows }) };
    }
    const body = JSON.parse(options.body);
    placed.push(body);
    if (String(body.instrument_token).startsWith("MCX_")) {
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            errors: [
              {
                errorCode: "UDAPI1161",
                message: "MCX API orders are temporarily disabled. Meanwhile, place commodity orders on NSE (NSCOM).",
              },
            ],
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { order_id: `upx-${placed.length}` } }) };
  };
  const crude = {
    copyUserId: "u-upstox",
    brokerSession: { accessToken: "upstox-member-token", clientId: "393216" },
    side: "BUY",
    securityId: "55123",
    symbol: "CRUDEOIL-15Oct2026-8700-CE",
    qty: 100,
    lots: 1,
    lotSize: 100,
    type: "LIMIT",
    price: 454.5,
    exchangeSegment: "MCX_COMM",
  };
  try {
    const first = await placeLiveBrokerOrder("upstox", crude, fetchImpl);
    const second = await placeLiveBrokerOrder("upstox", crude, fetchImpl);
    const nifty = await placeLiveBrokerOrder(
      "upstox",
      {
        ...crude,
        symbol: "NIFTY-Oct2026-22650-CE",
        qty: 65,
        lots: 0,
        lotSize: 65,
        type: "MARKET",
        price: 0,
        exchangeSegment: "NSE_FNO",
      },
      fetchImpl,
    );
    assert.equal(first.tradingSymbol, "CRUDEOIL 8700 CE 08 OCT 26");
    assert.match(first.reason, /NSE NSCOM/);
    assert.equal(second.tradingSymbol, "CRUDEOIL 8700 CE 08 OCT 26");
    assert.equal(nifty.tradingSymbol, "");
    assert.deepEqual(
      placed.map((row) => [row.instrument_token, row.quantity, row.order_type, row.product]),
      [
        ["MCX_FO|580473", 100, "LIMIT", "D"],
        ["NSE_COM|133060", 1, "LIMIT", "D"],
        ["NSE_COM|133060", 1, "LIMIT", "D"],
        ["NSE_FO|51338", 65, "MARKET", "I"],
      ],
    );
    assert.equal(placed[1].price, 454.5);
  } finally {
    resetUpstoxMasterCache();
    resetUpstoxMcxApiDisable();
  }
});

test("Upstox retries UDAPI100500 as delivery and keeps a normal NIFTY order intraday", async () => {
  const placed = [];
  const fetchImpl = async (url, options) => {
    if (!String(url).includes("order/place")) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
    const body = JSON.parse(options.body);
    placed.push(body);
    if (body.product === "I" && body.instrument_token === "NSE_FO|blocked") {
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            errors: [{ errorCode: "UDAPI100500", message: "Intraday (I) orders are not allowed on this scrip." }],
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { order_id: "upx-d" } }) };
  };
  const blocked = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox",
      brokerSession: { accessToken: "upstox-member-token", clientId: "393216" },
      symbol: "NIFTY 22650 CE",
      side: "BUY",
      qty: 65,
      instrumentKey: "NSE_FO|blocked",
    },
    fetchImpl,
  );
  const normal = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox",
      brokerSession: { accessToken: "upstox-member-token", clientId: "393216" },
      symbol: "NIFTY 22650 CE",
      side: "BUY",
      qty: 65,
      instrumentKey: "NSE_FO|51338",
    },
    fetchImpl,
  );
  assert.equal(blocked.orderId, "upx-d");
  assert.equal(normal.orderId, "upx-d");
  assert.deepEqual(
    placed.map((row) => [row.instrument_token, row.product, row.quantity]),
    [
      ["NSE_FO|blocked", "I", 65],
      ["NSE_FO|blocked", "D", 65],
      ["NSE_FO|51338", "I", 65],
    ],
  );
});

test("placeLiveBrokerOrder searches Upstox for NIFTY 22850 CE instead of using a Dhan security id", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes("search/instruments")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "NIFTY 23 SEP 25 22850 CE",
                underlying_symbol: "NIFTY",
                instrument_type: "CE",
                strike_price: 22850,
                expiry: "2026-09-23",
                instrument_key: "NSE_FO|98765",
              },
            ],
          }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "upx-1" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox",
      brokerSession: { accessToken: "upstox-member-token", clientId: "UPX1" },
      symbol: "NIFTY 22850 CE",
      side: "BUY",
      qty: 65,
      securityId: "55123",
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-1");
  assert.match(calls[0].url, /search\/instruments/);
  assert.match(calls[0].url, /NIFTY%2022850%20CE/);
  assert.match(calls[1].url, /api-hft\.upstox\.com\/v3\/order\/place/);
  const placed = JSON.parse(calls[1].body);
  assert.equal(placed.instrument_token, "NSE_FO|98765");
  assert.equal(placed.transaction_type, "BUY");
  assert.equal(placed.quantity, 65);
  assert.equal(placed.slice, false);
});

test("placeLiveBrokerOrder resolves Dhan NIFTY-Sep2026-22850-PE and places on the HFT host", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes("search/instruments")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "NIFTY 29 SEP 26 22850 PE",
                underlying_symbol: "NIFTY",
                instrument_type: "PE",
                strike_price: 22850,
                expiry: "2026-09-29",
                instrument_key: "NSE_FO|426269",
              },
            ],
          }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "upx-pe-1" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox-dhan-sym",
      brokerSession: { accessToken: "member-upstox-token", clientId: "393216" },
      symbol: "NIFTY-Sep2026-22850-PE",
      side: "BUY",
      qty: 65,
      securityId: "55123",
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-pe-1");
  assert.match(calls[0].url, /search\/instruments/);
  assert.match(calls[0].url, /NIFTY%2022850%20PE/);
  assert.match(calls[1].url, /api-hft\.upstox\.com\/v3\/order\/place/);
  assert.equal(String(calls[1].url).includes("api.upstox.com/v2/order/place"), false);
  const placed = JSON.parse(calls[1].body);
  assert.equal(placed.instrument_token, "NSE_FO|426269");
});

test("Upstox copy of NIFTY-Oct2026-23100-CE looks up the nearest weekly instrument key", async () => {
  const day = upstoxExpiryDate("2026-10", "NIFTY");
  assert.equal(day, "2026-10-06");
  assert.notEqual(day, "2026-10-27");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("search/instruments")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
    }
    if (String(url).includes("option/contract")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "NIFTY 06 OCT 26 23100 CE",
                underlying_symbol: "NIFTY",
                instrument_type: "CE",
                strike_price: 23100,
                expiry: "2026-10-06",
                instrument_key: "NSE_FO|23100ce",
              },
            ],
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { order_id: "upx-oct" } }) };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox-oct",
      brokerSession: { accessToken: "member-upstox-token", clientId: "393216" },
      symbol: "NIFTY-Oct2026-23100-CE",
      side: "BUY",
      qty: 65,
      securityId: "55123",
      strategy: "test",
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-oct");
  assert.ok(calls.some((url) => url.includes(`expiry_date=${day}`)));
  assert.ok(calls.some((url) => url.includes("api-hft.upstox.com/v3/order/place")));
});

test("nfoTradingSymbol maps desk option names to Kite-style NFO codes", () => {
  assert.equal(nfoTradingSymbol("NIFTY 24500 CE", "2026-09-15"), "NIFTY2691524500CE");
  assert.equal(fyersSymbol("NIFTY 24500 PE", "2026-09-15"), "NSE:NIFTY2691524500PE");
  assert.equal(fyersAuthHeader("Z2MCJB4OXH-200", "fyers-today-token"), "Z2MCJB4OXH-200:fyers-today-token");
  const market = fyersPlaceOrderBody({ side: "BUY", qty: 65, symbol: "NIFTY 22500 CE", expiry: "2026-10-06" });
  assert.equal(market.symbol, "NSE:NIFTY26O0622500CE");
  assert.equal(market.type, 2);
  assert.equal(market.side, 1);
  assert.equal(market.productType, "INTRADAY");
  assert.equal(market.offlineOrder, false);
  assert.equal(market.orderTag, "t2scopy");
  const limit = fyersPlaceOrderBody({ side: "SELL", qty: 65, orderType: "LIMIT", price: 12.1, symbol: "NIFTY 22500 CE", expiry: "2026-10-06" });
  assert.equal(limit.type, 1);
  assert.equal(limit.side, -1);
  assert.equal(limit.limitPrice, 12.1);
  assert.equal(nfoTradingSymbol("NIFTY 22500 PE", "2026-10-06"), "NIFTY26O0622500PE");
  assert.equal(nfoTradingSymbol("NIFTY 06 OCT 22500 PUT"), "NIFTY26O0622500PE");
  assert.equal(nfoTradingSymbol("NIFTY 22500 PE", "2026-10-27"), "NIFTY26OCT22500PE");
  assert.equal(nfoTradingSymbol("NIFTY-Oct2026-22500-PE"), "NIFTY26O0622500PE");
});

test("Fyers member copy places a v3 sync order with App ID:token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers, body: options.body });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ s: "ok", code: 1101, id: "fyers-ord-1", message: "Order submitted" }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "fyers",
    {
      copyUserId: "u-fyers-da02189",
      brokerSession: { accessToken: "fyers-today-token", apiKey: "Z2MCJB4OXH-200", clientId: "DA02189" },
      symbol: "NIFTY 22500 CE",
      expiry: "2026-10-06",
      side: "BUY",
      qty: 65,
      orderType: "LIMIT",
      price: 12.1,
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "fyers-ord-1");
  assert.equal(live.brokerId, "fyers");
  assert.equal(calls[0].url, "https://api-t1.fyers.in/api/v3/orders/sync");
  assert.equal(calls[0].headers.Authorization, "Z2MCJB4OXH-200:fyers-today-token");
  const placed = JSON.parse(calls[0].body);
  assert.equal(placed.symbol, "NSE:NIFTY26O0622500CE");
  assert.equal(placed.type, 1);
  assert.equal(placed.limitPrice, 12.1);
  assert.equal(placed.offlineOrder, false);
});

test("connectLiveBroker stores Zerodha after a profile probe and does not invent positions", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { user_id: "AB1234", user_name: "Avinash" } }),
    };
  };
  const row = await connectLiveBroker(
    "zerodha",
    { clientId: "AB1234", apiKey: "kitekey11", accessToken: "kite-access-token" },
    fetchImpl,
  );
  assert.equal(row.live, true);
  assert.equal(row.clientId, "AB1234");
  assert.equal(isLiveBrokerReady("zerodha"), true);
  assert.match(calls[0].url, /kite.trade\/user\/profile/);
  assert.equal(row.positions, undefined);
});

test("placeLiveBrokerOrder sends a Kite MARKET order", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: options.body });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "z-100" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "zerodha",
    { symbol: "NIFTY 24500 CE", expiry: "2026-09-15", side: "BUY", qty: 65, product: "MIS" },
    fetchImpl,
  );
  assert.equal(live.orderId, "z-100");
  assert.equal(live.brokerId, "zerodha");
  assert.match(String(calls[0].body), /NIFTY2691524500CE/);
  assert.match(String(calls[0].body), /transaction_type=BUY/);
});

test("connectLiveBroker rejects missing Angel jwt", async () => {
  await assert.rejects(
    () => connectLiveBroker("angelone", { clientId: "A123", apiKey: "key" }, async () => ({ ok: true, text: async () => "{}" })),
    /jwtToken/,
  );
});

test("member copy does not use the admin Zerodha session when the member token is missing", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: { order_id: "should-not-place" } }),
  });
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "zerodha",
        {
          copyUserId: "u-isolation",
          brokerSession: { accessToken: "" },
          symbol: "NIFTY 24500 CE",
          expiry: "2026-09-15",
          side: "BUY",
          qty: 65,
        },
        fetchImpl,
      ),
    /My plan/,
  );
});

test("member Upstox copy uses the member Bearer token, not the admin session", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    if (String(url).includes("search/instruments")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "NIFTY 23 SEP 25 22850 PE",
                underlying_symbol: "NIFTY",
                instrument_type: "PE",
                strike_price: 22850,
                expiry: "2026-09-23",
                instrument_key: "NSE_FO|426269",
              },
            ],
          }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "upx-member-1" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox-auth",
      account: { accessToken: "member-upstox-token", clientId: "UPX-MEM-1" },
      symbol: "NIFTY 22850 PE",
      side: "BUY",
      qty: 65,
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-member-1");
  assert.equal(calls.every((row) => row.auth === "Bearer member-upstox-token"), true);
  assert.equal(calls.some((row) => String(row.auth).includes("admin-upstox-token")), false);
});

test("member Upstox 401 names the member client ID and token hint", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("search/instruments")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                trading_symbol: "NIFTY 23 SEP 25 22850 PE",
                underlying_symbol: "NIFTY",
                instrument_type: "PE",
                strike_price: 22850,
                expiry: "2026-09-23",
                instrument_key: "NSE_FO|426269",
              },
            ],
          }),
      };
    }
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ message: "401 Unauthorized" }),
    };
  };
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "upstox",
        {
          copyUserId: "u-upstox-401",
          brokerSession: { accessToken: "member-upstox-token", clientId: "UPX-MEM-1" },
          symbol: "NIFTY 22850 PE",
          side: "BUY",
          qty: 65,
          instrumentKey: "NSE_FO|426269",
        },
        fetchImpl,
      ),
    (error) => {
      assert.match(error.message, /401 Unauthorized/);
      assert.match(error.message, /client ID UPX-MEM-1/);
      assert.match(error.message, /••••oken/);
      assert.match(error.message, /not the admin login/);
      assert.equal(error.message.includes("member-upstox-token"), false);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test("Upstox 401 reads errors[] and says analytics tokens cannot place", async () => {
  assert.match(
    upstoxErrorMessage(
      { errors: [{ errorCode: "UDAPI100067", message: "not permitted with an extended_token" }] },
      { status: 401 },
    ),
    /UDAPI100067.*extended_token/,
  );
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    statusText: "",
    text: async () =>
      JSON.stringify({
        status: "error",
        errors: [{ errorCode: "UDAPI100067", message: "not permitted with an extended_token" }],
      }),
  });
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "upstox",
        {
          copyUserId: "u-upstox-analytics",
          brokerSession: { accessToken: "member-upstox-token", clientId: "393216" },
          symbol: "NIFTY 22950 PE",
          side: "BUY",
          qty: 65,
          instrumentKey: "NSE_FO|426270",
        },
        fetchImpl,
      ),
    (error) => {
      assert.match(error.message, /UDAPI100067/);
      assert.match(error.message, /extended_token|Analytics/);
      assert.match(error.message, /access_token/);
      assert.equal(error.message.includes("401 broker error"), false);
      assert.equal(error.status, 401);
      return true;
    },
  );
});

test("Upstox place falls back to HFT v2 when v3 is gone", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("/v3/order/place")) {
      return { ok: false, status: 404, statusText: "Not Found", text: async () => JSON.stringify({ message: "UDAPI10000" }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { order_id: "upx-v2-fallback" } }) };
  };
  const live = await placeLiveBrokerOrder(
    "upstox",
    {
      copyUserId: "u-upstox-v2",
      brokerSession: { accessToken: "member-upstox-token", clientId: "393216" },
      symbol: "NIFTY 22950 PE",
      side: "BUY",
      qty: 65,
      instrumentKey: "NSE_FO|426270",
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "upx-v2-fallback");
  assert.match(calls[0], /v3\/order\/place/);
  assert.match(calls[1], /v2\/order\/place/);
});

test("member Zerodha copy uses the member token, not the admin session", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, auth: options.headers?.Authorization });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { order_id: "m-member-1" } }),
    };
  };
  const live = await placeLiveBrokerOrder(
    "zerodha",
    {
      copyUserId: "u-isolation",
      brokerSession: { accessToken: "member-kite-token", apiKey: "member-kite-key", clientId: "MEM1" },
      symbol: "NIFTY 24500 CE",
      expiry: "2026-09-15",
      side: "BUY",
      qty: 65,
    },
    fetchImpl,
  );
  assert.equal(live.orderId, "m-member-1");
  assert.match(String(calls[0].auth), /member-kite-key:member-kite-token/);
  assert.equal(String(calls[0].auth).includes("kite-access-token"), false);
});

test("disconnectLiveBroker clears the saved live session", () => {
  assert.equal(disconnectLiveBroker("zerodha"), true);
  assert.equal(isLiveBrokerReady("zerodha"), false);
});

test("a Nifty order at 15:45 IST is a Kotak after-market order", () => {
  assert.equal(kotakOrderAmo({ symbol: "NIFTY 22900 CE" }, new Date("2026-10-01T10:15:33.000Z")), "YES");
  assert.equal(kotakOrderAmo({ symbol: "NIFTY 22900 CE", orderAt: "2026-10-01T04:00:00.000Z" }), "NO");
});

test("Kotak Neo order is posted to the live place host, not the dead gw-napi host", async () => {
  const savedKey = process.env.T2S_KOTAK_CONSUMER_KEY;
  process.env.T2S_KOTAK_CONSUMER_KEY = "desk-should-not-send";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers || {}, body: options.body });
    if (String(url).includes("gw-napi")) {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-22900" }) };
  };
  try {
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        copyUserId: "u-kotak-order",
        brokerSession: { accessToken: "trade-token-1452", apiKey: "kotak-consumer-key", clientId: "YT2Vm", sessionToken: "neo-sid-88" },
        symbol: "NIFTY 22900 CE",
        expiry: "2026-10-06",
        side: "BUY",
        qty: 65,
        price: 15.4,
        type: "MARKET",
        product: "MIS",
        orderAt: "2026-10-01T10:15:33.000Z",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-22900");
    assert.equal(live.brokerId, "kotak");
    assert.equal(calls.some((row) => row.url.includes("gw-napi")), false);
    assert.match(calls[0].url, /^https:\/\/mis\.kotaksecurities\.com\/quick\/order\/rule\/ms\/place/);
    assert.equal(calls[0].headers.Auth, "trade-token-1452");
    assert.equal(calls[0].headers.Sid, "neo-sid-88");
    assert.equal(String(calls[0].headers.Sid).includes("YT2Vm"), false);
    assert.equal(String(calls[0].headers.Auth).includes("kotak-consumer-key"), false);
    assert.equal(calls[0].headers["neo-fin-key"], "neotradeapi");
    assert.equal(calls[0].headers.Authorization, undefined);
    assert.equal(String(calls[0].headers.Auth).startsWith("Bearer "), false);
    const jData = JSON.parse(new URLSearchParams(calls[0].body).get("jData"));
    assert.equal(jData.tt, "B");
    assert.equal(jData.qt, "65");
    assert.equal(jData.es, "nse_fo");
    assert.equal(jData.pt, "MKT");
    assert.equal(jData.pr, "0");
    assert.equal(jData.am, "YES");
    assert.equal(jData.os, "NEOTRADEAPI");
    assert.equal(jData.ts, "NIFTY26O0622900CE");
    assert.equal(String(calls[0].body).includes("desk-should-not-send"), false);
  } finally {
    if (savedKey == null) delete process.env.T2S_KOTAK_CONSUMER_KEY;
    else process.env.T2S_KOTAK_CONSUMER_KEY = savedKey;
  }
});

test("a member Kotak order without a Neo sid is refused before Kotak is called", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const order = {
    symbol: "NIFTY 22900 CE",
    expiry: "2026-10-06",
    side: "BUY",
    qty: 65,
    price: 15.4,
    orderAt: "2026-10-01T12:55:22.000Z",
  };
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "kotak",
        {
          copyUserId: "u-avinash",
          brokerSession: { accessToken: "member-token-1452", apiKey: "member-consumer", clientId: "YT2Vm" },
          ...order,
        },
        fetchImpl,
      ),
    /trade session|Neo sid/,
  );
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "kotak",
        {
          copyUserId: "u-avinash",
          brokerSession: { accessToken: "member-consumer", apiKey: "member-consumer", clientId: "YT2Vm", sessionToken: "YT2Vm" },
          ...order,
        },
        fetchImpl,
      ),
    /trade session|Neo sid/,
  );
  assert.equal(called, false);
});

test("a member crude order opens that user's Kotak trade login and does not use the admin login", async () => {
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_MOBILE = "9000000099";
  process.env.T2S_KOTAK_MPIN = "111111";
  process.env.T2S_KOTAK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  process.env.T2S_KOTAK_CLIENT_ID = "YIX14";
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-consumer";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-access-9f44";
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      auth: options.headers?.Authorization,
      sid: options.headers?.sid || options.headers?.Sid,
      sessionAuth: options.headers?.Auth,
      body: options.body,
    });
    const target = String(url);
    if (target.includes("tradeApiLogin")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { token: "view-token", sid: "view-sid" } }) };
    }
    if (target.includes("tradeApiValidate")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { token: "edit-token", sid: "edit-sid", baseUrl: "https://e22.kotaksecurities.com", hsServerId: "server-9" },
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-crude" }) };
  };
  try {
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        copyUserId: "u-avinash",
        brokerSession: {
          accessToken: "member-access-1452",
          apiKey: "member-consumer",
          clientId: "YT2Vm",
          mobile: "9876501234",
          mpin: "654321",
          totpSecret: "GEZDGNBVGY3TQOJQ",
        },
        symbol: "CRUDEOIL 8800 PE",
        side: "BUY",
        qty: 100,
        price: 383.3,
        type: "MARKET",
        orderAt: "2026-10-01T14:00:15.000Z",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-crude");
    assert.equal(live.status, "PENDING");
    const login = calls.find((row) => row.url.includes("tradeApiLogin"));
    assert.equal(login.auth, "member-access-1452");
    assert.equal(String(login.body).includes("+919876501234"), true);
    assert.equal(String(login.body).includes("YT2Vm"), true);
    assert.equal(String(login.body).includes("9000000099"), false);
    assert.equal(String(login.body).includes("GEZDGNBVGY3TQOJQ"), false);
    assert.equal(String(login.body).includes("JBSWY3DPEHPK3PXP"), false);
    assert.equal(String(login.auth).includes("admin-consumer"), false);
    assert.equal(String(login.auth).includes("member-consumer"), false);
    const place = calls.find((row) => row.url.includes("/quick/order/rule/ms/place"));
    assert.match(place.url, /^https:\/\/e22\.kotaksecurities\.com\/quick\/order\/rule\/ms\/place\?sId=server-9$/);
    assert.equal(place.sessionAuth, "edit-token");
    assert.equal(place.sid, "edit-sid");
    assert.equal(String(place.sid).includes("YT2Vm"), false);
    assert.equal(String(place.sessionAuth).includes("member-access-1452"), false);
    assert.equal(String(place.sessionAuth).includes("member-consumer"), false);
    const jData = JSON.parse(new URLSearchParams(place.body).get("jData"));
    assert.equal(jData.es, "mcx_fo");
    assert.equal(jData.am, "NO");
    assert.equal(jData.tt, "B");
    assert.equal(jData.qt, "100");
    assert.equal(String(JSON.stringify(live)).includes("654321"), false);
    assert.equal(String(JSON.stringify(live)).includes("GEZDGNBVGY3TQOJQ"), false);
  } finally {
    for (const [name, value] of [
      ["T2S_KOTAK_MOBILE", saved.mobile],
      ["T2S_KOTAK_MPIN", saved.mpin],
      ["T2S_KOTAK_TOTP_SECRET", saved.totp],
      ["T2S_KOTAK_CLIENT_ID", saved.id],
      ["T2S_KOTAK_CONSUMER_KEY", saved.key],
      ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
    ]) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("a member Kotak refusal stays on that user's own key and does not send the admin broker", async () => {
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
    id: process.env.T2S_KOTAK_CLIENT_ID,
    key: process.env.T2S_KOTAK_CONSUMER_KEY,
    token: process.env.T2S_KOTAK_ACCESS_TOKEN,
  };
  process.env.T2S_KOTAK_MOBILE = "9000000099";
  process.env.T2S_KOTAK_MPIN = "111111";
  process.env.T2S_KOTAK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  process.env.T2S_KOTAK_CLIENT_ID = "YIX14";
  process.env.T2S_KOTAK_CONSUMER_KEY = "admin-consumer-key";
  process.env.T2S_KOTAK_ACCESS_TOKEN = "admin-access-token";
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), auth: options.headers?.Authorization, body: options.body });
    if (String(url).includes("tradeApiLogin")) {
      return {
        ok: false,
        status: 424,
        text: async () => JSON.stringify({ error: [{ code: "424", message: "Consumer key user-own-key-1452 does not exist" }] }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "should-not-place" }) };
  };
  try {
    await assert.rejects(
      () =>
        placeLiveBrokerOrder(
          "kotak",
          {
            copyUserId: "u-avinash",
            brokerSession: {
              accessToken: "user-own-key-1452",
              apiKey: "user-own-key-1452",
              clientId: "YT2Vm",
              mobile: "9922980000",
              mpin: "654321",
              totpSecret: "GEZDGNBVGY3TQOJQ",
            },
            symbol: "CRUDEOIL 8800 PE",
            side: "BUY",
            qty: 100,
            type: "MARKET",
          },
          fetchImpl,
        ),
      (error) => {
        assert.match(error.message, /YT2Vm/);
        assert.match(error.message, /admin broker was not used/);
        assert.equal(error.message.includes("user-own-key-1452"), false);
        assert.equal(error.message.includes("admin-consumer-key"), false);
        assert.equal(error.message.includes("YIX14"), false);
        assert.equal(error.live?.status, "REJECTED");
        return true;
      },
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /tradeApiLogin/);
    assert.equal(calls[0].auth, "user-own-key-1452");
    assert.equal(String(calls[0].body).includes("+919922980000"), true);
    assert.equal(String(calls[0].body).includes("YT2Vm"), true);
    assert.equal(String(calls[0].body).includes("9000000099"), false);
    assert.equal(String(calls[0].body).includes("YIX14"), false);
  } finally {
    for (const [name, value] of [
      ["T2S_KOTAK_MOBILE", saved.mobile],
      ["T2S_KOTAK_MPIN", saved.mpin],
      ["T2S_KOTAK_TOTP_SECRET", saved.totp],
      ["T2S_KOTAK_CLIENT_ID", saved.id],
      ["T2S_KOTAK_CONSUMER_KEY", saved.key],
      ["T2S_KOTAK_ACCESS_TOKEN", saved.token],
    ]) {
      if (value == null) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Kotak order network failure names the host instead of a bare fetch failed", async () => {
  const fetchImpl = async (url) => {
    throw Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ENOTFOUND", message: `getaddrinfo ENOTFOUND ${new URL(String(url)).host}` },
    });
  };
  await assert.rejects(
    () =>
      placeLiveBrokerOrder(
        "kotak",
        {
          copyUserId: "u-kotak-net",
          brokerSession: { accessToken: "trade-token-1452", apiKey: "kotak-consumer-key", clientId: "YT2Vm", sessionToken: "neo-sid-88" },
          symbol: "NIFTY 22900 CE",
          expiry: "2026-10-06",
          side: "BUY",
          qty: 65,
          orderAt: "2026-10-01T10:15:33.000Z",
        },
        fetchImpl,
      ),
    (error) => {
      assert.match(error.message, /ENOTFOUND/);
      assert.match(error.message, /kotaksecurities\.com/);
      assert.notEqual(error.message, "fetch failed");
      assert.equal(error.live?.status, "REJECTED");
      assert.match(error.live?.reason || "", /ENOTFOUND/);
      return true;
    },
  );
});

test("a Kotak limit keeps its own price when the Dhan quote is higher", async () => {
  setLivePriceReader(() => 999);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: options.body });
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-own-price" }) };
  };
  try {
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        copyUserId: "u-kotak-price",
        brokerSession: {
          accessToken: "trade-token-1452",
          apiKey: "kotak-consumer-key",
          clientId: "YT2Vm",
          sessionToken: "neo-sid-88",
        },
        symbol: "NIFTY 22900 CE",
        expiry: "2026-10-06",
        side: "BUY",
        qty: 65,
        type: "LIMIT",
        price: 15.4,
        orderAt: "2026-10-01T04:00:00.000Z",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-own-price");
    const place = calls.find((row) => String(row.url).includes("/quick/order/rule/ms/place"));
    const jData = JSON.parse(new URLSearchParams(place.body).get("jData"));
    assert.equal(jData.pr, "15.4");
    assert.equal(jData.pt, "L");
    assert.equal(calls.some((row) => String(row.url).includes("dhan.co")), false);
  } finally {
    setLivePriceReader(() => 0);
  }
});

test("kotakMobileNumber keeps the Users-list 10-digit number as +91 for Neo login", () => {
  assert.equal(kotakMobileNumber("9922980000"), "+919922980000");
  assert.equal(kotakMobileNumber("+91 99229 80000"), "+919922980000");
  assert.equal(kotakMobileNumber("+91-9922980000"), "+919922980000");
  assert.equal(kotakMobileNumber("919922980000"), "+919922980000");
  assert.deepEqual(kotakMobileNumberCandidates("9922980000"), [
    "+919922980000",
    "+91-9922980000",
    "9922980000",
    "919922980000",
  ]);
  assert.equal(firstKotakMobile("", "not-a-phone", "9922980000"), "9922980000");
  assert.equal(firstKotakMobile("+919922980000", "9000000000"), "+919922980000");
});

test("Kotak trade login retries MobileNumber formats after Neo rejects +91", async () => {
  clearKotakTradeCache();
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
  };
  delete process.env.T2S_KOTAK_MOBILE;
  delete process.env.T2S_KOTAK_MPIN;
  delete process.env.T2S_KOTAK_TOTP_SECRET;
  const mobiles = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("tradeApiLogin")) {
      const sent = JSON.parse(options.body);
      mobiles.push(sent.mobileNumber);
      if (sent.mobileNumber === "+919922980000") {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: [{ message: "Invalid field 'MobileNumber'; must be a valid mobile number" }] }),
        };
      }
      if (sent.mobileNumber === "9922980000" || sent.mobileNumber === "+91-9922980000") {
        return { ok: true, status: 200, text: async () => JSON.stringify({ data: { token: "view-token", sid: "view-sid" } }) };
      }
      return { ok: false, status: 400, text: async () => JSON.stringify({ message: "unexpected mobile" }) };
    }
    if (target.includes("tradeApiValidate")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { token: "edit-token", sid: "edit-sid", baseUrl: "https://e22.kotaksecurities.com", hsServerId: "server-2" },
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-mobile" }) };
  };
  try {
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        copyUserId: "u-9922980000",
        brokerSession: {
          accessToken: "member-access-9922",
          apiKey: "member-consumer-9922",
          clientId: "YT2Vm",
          mobile: "9922980000",
          mpin: "654321",
          totpSecret: "123456",
        },
        symbol: "NIFTY 22500 PE",
        side: "BUY",
        qty: 65,
        price: 115.2,
        type: "LIMIT",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-mobile");
    assert.deepEqual(mobiles[0], "+919922980000");
    assert.ok(mobiles.includes("+91-9922980000") || mobiles.includes("9922980000"));
    assert.equal(mobiles.includes(""), false);
  } finally {
    clearKotakTradeCache();
    if (saved.mobile == null) delete process.env.T2S_KOTAK_MOBILE;
    else process.env.T2S_KOTAK_MOBILE = saved.mobile;
    if (saved.mpin == null) delete process.env.T2S_KOTAK_MPIN;
    else process.env.T2S_KOTAK_MPIN = saved.mpin;
    if (saved.totp == null) delete process.env.T2S_KOTAK_TOTP_SECRET;
    else process.env.T2S_KOTAK_TOTP_SECRET = saved.totp;
  }
});

test("kotakTotpCandidates sends a 6-digit code and generates from a secret", () => {
  assert.deepEqual(kotakTotpCandidates("123456"), ["123456"]);
  const codes = kotakTotpCandidates("JBSWY3DPEHPK3PXP", Date.parse("2026-10-03T08:00:00.000Z"));
  assert.equal(codes.length, 3);
  assert.equal(codes.every((code) => /^\d{6}$/.test(code)), true);
  assert.equal(codes.includes("JBSWY3DPEHPK3PXP"), false);
});

test("Kotak admin order calls tradeApiLogin even when a Neo sid and base URL are saved", async () => {
  clearKotakTradeCache();
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
    base: process.env.T2S_KOTAK_BASE_URL,
  };
  delete process.env.T2S_KOTAK_MOBILE;
  delete process.env.T2S_KOTAK_MPIN;
  delete process.env.T2S_KOTAK_TOTP_SECRET;
  process.env.T2S_KOTAK_BASE_URL = "https://e41.kotaksecurities.com";
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      auth: options.headers?.Authorization,
      fin: options.headers?.["neo-fin-key"],
      type: options.headers?.["Content-Type"],
      sid: options.headers?.sid || options.headers?.Sid,
      sessionAuth: options.headers?.Auth,
      body: options.body,
    });
    const target = String(url);
    if (target.includes("/quotes/")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ exchange_token: "Nifty 50", ltp: 1 }]) };
    }
    if (target.includes("tradeApiLogin")) {
      const sent = JSON.parse(options.body);
      if (sent.totp !== "654321") {
        return { ok: false, status: 400, text: async () => JSON.stringify({ message: "Invalid TOTP" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { token: "view-token", sid: "view-sid" } }) };
    }
    if (target.includes("tradeApiValidate")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { token: "edit-token", sid: "edit-sid", baseUrl: "https://e22.kotaksecurities.com", hsServerId: "server-2" },
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-admin" }) };
  };
  try {
    await connectLiveBroker(
      "kotak",
      {
        clientId: "YIX14",
        apiKey: "kotak-consumer-key",
        accessToken: "neo-access-token",
        sessionToken: "old-sid",
        mobile: "9876543210",
        mpin: "112233",
        totpSecret: "654321",
      },
      fetchImpl,
    );
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        symbol: "NIFTY 22900 CE",
        expiry: "2026-10-06",
        side: "BUY",
        qty: 65,
        type: "MARKET",
        orderAt: "2026-10-01T04:00:00.000Z",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-admin");
    const login = calls.find((row) => row.url.includes("tradeApiLogin"));
    assert.equal(login.auth, "neo-access-token");
    assert.equal(login.fin, "neotradeapi");
    assert.match(login.type, /application\/json/);
    assert.deepEqual(JSON.parse(login.body), {
      mobileNumber: "+919876543210",
      ucc: "YIX14",
      totp: "654321",
    });
    const validate = calls.find((row) => row.url.includes("tradeApiValidate"));
    assert.equal(JSON.parse(validate.body).mpin, "112233");
    const place = calls.find((row) => row.url.includes("/quick/order/rule/ms/place"));
    assert.match(place.url, /^https:\/\/e22\.kotaksecurities\.com\/quick\/order\/rule\/ms\/place\?sId=server-2$/);
    assert.equal(place.sessionAuth, "edit-token");
    assert.equal(place.sid, "edit-sid");
    assert.equal(place.url.includes("e41.kotaksecurities.com"), false);
    assert.equal(String(place.sessionAuth).includes("old-sid"), false);
  } finally {
    clearKotakTradeCache();
    disconnectLiveBroker("kotak");
    if (saved.mobile == null) delete process.env.T2S_KOTAK_MOBILE;
    else process.env.T2S_KOTAK_MOBILE = saved.mobile;
    if (saved.mpin == null) delete process.env.T2S_KOTAK_MPIN;
    else process.env.T2S_KOTAK_MPIN = saved.mpin;
    if (saved.totp == null) delete process.env.T2S_KOTAK_TOTP_SECRET;
    else process.env.T2S_KOTAK_TOTP_SECRET = saved.totp;
    if (saved.base == null) delete process.env.T2S_KOTAK_BASE_URL;
    else process.env.T2S_KOTAK_BASE_URL = saved.base;
  }
});

test("Kotak admin order does not place when trade login is missing", async () => {
  clearKotakTradeCache();
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
  };
  delete process.env.T2S_KOTAK_MOBILE;
  delete process.env.T2S_KOTAK_MPIN;
  delete process.env.T2S_KOTAK_TOTP_SECRET;
  let placed = false;
  const fetchImpl = async (url) => {
    if (String(url).includes("/quick/order/")) placed = true;
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "should-not" }) };
  };
  try {
    await connectLiveBroker(
      "kotak",
      { clientId: "YIX14", apiKey: "kotak-consumer-key", accessToken: "neo-access-token" },
      async (url) => {
        if (String(url).includes("/quotes/")) {
          return { ok: true, status: 200, text: async () => JSON.stringify([{ ltp: 1 }]) };
        }
        return fetchImpl(url);
      },
    );
    await assert.rejects(
      () =>
        placeLiveBrokerOrder(
          "kotak",
          { symbol: "NIFTY 22900 CE", expiry: "2026-10-06", side: "BUY", qty: 65, type: "MARKET" },
          fetchImpl,
        ),
      /tradeApiLogin/,
    );
    assert.equal(placed, false);
  } finally {
    disconnectLiveBroker("kotak");
    if (saved.mobile == null) delete process.env.T2S_KOTAK_MOBILE;
    else process.env.T2S_KOTAK_MOBILE = saved.mobile;
    if (saved.mpin == null) delete process.env.T2S_KOTAK_MPIN;
    else process.env.T2S_KOTAK_MPIN = saved.mpin;
    if (saved.totp == null) delete process.env.T2S_KOTAK_TOTP_SECRET;
    else process.env.T2S_KOTAK_TOTP_SECRET = saved.totp;
  }
});

test("Kotak admin order logs in and places on the session base URL", async () => {
  clearKotakTradeCache();
  const saved = {
    mobile: process.env.T2S_KOTAK_MOBILE,
    mpin: process.env.T2S_KOTAK_MPIN,
    totp: process.env.T2S_KOTAK_TOTP_SECRET,
  };
  process.env.T2S_KOTAK_MOBILE = "9000000000";
  process.env.T2S_KOTAK_MPIN = "123456";
  process.env.T2S_KOTAK_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      auth: options.headers?.Authorization,
      sid: options.headers?.sid || options.headers?.Sid,
      sessionAuth: options.headers?.Auth,
      body: options.body,
    });
    const target = String(url);
    if (target.includes("/quotes/")) {
      return { ok: true, status: 200, text: async () => JSON.stringify([{ exchange_token: "Nifty 50", ltp: 22421.95 }]) };
    }
    if (target.includes("tradeApiLogin")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { token: "view-token", sid: "view-sid" } }) };
    }
    if (target.includes("tradeApiValidate")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: { token: "edit-token", sid: "edit-sid", baseUrl: "https://e22.kotaksecurities.com", hsServerId: "server-1" },
          }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ nOrdNo: "k-session" }) };
  };
  try {
    await connectLiveBroker(
      "kotak",
      { clientId: "YIX14", apiKey: "kotak-consumer-key", accessToken: "kotak-consumer-key" },
      fetchImpl,
    );
    const live = await placeLiveBrokerOrder(
      "kotak",
      {
        symbol: "NIFTY 22900 CE",
        expiry: "2026-10-06",
        side: "BUY",
        qty: 65,
        type: "MARKET",
        orderAt: "2026-10-01T04:00:00.000Z",
      },
      fetchImpl,
    );
    assert.equal(live.orderId, "k-session");
    assert.equal(calls.some((row) => row.url.includes("gw-napi")), false);
    const place = calls.find((row) => row.url.includes("/quick/order/rule/ms/place"));
    assert.match(place.url, /^https:\/\/e22\.kotaksecurities\.com\/quick\/order\/rule\/ms\/place\?sId=server-1$/);
    assert.equal(place.sessionAuth, "edit-token");
    assert.equal(place.sid, "edit-sid");
    assert.equal(place.auth, undefined);
    const jData = JSON.parse(new URLSearchParams(place.body).get("jData"));
    assert.equal(jData.am, "NO");
    assert.equal(jData.tt, "B");
    const login = calls.find((row) => row.url.includes("tradeApiLogin"));
    assert.equal(login.auth, "kotak-consumer-key");
    assert.equal(String(login.body).includes("+919000000000"), true);
    assert.equal(String(JSON.stringify(live)).includes("123456"), false);
    assert.equal(String(JSON.stringify(live)).includes("JBSWY3DPEHPK3PXP"), false);
  } finally {
    disconnectLiveBroker("kotak");
    if (saved.mobile == null) delete process.env.T2S_KOTAK_MOBILE;
    else process.env.T2S_KOTAK_MOBILE = saved.mobile;
    if (saved.mpin == null) delete process.env.T2S_KOTAK_MPIN;
    else process.env.T2S_KOTAK_MPIN = saved.mpin;
    if (saved.totp == null) delete process.env.T2S_KOTAK_TOTP_SECRET;
    else process.env.T2S_KOTAK_TOTP_SECRET = saved.totp;
  }
});
