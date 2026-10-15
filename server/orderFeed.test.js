import assert from "node:assert/strict";
import test from "node:test";
import { clearAdminDailyTradeLog, placeOrder, replaceDhanOrders, setDhanFeed, snapshot } from "./market.js";
import { lastBookClearAt } from "./dhanToken.js";

test("today's filled, rejected, and failed orders stay on the book when a Dhan poll omits them", () => {
  const stamp = new Date().toISOString();
  const yesterday = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  replaceDhanOrders([
    {
      id: "pe-22500-fill",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 92.7,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: stamp,
    },
    {
      id: "pe-22500-rej",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 92.7,
      status: "REJECT",
      brokerId: "dhan",
      live: true,
      reason: "RMS rejected",
      createdAt: stamp,
    },
    {
      id: "pe-22500-fail",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 92.7,
      status: "FAILURE",
      brokerId: "dhan",
      live: true,
      reason: "Order failed",
      createdAt: stamp,
    },
    {
      id: "pe-22600-pend",
      symbol: "NIFTY 22600 CE",
      side: "BUY",
      qty: 65,
      price: 10,
      status: "PENDING",
      brokerId: "dhan",
      live: true,
      createdAt: stamp,
    },
    {
      id: "copy:u-feed:1",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 92.7,
      status: "REJECTED",
      brokerId: "dhan",
      live: true,
      copyUserId: "u-feed",
      createdAt: stamp,
    },
    {
      id: "pe-old-fill",
      symbol: "NIFTY 22000 PE",
      side: "BUY",
      qty: 65,
      price: 40,
      status: "FILLED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: yesterday,
    },
  ]);

  replaceDhanOrders([
    {
      id: "other-pending",
      symbol: "NIFTY 22700 CE",
      side: "BUY",
      qty: 65,
      price: 12,
      status: "PENDING",
      brokerId: "dhan",
      live: true,
      createdAt: stamp,
    },
  ]);

  const orders = snapshot().orders;
  const fill = orders.find((row) => row.id === "pe-22500-fill");
  const rejected = orders.find((row) => row.id === "pe-22500-rej");
  const failed = orders.find((row) => row.id === "pe-22500-fail");
  assert.equal(fill?.status, "FILLED");
  assert.equal(fill?.symbol, "NIFTY 22500 PE");
  assert.equal(fill?.side, "BUY");
  assert.equal(fill?.qty, 65);
  assert.equal(fill?.price, 92.7);
  assert.equal(rejected?.status, "REJECTED");
  assert.match(rejected?.reason || "", /RMS rejected/);
  assert.equal(failed?.status, "FAILED");
  assert.match(failed?.reason || "", /Order failed/);
  assert.equal(orders.some((row) => row.id === "pe-22600-pend"), false);
  assert.equal(orders.some((row) => row.id === "pe-old-fill"), false);
  assert.equal(orders.some((row) => row.copyUserId === "u-feed" && row.status === "REJECTED"), true);
  assert.equal(orders.some((row) => row.id === "other-pending" && row.status === "PENDING"), true);

  replaceDhanOrders([
    {
      id: "pe-22500-fill",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 0,
      status: "REJECTED",
      brokerId: "dhan",
      live: true,
      filledQty: 0,
      reason: "Rejected by broker",
      createdAt: stamp,
    },
  ]);
  const updated = snapshot().orders.find((row) => row.id === "pe-22500-fill");
  assert.equal(updated?.status, "REJECTED");
  assert.equal(updated?.price, 92.7);
  assert.match(updated?.reason || "", /Rejected by broker/);
  assert.equal(snapshot().orders.some((row) => row.id === "pe-22500-fail" && row.status === "FAILED"), true);
});

test("a resent SELL keeps the strategy of the BUY on that contract", () => {
  const stamp = new Date().toISOString();
  replaceDhanOrders([
    {
      id: "sell-22400",
      symbol: "NIFTY-Oct2026-22400-PE",
      side: "SELL",
      qty: 65,
      price: 154.95,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: stamp,
    },
  ]);
  assert.equal(snapshot().orders.find((row) => row.id === "sell-22400")?.strategy || "", "");

  replaceDhanOrders([
    {
      id: "buy-22400",
      symbol: "NIFTY-Oct2026-22400-PE",
      side: "BUY",
      qty: 65,
      price: 109.8,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      strategy: "NIFTY 5m first candle",
      createdAt: stamp,
    },
  ]);
  const kept = snapshot().orders.find((row) => row.id === "sell-22400");
  assert.equal(kept?.status, "FILLED");
  assert.match(kept?.strategy || "", /NIFTY/i);

  replaceDhanOrders([
    {
      id: "sell-22400-again",
      symbol: "NIFTY 22400 PE",
      side: "SELL",
      qty: 65,
      price: 150,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      correlationId: "t2s1770000099",
      createdAt: stamp,
    },
  ]);
  assert.match(snapshot().orders.find((row) => row.id === "sell-22400-again")?.strategy || "", /NIFTY/i);
});

