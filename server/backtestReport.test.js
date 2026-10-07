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
    trades: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
    maxDrawdown: -120.5,
    timeframe: "5m",
    years: 10,
    from: "2016-10-07",
    to: "2026-10-07",
    holdStyle: "btst",
    tradesBook: [
      { day: "2026-09-01", side: "SELL CE", entry: 80, exit: 70, qty: 65, pnl: 650, bars: 2 },
      { day: "2026-09-01", side: "BUY PE", entry: 20, exit: 30, qty: 65, pnl: 650, bars: 2 },
    ],
  };
  const saved = saveBacktestReport(algo, result);
  assert.equal(saved.trades.length, 2);
  assert.equal(saved.summary.holdStyle, "btst");
  const loaded = loadBacktestReport("a14", algo);
  assert.equal(loaded.summary.trades, 2);
  const pdf = renderBacktestPdf(loaded);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /TEST2/);
  const xls = renderBacktestExcel(loaded);
  const xml = xls.toString("utf8");
  assert.match(xml, /Excel.Sheet/);
  assert.match(xml, /SELL CE/);
  assert.match(xml, /Worksheet ss:Name="Trades"/);
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
