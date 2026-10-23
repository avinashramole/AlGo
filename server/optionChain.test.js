import assert from "node:assert/strict";
import test from "node:test";
import {
  exchangeSegmentFor,
  getUnderlying,
  isLastWeekdayOfMonth,
  isWeeklyOptionExpiry,
  listedExpiries,
  currentOptionExpiry,
  nearestWeeklyExpiry,
  upcomingExpiries,
  UNDERLYINGS,
  weekdayNameIST,
  dhanOrderQuantity,
  dhanPositionBookId,
  dhanPositionQuantity,
  collapseDhanPositionRows,
  keepStrikeWindow,
  chooseDeskExpiry,
  dropExpired,
  withExpiryLabels,
  trimAroundAtm,
  capStrikeWindow,
  CHAIN_ATM_WINGS,
} from "./optionChain.js";

test("chooseDeskExpiry defaults to the nearest expiry and keeps a picked date", () => {
  assert.deepEqual(chooseDeskExpiry(["2027-03-09", "2027-03-02", "2027-03-16"], ""), {
    expiry: "2027-03-02",
    pinned: false,
  });
  assert.deepEqual(chooseDeskExpiry(["2027-03-02", "2027-03-09"], "2027-03-09"), {
    expiry: "2027-03-09",
    pinned: true,
  });
});

test("NIFTY monthly is the last Tuesday of the month", () => {
  assert.equal(weekdayNameIST("2026-09-08"), "Tue");
  assert.equal(weekdayNameIST("2026-09-29"), "Tue");
  assert.equal(isLastWeekdayOfMonth("2026-09-29", "Tue"), true);
  assert.equal(isLastWeekdayOfMonth("2026-09-08", "Tue"), false);
  assert.equal(isLastWeekdayOfMonth("2026-10-27", "Tue"), true);
});

test("isWeeklyOptionExpiry skips NIFTY monthly Tuesdays", () => {
  assert.equal(isWeeklyOptionExpiry("2026-09-08", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-15", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-22", "NIFTY"), true);
  assert.equal(isWeeklyOptionExpiry("2026-09-29", "NIFTY"), false);
  assert.equal(isWeeklyOptionExpiry("2026-09-24", "NIFTY"), false);
});

test("currentOptionExpiry stays on this week's live date, even when that Tuesday is monthly", () => {
  const listed = upcomingExpiries("NIFTY", 12);
  const current = dropExpired(listed)[0];
  const nextWeekly = nearestWeeklyExpiry(listed, "NIFTY");
  assert.equal(currentOptionExpiry(listed, "NIFTY"), current);
  assert.equal(currentOptionExpiry(["2026-10-27", "2026-11-03", "2026-11-10"], "NIFTY"), current);
  if (current && nextWeekly && current !== nextWeekly) {
    assert.equal(isLastWeekdayOfMonth(current, "Tue"), true);
    assert.equal(isWeeklyOptionExpiry(current, "NIFTY"), false);
    assert.equal(isWeeklyOptionExpiry(nextWeekly, "NIFTY"), true);
  }
});

test("nearestWeeklyExpiry buys the next weekly and never the monthly", () => {
  assert.equal(
    nearestWeeklyExpiry(["2027-03-02", "2027-03-09", "2027-03-16", "2027-03-30"], "NIFTY"),
    "2027-03-02",
  );
  assert.equal(nearestWeeklyExpiry(["2027-03-30", "2027-04-06", "2027-04-13"], "NIFTY"), "2027-04-06");
  assert.equal(isWeeklyOptionExpiry(nearestWeeklyExpiry(["2027-03-30"], "NIFTY"), "NIFTY"), true);
  assert.notEqual(nearestWeeklyExpiry(["2027-03-30"], "NIFTY"), "2027-03-30");
});

