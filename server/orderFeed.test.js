import assert from "node:assert/strict";
import test from "node:test";
import { replaceDhanOrders, snapshot } from "./market.js";

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
  assert.equal(kept?.strategy, "NIFTY 5m first candle");

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
  assert.equal(snapshot().orders.find((row) => row.id === "sell-22400-again")?.strategy, "NIFTY 5m first candle");
});
