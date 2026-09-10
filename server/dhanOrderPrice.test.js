import assert from "node:assert/strict";
import test from "node:test";
import {
  dhanFilledQty,
  dhanOrderFillPrice,
  mergeDhanOrderPrice,
  resolveLiveBookPrice,
} from "./dhanOrderPrice.js";

test("Dhan MARKET fill uses averageTradedPrice, not send-time LTP in price", () => {
  const mapped = dhanOrderFillPrice({
    tradingSymbol: "NIFTY 10 SEP 23450 PE",
    transactionType: "BUY",
    orderType: "MARKET",
    orderStatus: "TRADED",
    quantity: 65,
    filledQty: 65,
    price: 106,
    averageTradedPrice: 96.71,
  });
  assert.equal(mapped, 96.71);
});

test("Dhan MARKET with price 0 still reads averageTradedPrice", () => {
  assert.equal(
    dhanOrderFillPrice({
      orderType: "MARKET",
      price: 0,
      averageTradedPrice: "96.71",
      filled_qty: 65,
    }),
    96.71,
  );
});

test("unfilled MARKET does not book LTP as entry", () => {
  assert.equal(dhanOrderFillPrice({ orderType: "MARKET", price: 106, filledQty: 0 }), 0);
  assert.equal(
    resolveLiveBookPrice({ type: "MARKET", payloadPrice: 106, livePrice: 0, isPaper: false, isLive: true, ltp: 106 }),
    0,
  );
});

test("LIMIT shows the limit price until a fill arrives", () => {
  assert.equal(dhanOrderFillPrice({ orderType: "LIMIT", price: 95.5, filledQty: 0 }), 95.5);
  assert.equal(
    resolveLiveBookPrice({ type: "LIMIT", payloadPrice: 95.5, livePrice: 0, isPaper: false, isLive: true }),
    95.5,
  );
});

test("paper MARKET still books live LTP", () => {
  assert.equal(
    resolveLiveBookPrice({ type: "MARKET", payloadPrice: 106, livePrice: 0, isPaper: true, ltp: 106 }),
    106,
  );
});

test("merge keeps a previous real fill if Dhan omits avg on a later poll", () => {
  assert.equal(mergeDhanOrderPrice({ price: 0, filledQty: 65 }, { price: 96.71, filledQty: 65 }), 96.71);
  assert.equal(mergeDhanOrderPrice({ price: 96.71, filledQty: 65 }, { price: 106, filledQty: 65 }), 96.71);
  assert.equal(mergeDhanOrderPrice({ price: 0, filledQty: 0 }, { price: 106, filledQty: 0 }), 0);
});

test("filled_qty alias is read", () => {
  assert.equal(dhanFilledQty({ filled_qty: 65, price: 0 }), 65);
});

test("live book stores Dhan fill 96.71 instead of payload LTP 106", () => {
  assert.equal(
    resolveLiveBookPrice({
      type: "MARKET",
      payloadPrice: 106,
      livePrice: dhanOrderFillPrice({ price: 106, averageTradedPrice: 96.71, orderType: "MARKET" }),
      isPaper: false,
      isLive: true,
      ltp: 106,
    }),
    96.71,
  );
});
