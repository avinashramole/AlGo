import assert from "node:assert/strict";
import test from "node:test";
import { dhanFundsNeed, dhanPlaceErrorMessage, isDhanBrokerReject, isDhanFundsReject } from "./dhanPlaceError.js";
import { bookRejectedLiveOrder, snapshot } from "./market.js";

const fundsError = {
  message: "You have insufficient funds. Please add Rs.8929.85 to trade.",
  body: {
    errorType: "Order_Error",
    errorCode: "DH-906",
    errorMessage: "You have insufficient funds. Please add Rs.8929.85 to trade.",
  },
};

test("DH-906 insufficient funds is a Dhan reject, not a local miss", () => {
  assert.equal(isDhanFundsReject(fundsError), true);
  assert.equal(isDhanBrokerReject(fundsError), true);
  assert.equal(dhanFundsNeed(fundsError), "8929.85");
  assert.equal(
    dhanPlaceErrorMessage(fundsError, "getIP sees 66.116.248.198", {
      transactionType: "BUY",
      exchangeSegment: "NSE_FNO",
      productType: "INTRADAY",
      orderType: "MARKET",
      quantity: 30,
    }),
    "Dhan received this order and rejected it. Add ₹8929.85 in the Dhan account, then BUY/SELL again.",
  );
});

test("bookRejectedLiveOrder keeps a Dhan funds reject on the order book without a broker orderId", () => {
  const booked = bookRejectedLiveOrder(
    { symbol: "BANKNIFTY 52000 CE", side: "BUY", qty: 30, product: "MIS", type: "MARKET", brokerId: "dhan" },
    {
      ...fundsError,
      live: { status: "REJECTED", reason: dhanPlaceErrorMessage(fundsError) },
    },
  );
  assert.ok(booked);
  assert.notEqual(booked.error, "Connect this broker before placing an order");
  assert.equal(booked.status, "REJECTED");
  assert.equal(booked.brokerId, "dhan");
  assert.match(String(booked.reason || ""), /Add ₹8929.85|insufficient funds|rejected/i);
  const row = snapshot().orders.find((item) => item.id === booked.id);
  assert.ok(row);
  assert.equal(row.status, "REJECTED");
});