test("listedExpiries restores this week's NIFTY weekly when the desk only has 3 Nov", () => {
  const expected = nearestWeeklyExpiry(upcomingExpiries("NIFTY", 12), "NIFTY");
  const fromDesk = nearestWeeklyExpiry(listedExpiries("NIFTY", ["2026-11-03", "2026-11-10", "2026-11-17"]), "NIFTY");
  assert.equal(fromDesk, expected);
  assert.equal(isWeeklyOptionExpiry(fromDesk, "NIFTY"), true);
  const laterWeeklies = upcomingExpiries("NIFTY", 12).filter((date) => isWeeklyOptionExpiry(date, "NIFTY")).slice(1);
  if (laterWeeklies.length) {
    assert.equal(nearestWeeklyExpiry(laterWeeklies, "NIFTY"), laterWeeklies[0]);
    assert.notEqual(laterWeeklies[0], expected);
  }
});

test("CRUDEOIL is a market card underlying on MCX", () => {
  const crude = getUnderlying("CRUDEOIL");
  assert.equal(crude.id, "CRUDEOIL");
  assert.equal(crude.segment, "MCX_COMM");
  assert.equal(crude.lot, 100);
  assert.equal(crude.step, 50);
  assert.equal(UNDERLYINGS.some((row) => row.id === "CRUDEOIL"), true);
  assert.equal(exchangeSegmentFor("CRUDEOIL 6100 CE"), "MCX_COMM");
  assert.equal(exchangeSegmentFor("SENSEX 82000 CE"), "BSE_FNO");
  const expiries = upcomingExpiries("CRUDEOIL", 3);
  assert.equal(expiries.length, 3);
  assert.equal(expiries.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)), true);
  assert.equal(["Sat", "Sun"].includes(weekdayNameIST(expiries[0])), false);
});

test("CRUDE OIL is listed next to index underlyings for the option chain", () => {
  const ids = UNDERLYINGS.map((row) => row.id);
  assert.deepEqual(ids, ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "CRUDEOIL", "NATURALGAS", "COPPER"]);
  assert.equal(UNDERLYINGS.find((row) => row.id === "CRUDEOIL").label, "CRUDE OIL");
  assert.equal(UNDERLYINGS.find((row) => row.id === "NATURALGAS").label, "NATURAL GAS");
  assert.equal(UNDERLYINGS.find((row) => row.id === "COPPER").segment, "MCX_COMM");
  assert.equal(exchangeSegmentFor("NATURALGAS 250 CE"), "MCX_COMM");
  assert.equal(exchangeSegmentFor("COPPER 850 CE"), "MCX_COMM");
  assert.equal(exchangeSegmentFor("MIDCPNIFTY 13000 CE"), "NSE_FNO");
});

test("Dhan MCX quantity is lots, not barrel lot-size", () => {
  assert.equal(dhanOrderQuantity({ symbol: "NIFTY 24600 CE", qty: 65 }), 65);
  assert.equal(dhanOrderQuantity({ symbol: "BANKNIFTY 52000 PE", qty: 30, lots: 1, lotSize: 30 }), 30);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 CE", qty: 100, lots: 1, lotSize: 100, exchangeSegment: "MCX_COMM" }), 1);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 CE", qty: 200, lots: 1, lotSize: 100 }), 2);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL FUT", qty: 200, exchangeSegment: "MCX_COMM", lotSize: 100 }), 2);
  assert.equal(dhanOrderQuantity({ symbol: "CRUDEOIL 6100 PE", qty: 1, exchangeSegment: "MCX_COMM" }), 1);
});

test("Dhan MCX position qty is barrel units so Crude MTM matches Nifty", () => {
  assert.equal(dhanPositionQuantity({ tradingSymbol: "NIFTY 24600 CE", netQty: 65 }), 65);
  assert.equal(dhanPositionQuantity({ tradingSymbol: "CRUDEOIL 6100 CE", netQty: 1, exchangeSegment: "MCX_COMM" }), 100);
  assert.equal(dhanPositionQuantity({ tradingSymbol: "CRUDEOIL 6100 CE", netQty: 2, lotSize: 100 }), 200);
  assert.equal(dhanPositionQuantity({ tradingSymbol: "CRUDEOIL 16 OCT 6100 CE", netQty: 100, exchangeSegment: "MCX_COMM" }), 100);
  assert.equal(dhanPositionQuantity({ tradingSymbol: "NATURALGAS 250 CE", netQty: 1 }), 1250);
  const avg = 90;
  const ltp = 100;
  const qty = dhanPositionQuantity({ tradingSymbol: "CRUDEOIL 6100 CE", netQty: 1, exchangeSegment: "MCX_COMM" });
  assert.equal(Number(((ltp - avg) * qty).toFixed(2)), 1000);
  assert.equal(Number(((ltp - avg) * 1).toFixed(2)), 10);
});

