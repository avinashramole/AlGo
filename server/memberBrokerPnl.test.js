import assert from "node:assert/strict";
import test from "node:test";
import { adminBookFromDhan, applyBrokerBalance, applyBrokerBookToReport, applyBrokerPnl, applyKotakTradeSession, attachMemberBrokerPnl, brokerPnlFromDhanRows, brokerPnlFromUpstoxRows, dhanAvailableBalance, dhanFundsSnapshot, dhanMasterBook, dhanPnlFromTrades, kotakAvailableBalance, kotakFundsSnapshot, kotakLimitHeaderSets, kotakMasterBook, kotakNeedsTradeLogin, kotakTradeSession, overlayDeskLiveMtm, overlayLiveUnrealized, upstoxAvailableBalance, upstoxFundsSnapshot, upstoxMasterBook, withAdminBrokerPnl } from "./memberBrokerPnl.js";

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
  assert.equal(book.closed[0].buyQty, 65);
  assert.equal(book.closed[0].sellQty, 65);
  assert.equal(book.closed[0].buyPrice, 140.3);
  assert.equal(book.closed[0].sellPrice, 136.65);
  assert.equal(book.closed[0].product, "INTRADAY");
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

test("a Dhan closed row with only P&L and LTP picks up buy/sell from trades", () => {
  const book = adminBookFromDhan(
    [
      {
        positionType: "CLOSED",
        netQty: 0,
        tradingSymbol: "NIFTY26O1322650PE",
        productType: "I",
        lastTradedPrice: 299.85,
        realizedProfit: 10543,
        unrealizedProfit: 0,
      },
    ],
    [
      { tradingSymbol: "NIFTY26O1322650PE", transactionType: "BUY", tradedQuantity: 65, tradedPrice: 137.5, productType: "I" },
      { tradingSymbol: "NIFTY26O1322650PE", transactionType: "SELL", tradedQuantity: 65, tradedPrice: 299.85, productType: "I" },
    ],
  );
  assert.equal(book.closed[0].symbol, "NIFTY26O1322650PE");
  assert.equal(book.closed[0].product, "INTRADAY");
  assert.equal(book.closed[0].buyQty, 65);
  assert.equal(book.closed[0].sellQty, 65);
  assert.equal(book.closed[0].buyPrice, 137.5);
  assert.equal(book.closed[0].sellPrice, 299.85);
  assert.equal(book.closed[0].qty, 65);
  assert.equal(book.closed[0].realized, 10543);
});

test("snake_case Dhan closed legs keep buy and sell qty and price", () => {
  const book = dhanMasterBook([
    {
      position_type: "CLOSED",
      net_qty: 0,
      trading_symbol: "NIFTY26O1322650PE",
      product_type: "I",
      buy_qty: 65,
      sell_qty: 65,
      buy_avg: 137.5,
      sell_avg: 299.85,
      last_traded_price: 299.85,
      realized_profit: 10543,
      unrealized_profit: 0,
    },
  ]);
  assert.equal(book.closed[0].buyQty, 65);
  assert.equal(book.closed[0].sellQty, 65);
  assert.equal(book.closed[0].buyPrice, 137.5);
  assert.equal(book.closed[0].sellPrice, 299.85);
  assert.equal(book.closed[0].ltp, 299.85);
  assert.equal(book.closed[0].product, "INTRADAY");
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
    {
      realizedPnl: -237.25,
      unrealizedPnl: 12.5,
      mtm: -224.75,
      source: "dhan",
      closed: [
        {
          id: "dhan-closed-11",
          symbol: "NIFTY 23050 CE",
          side: "BUY",
          qty: 65,
          entry: 140.3,
          exit: 136.65,
          realized: -237.25,
          brokerId: "dhan",
        },
      ],
    },
  );
  assert.equal(report.realizedPnl, -237.25);
  assert.equal(report.unrealizedPnl, 12.5);
  assert.equal(report.netPnl, -224.75);
  assert.equal(report.charges, 0);
  assert.equal(report.trades, 1);
  assert.equal(report.tradeBook[0].symbol, "NIFTY 23050 CE");
  assert.equal(report.tradeBook[0].pnl, -237.25);
  assert.equal(report.daily.length, 5);
  assert.equal(report.daily.some((row) => String(row.date).startsWith("2026-08")), false);
});