test("a live Nifty fill stays on the order book even without a matching strategy name", () => {
  const stamp = new Date().toISOString();
  replaceDhanOrders([
    {
      id: "nifty-live-fill",
      symbol: "NIFTY 22500 PE",
      side: "BUY",
      qty: 65,
      price: 111.45,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      strategy: "NIFTY mystery",
      createdAt: stamp,
    },
  ]);
  const row = snapshot().orders.find((item) => item.id === "nifty-live-fill");
  assert.equal(row?.status, "FILLED");
  assert.equal(row?.symbol, "NIFTY 22500 PE");
  assert.equal(row?.qty, 65);
});

test("admin trade log drops fills from before 8:00 AM IST and clears again the next day", () => {
  const reset = lastBookClearAt();
  const stale = new Date(reset - 2 * 60 * 60 * 1000).toISOString();
  const fresh = new Date(reset + 60 * 60 * 1000).toISOString();
  replaceDhanOrders([
    {
      id: "admin-stale-fill",
      symbol: "NIFTY 22100 PE",
      side: "BUY",
      qty: 65,
      price: 40,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: stale,
    },
    {
      id: "admin-fresh-fill",
      symbol: "NIFTY 22200 CE",
      side: "BUY",
      qty: 65,
      price: 55,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: fresh,
    },
  ]);
  assert.equal(snapshot().orders.some((row) => row.id === "admin-stale-fill"), false);
  assert.equal(snapshot().orders.some((row) => row.id === "admin-fresh-fill" && row.status === "FILLED"), true);

  replaceDhanOrders([
    {
      id: "admin-stale-fill",
      symbol: "NIFTY 22100 PE",
      side: "BUY",
      qty: 65,
      price: 40,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      filledQty: 65,
      createdAt: stale,
    },
  ]);
  assert.equal(snapshot().orders.some((row) => row.id === "admin-stale-fill"), false);
  assert.equal(snapshot().orders.some((row) => row.id === "admin-fresh-fill"), true);

  assert.equal(clearAdminDailyTradeLog(reset + 24 * 60 * 60 * 1000 + 1_000), true);
  assert.equal(snapshot().orders.some((row) => row.id === "admin-fresh-fill"), false);
});

test("Dhan TRADE CONFIRMED keeps strategy why as ENTRY or SL HIT", () => {
  const stamp = new Date().toISOString();
  replaceDhanOrders([
    {
      id: "crude-ce-buy",
      symbol: "CRUDEOIL-15Oct2026-9250-CE",
      side: "BUY",
      qty: 1,
      price: 50.7,
      status: "FILLED",
      brokerId: "dhan",
      live: true,
      strategy: "CRUDE OIL",
      role: "entry",
      reason: "ENTRY",
      filledQty: 1,
      createdAt: stamp,
    },
  ]);
  replaceDhanOrders([
    {
      id: "crude-ce-buy",
      symbol: "CRUDEOIL-15Oct2026-9250-CE",
      side: "BUY",
      qty: 1,
      price: 50.7,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      reason: "TRADE CONFIRMED",
      filledQty: 1,
      createdAt: stamp,
    },
    {
      id: "crude-ce-sell",
      symbol: "CRUDEOIL-15Oct2026-9250-CE",
      side: "SELL",
      qty: 1,
      price: 44.1,
      status: "TRADED",
      brokerId: "dhan",
      live: true,
      strategy: "CRUDE OIL",
      role: "sl",
      reason: "TRADE CONFIRMED",
      filledQty: 1,
      createdAt: stamp,
    },
  ]);
  const orders = snapshot().orders;
  const buy = orders.find((row) => row.id === "crude-ce-buy");
  const sell = orders.find((row) => row.id === "crude-ce-sell");
  assert.equal(buy?.strategy, "CRUDE OIL");
  assert.equal(buy?.reason, "ENTRY");
  assert.equal(sell?.strategy, "CRUDE OIL");
  assert.equal(sell?.reason, "SL HIT");
});

test("a Shivam BUY with TRADE CONFIRMED is stored as ENTRY, not demo Dhan text", () => {
  setDhanFeed({ live: true });
  const buy = placeOrder({
    symbol: "CRUDEOIL-15Oct2026-9250-CE",
    side: "BUY",
    qty: 1,
    price: 50.7,
    type: "MARKET",
    product: "MIS",
    strategy: "Shivam T2S Strategy",
    role: "entry",
    reason: "TRADE CONFIRMED",
    brokerId: "dhan",
    live: { orderId: "crude-why-buy", status: "TRADED", price: 50.7, filledQty: 1 },
  });
  assert.equal(buy.error, undefined);
  assert.equal(buy.strategy, "Shivam T2S Strategy");
  assert.equal(buy.reason, "ENTRY");
  const sell = placeOrder({
    symbol: "CRUDEOIL-15Oct2026-9250-CE",
    side: "SELL",
    qty: 1,
    price: 44.1,
    type: "MARKET",
    product: "MIS",
    strategy: "Shivam T2S Strategy",
    role: "sl",
    exitReason: "sl",
    reason: "TRADE CONFIRMED",
    brokerId: "dhan",
    live: { orderId: "crude-why-sell", status: "TRADED", price: 44.1, filledQty: 1 },
  });
  assert.equal(sell.reason, "SL HIT");
});