test("Dhan Crude product aliases and a just-sent SELL collapse to one open lot", () => {
  const rows = collapseDhanPositionRows([
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "INTRADAY", unrealizedProfit: 10 },
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "I", unrealizedProfit: 10 },
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "MIS", unrealizedProfit: 10 },
    { positionType: "SHORT", netQty: -1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "MARGIN", unrealizedProfit: 0 },
  ]);
  assert.equal(rows.length, 0);
  const open = collapseDhanPositionRows([
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "I" },
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "INTRADAY" },
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "MIS" },
    { positionType: "LONG", netQty: 1, securityId: "99", tradingSymbol: "CRUDEOIL 6100 CE", productType: "MARGIN" },
  ]);
  assert.equal(open.length, 1);
  assert.equal(open[0].netQty, 1);
  assert.equal(dhanPositionBookId(open[0]), "dhan-pos-99-INTRADAY");
});

test("desk option chain keeps ATM ±5 only", () => {
  assert.equal(CHAIN_ATM_WINGS, 5);
  const rows = Array.from({ length: 21 }, (_, i) => ({
    strike: 24000 + i * 50,
    atm: i === 10,
  }));
  const next = trimAroundAtm(rows);
  assert.equal(next.length, 11);
  assert.equal(next[0].strike, 24250);
  assert.equal(next[5].atm, true);
  assert.equal(next[10].strike, 24750);
  const capped = capStrikeWindow(rows);
  assert.equal(capped.length, 11);
  assert.deepEqual(capStrikeWindow(next).map((row) => row.strike), next.map((row) => row.strike));
});

test("keepStrikeWindow patches LTP on the same strikes instead of recentering ATM", () => {
  const open = [
    { strike: 24500, atm: true, callLtp: 100 },
    { strike: 24550, atm: false, callLtp: 80 },
    { strike: 24600, atm: false, callLtp: 60 },
  ];
  const incoming = [
    { strike: 24450, atm: false, callLtp: 140 },
    { strike: 24500, atm: false, callLtp: 110 },
    { strike: 24550, atm: true, callLtp: 90 },
    { strike: 24600, atm: false, callLtp: 70 },
    { strike: 24650, atm: false, callLtp: 50 },
  ];
  const next = keepStrikeWindow(open, incoming);
  assert.deepEqual(
    next.map((row) => row.strike),
    [24500, 24550, 24600],
  );
  assert.equal(next[0].callLtp, 110);
  assert.equal(next[1].atm, true);
});

test("today's expiry stays listed after NSE 15:30 so last live chain still shows", () => {
  const expiryDay = "2026-09-22";
  const afterNse = new Date("2026-09-22T10:31:00.000Z");
  const kept = dropExpired([expiryDay, "2026-09-29"], { date: afterNse });
  assert.equal(kept.includes(expiryDay), true);
  const mcxAfterNse = dropExpired([expiryDay, "2026-10-19"], { date: afterNse, symbol: "CRUDEOIL" });
  assert.equal(mcxAfterNse.includes(expiryDay), true);
});

test("withExpiryLabels keeps a Dhan expiry after the session rolls", () => {
  const meta = withExpiryLabels({
    symbol: "NIFTY",
    expiry: "2026-09-22",
    expiries: ["2026-09-29", "2026-10-06"],
    source: "dhan",
  });
  assert.equal(meta.expiry, "2026-09-22");
  assert.equal(meta.expiries[0], "2026-09-22");
});