test("live quote MTM replaces stale broker unrealized and keeps realized", () => {
  const report = overlayLiveUnrealized(
    { realizedPnl: 308, unrealizedPnl: 12.5, grossPnl: 320.5, charges: 0, netPnl: 320.5, brokerPnl: true },
    [{ qty: 65, pnl: 40 }],
  );
  assert.equal(report.realizedPnl, 308);
  assert.equal(report.unrealizedPnl, 40);
  assert.equal(report.netPnl, 348);
  assert.equal(report.liveMtm, true);
});

test("index-like option marks do not overwrite broker MTM with crore P&L", () => {
  const desk = {
    wallet: { balance: 9511.17, mtm: 80, equity: 9591.17 },
    report: { realizedPnl: 10549.5, unrealizedPnl: 80, charges: 0, netPnl: 10629.5, brokerPnl: true },
    positions: [
      {
        symbol: "NIFTY-Oct2026-22450-CE",
        option: "CE",
        qty: 650,
        avg: 62.45,
        ltp: 22386,
        pnl: (22386 - 62.45) * 650,
      },
    ],
  };
  overlayDeskLiveMtm(desk);
  assert.equal(desk.report.unrealizedPnl, 80);
  assert.equal(desk.report.realizedPnl, 10549.5);
  assert.ok(Math.abs(desk.wallet.mtm) < 1000);
  assert.ok(Math.abs(desk.report.netPnl) < 20000);
});

test("member desk overlay keeps broker realized and ticks wallet MTM", () => {
  const desk = {
    wallet: { balance: 10000, mtm: 12.5, equity: 10012.5 },
    report: { realizedPnl: 200, unrealizedPnl: 12.5, charges: 0, netPnl: 212.5, brokerPnl: true },
    positions: [{ qty: 65, pnl: 78 }],
  };
  overlayDeskLiveMtm(desk);
  assert.equal(desk.report.realizedPnl, 200);
  assert.equal(desk.report.unrealizedPnl, 78);
  assert.equal(desk.report.netPnl, 278);
  assert.equal(desk.wallet.mtm, 78);
  assert.equal(desk.wallet.equity, 10078);
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
  applyBrokerBalance(desk, { balance: 15234.5, used: 900, source: "dhan" });
  assert.equal(desk.wallet.balance, 2500);
  assert.equal(desk.wallet.brokerBalance, 15234.5);
  assert.equal(desk.wallet.brokerUsed, 900);
  assert.equal(desk.wallet.brokerBalanceSource, "dhan");
});

test("Upstox with no positions is free margin, not 100% used", () => {
  const snap = upstoxFundsSnapshot({
    data: { equity: { available_margin: 18450.5, used_margin: 0 }, commodity: { available_margin: 0, used_margin: 0 } },
  });
  assert.equal(snap.balance, 18450.5);
  assert.equal(snap.used, 0);
  assert.equal(snap.source, "upstox");
  const dhan = dhanFundsSnapshot({ availabelBalance: 15234.5, utilizedAmount: 0 });
  assert.equal(dhan.used, 0);
  const kotak = kotakFundsSnapshot({ Category: "ALL", Net: 5000, MarginUsed: 0 });
  assert.equal(kotak.balance, 5000);
  assert.equal(kotak.used, 0);
  const used = upstoxFundsSnapshot({ data: { equity: { available_margin: 8000, used_margin: 2000 } } });
  assert.equal(used.balance, 8000);
  assert.equal(used.used, 2000);
});
