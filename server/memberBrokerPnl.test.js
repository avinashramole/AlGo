import assert from "node:assert/strict";
import test from "node:test";
import { applyBrokerBookToReport, applyBrokerPnl, attachMemberBrokerPnl, brokerPnlFromDhanRows, brokerPnlFromUpstoxRows, dhanMasterBook, upstoxMasterBook, withAdminBrokerPnl } from "./memberBrokerPnl.js";

function localDesk() {
  return {
    wallet: { balance: 10000, mtm: -80, equity: 9920 },
    report: {
      realizedPnl: -2492.75,
      unrealizedPnl: -80,
      grossPnl: -2572.75,
      charges: 86.4,
      netPnl: -2659.15,
    },
  };
}

test("Dhan closed legs keep realized profit and open legs keep MTM", () => {
  const pnl = brokerPnlFromDhanRows([
    { positionType: "CLOSED", netQty: 0, tradingSymbol: "NIFTY-Oct2026-23100-CE", realizedProfit: 308, unrealizedProfit: 0 },
    { positionType: "LONG", netQty: 65, tradingSymbol: "NIFTY-Sep2026-23050-CE", realizedProfit: 0, unrealizedProfit: 12.5 },
  ]);
  assert.equal(pnl.realizedPnl, 308);
  assert.equal(pnl.unrealizedPnl, 12.5);
  assert.equal(pnl.source, "dhan");
});

test("broker realized and MTM replace the local copy total", async () => {
  const desk = localDesk();
  await attachMemberBrokerPnl(desk, "user-1", async () =>
    brokerPnlFromDhanRows([
      { positionType: "CLOSED", netQty: 0, realizedProfit: 200 },
      { positionType: "CLOSED", netQty: 0, realizedProfit: 108, unrealizedProfit: 0 },
    ]),
  );
  assert.equal(desk.report.realizedPnl, 308);
  assert.equal(desk.report.unrealizedPnl, 0);
  assert.equal(desk.report.grossPnl, 308);
  assert.equal(desk.report.charges, 0);
  assert.equal(desk.report.netPnl, 308);
  assert.equal(desk.report.brokerPnl, true);
  assert.equal(desk.wallet.mtm, 0);
  assert.equal(desk.wallet.equity, 10000);
  assert.equal(desk.wallet.balance, 10000);
});

test("an empty broker book is zero, not the local copy sum", () => {
  const desk = localDesk();
  applyBrokerPnl(desk, brokerPnlFromDhanRows([]));
  assert.equal(desk.report.realizedPnl, 0);
  assert.equal(desk.report.unrealizedPnl, 0);
  assert.equal(desk.report.netPnl, 0);
  assert.equal(desk.wallet.mtm, 0);
});

test("a broker payload without P&L fields is ignored", async () => {
  const desk = localDesk();
  const pnl = brokerPnlFromDhanRows([{ tradingSymbol: "NIFTY", netQty: 65 }]);
  assert.equal(pnl, null);
  await attachMemberBrokerPnl(desk, "user-1", async () => {
    throw new Error("down");
  });
  assert.equal(desk.report.realizedPnl, -2492.75);
  assert.equal(desk.wallet.mtm, -80);
});

test("a closed admin Dhan book keeps the broker loss when nothing is open", () => {
  const book = dhanMasterBook([
    {
      positionType: "CLOSED",
      netQty: 0,
      tradingSymbol: "NIFTY-Sep2026-23050-CE",
      securityId: "11",
      productType: "INTRADAY",
      buyQty: 65,
      sellQty: 65,
      buyAvg: 140.3,
      sellAvg: 136.65,
      realizedProfit: -237.25,
      unrealizedProfit: 0,
    },
  ]);
  assert.equal(book.realizedPnl, -237.25);
  assert.equal(book.unrealizedPnl, 0);
  assert.equal(book.mtm, -237.25);
  assert.equal(book.closed.length, 1);
  assert.equal(book.closed[0].symbol, "NIFTY-Sep2026-23050-CE");
  assert.equal(book.closed[0].realized, -237.25);
  const day = withAdminBrokerPnl({
    positions: [],
    closedTrades: [],
    byBroker: {},
    unrealized: 0,
    realized: 0,
    broker: book,
  });
  assert.equal(day.totalPnl, -237.25);
  assert.equal(day.pnlByBroker.dhan, -237.25);
});

test("admin report uses the broker MTM and realized P&L", () => {
  const report = applyBrokerBookToReport(
    { realizedPnl: -2492.75, unrealizedPnl: 0, grossPnl: -2492.75, charges: 40, netPnl: -2532.75 },
    { realizedPnl: -237.25, unrealizedPnl: 12.5, mtm: -224.75, source: "dhan" },
  );
  assert.equal(report.realizedPnl, -237.25);
  assert.equal(report.unrealizedPnl, 12.5);
  assert.equal(report.netPnl, -224.75);
  assert.equal(report.charges, 0);
});

test("Upstox user book keeps realised and open MTM on separate legs", () => {
  const book = upstoxMasterBook({
    status: "success",
    data: [
      { quantity: 0, trading_symbol: "NIFTY 23050 CE", realised: 200, unrealised: 0 },
      { quantity: 65, trading_symbol: "NIFTY 23100 PE", average_price: 90, last_price: 91.66, realised: 0, unrealised: 108 },
    ],
  });
  assert.equal(book.realizedPnl, 200);
  assert.equal(book.unrealizedPnl, 108);
  assert.equal(book.mtm, 308);
  assert.equal(book.closed.length, 1);
  assert.equal(book.open.length, 1);
  assert.equal(book.closed[0].pnl + book.open[0].pnl, 308);
});

test("Upstox short-term positions use realised and unrealised", () => {
  const pnl = brokerPnlFromUpstoxRows({
    status: "success",
    data: [
      { quantity: 0, realised: 250.5, unrealised: 0 },
      { quantity: 65, realised: 57.5, unrealised: 18.25 },
    ],
  });
  assert.equal(pnl.realizedPnl, 308);
  assert.equal(pnl.unrealizedPnl, 18.25);
  assert.equal(pnl.source, "upstox");
  const desk = localDesk();
  applyBrokerPnl(desk, pnl);
  assert.equal(desk.report.realizedPnl, 308);
  assert.equal(desk.report.unrealizedPnl, 18.25);
  assert.equal(desk.report.netPnl, 326.25);
  assert.equal(desk.wallet.mtm, 18.25);
});
