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
  parseDeskOptionSymbol,
  pickUpstoxOptionHit,
  placeLiveBrokerOrder,
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
  assert.match(calls[1].url, /api-hft\.upstox\.com\/v2\/order\/place/);
  const placed = JSON.parse(calls[1].body);
  assert.equal(placed.instrument_token, "NSE_FO|98765");
  assert.equal(placed.transaction_type, "BUY");
  assert.equal(placed.quantity, 65);
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
  assert.match(calls[1].url, /api-hft\.upstox\.com\/v2\/order\/place/);
  assert.equal(String(calls[1].url).includes("api.upstox.com/v2/order/place"), false);
  const placed = JSON.parse(calls[1].body);
  assert.equal(placed.instrument_token, "NSE_FO|426269");
});

test("nfoTradingSymbol maps desk option names to Kite-style NFO codes", () => {
  assert.equal(nfoTradingSymbol("NIFTY 24500 CE", "2026-09-15"), "NIFTY26SEP24500CE");
  assert.equal(fyersSymbol("NIFTY 24500 PE", "2026-09-15"), "NSE:NIFTY26SEP24500PE");
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
  assert.match(String(calls[0].body), /NIFTY26SEP24500CE/);
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
