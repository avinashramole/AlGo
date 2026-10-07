import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-bt-"));
process.env.T2S_BACKTEST_REPORT_DIR = dir;

const { buildBacktestReport, clearBacktestReport, loadBacktestReport, renderBacktestExcel, renderBacktestPdf, reportDownloadName, saveBacktestReport } = await import("./backtestReport.js");

test("backtest report builds PDF and Excel from the trade book", () => {
  const algo = { id: "a14", name: "TEST2", kind: "nifty-test2", symbol: "NIFTY", holdStyle: "btst", summary: "TEST2 BTST" };
  const result = {
    ranAt: "2026-10-07T10:00:00.000Z",
    pnl: -120.5,
    trades: 1,
    wins: 1,
    losses: 1,
    winRate: 50,
    maxDrawdown: -120.5,
    avgProfit: -60.25,
    rewardRisk: 1.39,
    returnDd: 3.62,
    timeframe: "5m",
    years: 10,
    from: "2016-10-07",
    to: "2026-10-07",
    holdStyle: "btst",
    requiredMargin: 110000,
    avgMargin: 108000,
    rom: 1.13,
    tradesBook: [
      { day: "2026-09-01", side: "COMBO", symbol: "NIFTY 4-leg", entry: 160, exit: 140, qty: 65, pnl: 1220, margin: 108000, rom: 1.13, bars: 2 },
    ],
    legsBook: [
      { day: "2026-09-01", side: "SELL", option: "CE", strike: 24800, entry: 80, exit: 70, qty: 65, pnl: 650, margin: 108000, bars: 2, key: "sellCe" },
      { day: "2026-09-01", side: "SELL", option: "PE", strike: 24200, entry: 80, exit: 90, qty: 65, pnl: -650, bars: 2, key: "sellPe" },
      { day: "2026-09-01", side: "BUY", option: "CE", strike: 24700, entry: 20, exit: 18, qty: 65, pnl: -130, bars: 2, key: "buyCe" },
      { day: "2026-09-01", side: "BUY", option: "PE", strike: 24300, entry: 20, exit: 40, qty: 65, pnl: 1300, bars: 2, key: "buyPe" },
    ],
    legStats: [
      { key: "sellCe", label: "SELL CE", side: "SELL", option: "CE", trades: 1, wins: 1, winRate: 100, pnl: 650, avgProfit: 650 },
    ],
  };
  const saved = saveBacktestReport(algo, result);
  assert.equal(saved.trades.length, 1);
  assert.equal(saved.legs.length, 4);
  assert.equal(saved.legs[0].side, "SELL");
  assert.equal(saved.legs[2].side, "BUY");
  assert.equal(saved.summary.holdStyle, "btst");
  assert.equal(saved.summary.avgProfit, -60.25);
  assert.match(renderBacktestPdf(saved).toString("latin1"), /Avg\/trade/);
  const loaded = loadBacktestReport("a14", algo);
  assert.equal(loaded.summary.trades, 1);
  const pdf = renderBacktestPdf(loaded);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /TEST2/);
  assert.match(pdf.toString("latin1"), /SELL/);
  assert.match(pdf.toString("latin1"), /BUY/);
  const xls = renderBacktestExcel(loaded);
  const xml = xls.toString("utf8");
  assert.match(xml, /Excel.Sheet/);
  assert.match(xml, /SELL/);
  assert.match(xml, /Worksheet ss:Name="Legs"/);
  assert.match(xml, /Worksheet ss:Name="Combos"/);
  assert.match(xml, /Required margin/);
  assert.match(xml, /108000/);
  assert.match(pdf.toString("latin1"), /Required margin/);
  assert.match(pdf.toString("latin1"), /LEGS/);
  assert.match(pdf.toString("latin1"), /Margin/);
  assert.equal(saved.legs[0].margin, 108000);
  assert.equal(reportDownloadName(loaded, "pdf"), "TEST2-btst-backtest-2026-10-07.pdf");
  clearBacktestReport("a14");
  assert.equal(loadBacktestReport("a14", { lastBacktest: null }), null);
});

test("backtest report falls back to lastBacktest when the file is missing", () => {
  const algo = {
    id: "missing",
    name: "NIFTY",
    lastBacktest: {
      pnl: 10,
      trades: 1,
      winRate: 100,
      book: [{ side: "BUY", entry: 100, exit: 110, qty: 65, pnl: 650, bars: 1 }],
    },
  };
  const report = buildBacktestReport(algo, algo.lastBacktest);
  assert.equal(report.trades[0].pnl, 650);
  assert.equal(renderBacktestPdf(report)[0], 0x25);
});
