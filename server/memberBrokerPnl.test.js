import assert from "node:assert/strict";
import test from "node:test";
import { adminBookFromDhan, applyBrokerBalance, applyBrokerBookToReport, applyBrokerPnl, applyKotakTradeSession, attachMemberBrokerPnl, brokerPnlFromDhanRows, brokerPnlFromUpstoxRows, dhanAvailableBalance, dhanMasterBook, dhanPnlFromTrades, kotakAvailableBalance, kotakLimitHeaderSets, kotakMasterBook, kotakNeedsTradeLogin, kotakTradeSession, upstoxAvailableBalance, upstoxMasterBook, withAdminBrokerPnl } from "./memberBrokerPnl.js";

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

test("admin day P&L comes from Dhan trades when positions are flat", () => {
  const raw = [
    { tradingSymbol: "NIFTY-Sep2026-23050-CE", securityId: "11", transactionType: "BUY", tradedQuantity: 65, tradedPrice: 140.3, productType: "INTRADAY" },
    { tradingSymbol: "NIFTY-Sep2026-23050-CE", securityId: "11", transactionType: "SELL", tradedQuantity: 65, tradedPrice: 136.65, productType: "INTRADAY" },
  ];
  assert.equal(dhanPnlFromTrades(raw).realizedPnl, -237.25);
  const book = adminBookFromDhan([], raw);
  assert.equal(book.realizedPnl, -237.25);
  assert.equal(book.unrealizedPnl, 0);
  assert.equal(book.mtm, -237.25);
  assert.equal(book.closed[0].symbol, "NIFTY-Sep2026-23050-CE");
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

test("Kotak limits and positions are this user's account balance, MTM, and P&L", () => {
  assert.equal(kotakTradeSession({ token: "member-consumer", apiKey: "member-consumer", sessionToken: "YT2Vm", clientId: "YT2Vm" }), null);
  assert.equal(kotakTradeSession({ token: "trade-token-1452", apiKey: "member-consumer", clientId: "YT2Vm" }), null);
  const session = kotakTradeSession({
    token: "trade-token-1452",
    apiKey: "member-consumer",
    sessionToken: "neo-sid-88",
    clientId: "YT2Vm",
  });
  assert.equal(session.sessionToken, "neo-sid-88");
  assert.equal(session.token, "trade-token-1452");
  const saved = kotakLimitHeaderSets({
    token: "trade-token-1452",
    apiKey: "member-consumer",
    sessionToken: "neo-sid-88",
    clientId: "YT2Vm",
  });
  assert.equal(saved[0].headers.Auth, "trade-token-1452");
  assert.equal(saved[0].headers.Sid, "neo-sid-88");
  assert.equal(saved.some((row) => row.headers.Auth === "neo-sid-88" && row.headers.Sid === "trade-token-1452"), true);
  const appToken = kotakLimitHeaderSets({
    token: "trade-token-1452",
    apiKey: "member-consumer",
    clientId: "YT2Vm",
  });
  assert.equal(appToken.some((row) => row.headers.Authorization === "trade-token-1452"), true);
  assert.equal(appToken.some((row) => row.headers.Authorization === "member-consumer"), true);
  assert.equal(appToken.some((row) => row.headers.Sid === "YT2Vm"), false);
  assert.equal(kotakAvailableBalance({ stat: "Ok", Category: "net", Net: "88420.50", MarginUsed: "1200" }), 88420.5);
  assert.equal(kotakAvailableBalance({ data: { NotionalCash: "10000", MarginUsed: "250" } }), 9750);
  assert.equal(
    kotakAvailableBalance({
      stat: "Ok",
      Category: "CLIENT_SPECIAL",
      Net: "10157.08",
      NotionalCash: "0",
      MarginUsed: "40.4",
    }),
    10157.08,
  );
  assert.equal(
    kotakAvailableBalance({
      stat: "Ok",
      data: [{ Category: "CLIENT_MTF", Net: "88,420.50", NotionalCash: "0", MarginUsed: "1200" }],
    }),
    88420.5,
  );
  assert.equal(
    kotakAvailableBalance({
      stat: "Ok",
      data: [
        { Category: "DPNP", Net: "-10902.00", RealizedMtomPrsnt: "-10902" },
        { Category: "CLIENT_ALL", Net: "0.00", NotionalCash: "0", MarginUsed: "0" },
      ],
    }),
    0,
  );
  assert.equal(
    kotakAvailableBalance({
      stat: "Ok",
      data: [{ Category: "DPNP", Net: "-10861.00", UnrealizedMtomPrsnt: "-10861" }],
    }),
    null,
  );
  assert.equal(kotakMasterBook({ stat: "Ok", stCode: 200 }).realizedPnl, 0);
  assert.equal(kotakMasterBook({ stat: "Ok", data: [] }).mtm, 0);
  assert.equal(kotakMasterBook({ stat: "Ok", data: [] }).empty, true);
  const book = kotakMasterBook([
    { trdSym: "NIFTY26O0622900CE", flBuyQty: "65", flSellQty: "0", avgPrc: "15.40", ltp: "16.00", rlMtom: "0", urMtom: "39", prod: "MIS" },
    { trdSym: "NIFTY26O0622800PE", flBuyQty: "65", flSellQty: "65", rlMtom: "120.5", urMtom: "0", prod: "MIS" },
  ]);
  assert.equal(book.source, "kotak");
  assert.equal(book.realizedPnl, 120.5);
  assert.equal(book.unrealizedPnl, 39);
  assert.equal(book.open.length, 1);
  assert.equal(book.closed.length, 1);
  assert.equal(book.open[0].symbol, "NIFTY26O0622900CE");
  const desk = localDesk();
  applyBrokerPnl(desk, book);
  applyBrokerBalance(desk, { balance: 88420.5, source: "kotak" });
  assert.equal(desk.wallet.balance, 10000);
  assert.equal(desk.wallet.brokerBalance, 88420.5);
  assert.equal(desk.wallet.mtm, 39);
  assert.equal(desk.report.realizedPnl, 120.5);
  assert.equal(desk.report.netPnl, 159.5);
});

test("Kotak balance logs in when the access token is the consumer key", () => {
  const saved = {
    brokerId: "kotak",
    token: "same-consumer-key",
    apiKey: "same-consumer-key",
    sessionToken: "old-neo-sid",
    clientId: "YT2VM",
    mobile: "+919000000000",
    mpin: "111111",
    totpSecret: "GEZDGNBVGY3TQOJQ",
  };
  assert.equal(kotakTradeSession(saved), null);
  assert.equal(kotakLimitHeaderSets(saved).length, 0);
  assert.equal(kotakNeedsTradeLogin(saved), true);
  const ready = {
    brokerId: "kotak",
    token: "trade-token-1452",
    apiKey: "member-consumer",
    sessionToken: "neo-sid-88",
    clientId: "YT2VM",
    mobile: "+919000000000",
    mpin: "111111",
    totpSecret: "GEZDGNBVGY3TQOJQ",
  };
  assert.equal(kotakNeedsTradeLogin(ready), false);
  const loggedIn = applyKotakTradeSession(saved, { tradeToken: "session-token-9", tradeSid: "today-sid-9" });
  const sets = kotakLimitHeaderSets(loggedIn);
  assert.equal(sets[0].headers.Auth, "session-token-9");
  assert.equal(sets[0].headers.Sid, "today-sid-9");
  assert.equal(sets.some((row) => row.headers.Auth === "same-consumer-key"), false);
});

test("broker available balance is the user balance and leaves the wallet topup alone", () => {
  assert.equal(dhanAvailableBalance({ availabelBalance: 15234.5, utilizedAmount: 900 }), 15234.5);
  assert.equal(upstoxAvailableBalance({ data: { equity: { available_margin: 4200.25 }, commodity: { available_margin: 800 } } }), 4200.25);
  const desk = localDesk();
  desk.wallet.balance = 2500;
  applyBrokerBalance(desk, { balance: 15234.5, source: "dhan" });
  assert.equal(desk.wallet.balance, 2500);
  assert.equal(desk.wallet.brokerBalance, 15234.5);
  assert.equal(desk.wallet.brokerBalanceSource, "dhan");
});
