import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-live-brokers-"));
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const {
  connectLiveBroker,
  disconnectLiveBroker,
  fyersSymbol,
  isLiveBrokerReady,
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
  assert.equal(nfoTradingSymbol("NIFTY 22500 PE", "2026-10-06"), "NIFTY26O0622500PE");
  assert.equal(nfoTradingSymbol("NIFTY 06 OCT 22500 PUT"), "NIFTY26O0622500PE");
  assert.equal(nfoTradingSymbol("NIFTY 22500 PE", "2026-10-27"), "NIFTY26OCT22500PE");
  assert.equal(nfoTradingSymbol("NIFTY-Oct2026-22500-PE"), "NIFTY26O0622500PE");
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
