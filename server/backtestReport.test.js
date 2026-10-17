import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-bt-"));
process.env.T2S_BACKTEST_REPORT_DIR = dir;

const { T2S_STANDARD_BRAND_REPORT, brandedReportFile, buildBacktestReport, clearBacktestReport, deskToProposalReport, loadBacktestReport, PDF_MEMBER_IDENTITY_FONT, renderBacktestExcel, renderBacktestPdf, reportDownloadName, saveBacktestReport } = await import("./backtestReport.js");
const { loadFullBrandLogo, PDF_MEMBER_WATERMARK_COVER, PDF_WATERMARK_COVER } = await import("./pdfBrandLogo.js");

function watermarkBox(pdf) {
  const match = pdf.match(/([0-9.]+) 0 0 ([0-9.]+) [0-9.]+ [0-9.]+ cm\n\/Im1 Do/);
  return { w: Number(match?.[1] || 0), h: Number(match?.[2] || 0) };
}

function pdfTextY(pdf, label) {
  const needle = `(${label}) Tj`;
  const at = pdf.indexOf(needle);
  if (at < 0) return -1;
  const td = pdf.lastIndexOf(" Td", at);
  const line = pdf.slice(pdf.lastIndexOf("\n", td) + 1, td);
  return Number(line.split(" ")[1]);
}

test("full T2S logo is decoded for the PDF watermark", () => {
  const logo = loadFullBrandLogo();
  assert.ok(logo.width >= 200);
  assert.ok(logo.height >= 200);
  assert.equal(logo.rgb.length, logo.width * logo.height * 3);
});

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
      {
        day: "2026-09-01",
        side: "COMBO",
        symbol: "NIFTY 4-leg",
        entry: 160,
        exit: 140,
        qty: 65,
        pnl: 1220,
        margin: 108000,
        rom: 1.13,
        bars: 2,
        entryAt: "2026-09-01 09:35",
        exitAt: "2026-09-02 09:35",
      },
    ],
    legsBook: [
      { day: "2026-09-01", side: "SELL", option: "CE", strike: 24800, entry: 80, exit: 70, qty: 65, pnl: 650, margin: 108000, bars: 2, key: "sellCe", entryAt: "2026-09-01 09:35", exitAt: "2026-09-02 09:35" },
      { day: "2026-09-01", side: "SELL", option: "PE", strike: 24200, entry: 80, exit: 90, qty: 65, pnl: -650, bars: 2, key: "sellPe", entryAt: "2026-09-01 09:35", exitAt: "2026-09-02 09:35" },
      { day: "2026-09-01", side: "BUY", option: "CE", strike: 24700, entry: 20, exit: 18, qty: 65, pnl: -130, bars: 2, key: "buyCe", entryAt: "2026-09-01 09:35", exitAt: "2026-09-02 09:35" },
      { day: "2026-09-01", side: "BUY", option: "PE", strike: 24300, entry: 20, exit: 40, qty: 65, pnl: 1300, bars: 2, key: "buyPe", entryAt: "2026-09-01 09:35", exitAt: "2026-09-02 09:35" },
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
  assert.match(renderBacktestPdf(saved).toString("latin1"), /Indian Rupee/);
  assert.match(renderBacktestPdf(saved).toString("latin1"), /Rs\. /);
  assert.equal(renderBacktestPdf(saved).toString("latin1").includes("₹"), false);
  const loaded = loadBacktestReport("a14", algo);
  assert.equal(loaded.summary.trades, 1);
  const pdf = renderBacktestPdf(loaded);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.toString("latin1"), /TEST2/);
  assert.match(pdf.toString("latin1"), /\(TRADE\)/);
  assert.match(pdf.toString("latin1"), /\(2\)/);
  assert.match(pdf.toString("latin1"), /\(SMART\)/);
  assert.match(pdf.toString("latin1"), /Backtest report/);
  assert.match(pdf.toString("latin1"), /Confidential desk report/);
  assert.match(pdf.toString("latin1"), /Currency Indian Rupee/);
  assert.match(pdf.toString("latin1"), /Win rate/);
  assert.match(pdf.toString("latin1"), /ROM/);
  assert.match(pdf.toString("latin1"), /Helvetica-Bold/);
  assert.match(pdf.toString("latin1"), /\/XObject << \/Im1 3 0 R >>/);
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
  assert.match(pdf.toString("latin1"), /\/DeviceRGB/);
  assert.match(pdf.toString("latin1"), /\/Im1 Do/);
  assert.match(pdf.toString("latin1"), /\/ca 0\.10/);
  const adminMark = watermarkBox(pdf.toString("latin1"));
  assert.ok(adminMark.w > 350);
  assert.ok(adminMark.w < 500);
  assert.match(pdf.toString("latin1"), /0\.992 0\.420 0\.004/);
  assert.match(pdf.toString("latin1"), /0\.000 0\.059 0\.161/);
  assert.match(pdf.toString("latin1"), /0\.000 0\.059 0\.161 rg\n0\.00 555\.00/);
  assert.match(pdf.toString("latin1"), /SELL/);
  assert.match(pdf.toString("latin1"), /BUY/);
  const xlsx = renderBacktestExcel(loaded);
  const zip = xlsx.toString("latin1");
  assert.equal(xlsx.subarray(0, 2).toString(), "PK");
  assert.match(zip, /xl\/workbook.xml/);
  assert.match(zip, /xl\/styles.xml/);
  assert.match(zip, /FFFD6B01/);
  assert.match(zip, /FF000F29/);
  assert.match(zip, /FFE8EEF6/);
  assert.equal(zip.includes("FFFFF1E6"), false);
  assert.match(zip, /TRADE 2 SMART/);
  assert.match(zip, /trade2smart.com/);
  assert.match(zip, /worksheets\/sheet1.xml/);
  assert.match(zip, /SELL/);
  assert.match(zip, /Entry time/);
  assert.match(zip, /Exit time/);
  assert.match(zip, /2026-09-01 09:35/);
  assert.match(zip, /108000/);
  assert.match(zip, /Required margin/);
  assert.match(zip, /Indian Rupee/);
  assert.match(zip, /INR/);
  assert.match(pdf.toString("latin1"), /Required margin/);
  assert.match(pdf.toString("latin1"), /LEGS/);
  assert.match(pdf.toString("latin1"), /Margin/);
  assert.match(pdf.toString("latin1"), /MediaBox \[0 0 842 595\]/);
  assert.match(pdf.toString("latin1"), /landscape/);
  assert.match(pdf.toString("latin1"), /Entry time/);
  assert.match(pdf.toString("latin1"), /Exit time/);
  assert.match(pdf.toString("latin1"), /Symbol/);
  assert.match(pdf.toString("latin1"), /ROM %/);
  assert.match(pdf.toString("latin1"), /2026-09-01 09:35/);
  assert.match(pdf.toString("latin1"), /2026-09-02 09:35/);
  assert.match(pdf.toString("latin1"), /Rs\. 1,220\.00|Rs\. 1,08,000\.00|Rs\. /);
  assert.match(pdf.toString("latin1"), /P&L Rs\./);
  assert.match(pdf.toString("latin1"), /Margin Rs\./);
  assert.equal(saved.legs[0].entryAt, "2026-09-01 09:35");
  assert.equal(saved.legs[0].exitAt, "2026-09-02 09:35");
  assert.equal(saved.legs[0].margin, 108000);
  assert.equal(saved.summary.from, "2016-10-07");
  assert.equal(saved.summary.to, "2026-10-07");
  assert.match(pdf.toString("latin1"), /Start date 2016-10-07/);
  assert.match(pdf.toString("latin1"), /End date 2026-10-07/);
  assert.match(zip, /Start date/);
  assert.match(zip, /End date/);
  assert.equal(reportDownloadName(loaded, "pdf", { name: "Avinash Ramole" }), "Trade2Smart-Avinash-Ramole.pdf");
  assert.equal(reportDownloadName(loaded, "xlsx", { name: "Avinash Ramole" }), "Trade2Smart-Avinash-Ramole.xlsx");
  assert.equal(reportDownloadName(loaded, "pdf"), "Trade2Smart-user.pdf");
  clearBacktestReport("a14");
  assert.equal(loadBacktestReport("a14", { lastBacktest: null }), null);
});

test("TEST2 PDF and Excel print enter, square-off, premiums and hedge SL", () => {
  const algo = {
    id: "a15",
    name: "TEST2",
    kind: "nifty-test2",
    symbol: "NIFTY",
    holdStyle: "intraday",
    startTimeIst: "09:31",
    endTimeIst: "15:00",
    sellPremium: 200,
    hedgePremium: 20,
    hedgeSlPct: 20,
    overallTargetPct: 5,
    summary: "TEST2 · NIFTY INTRADAY · enter 09:31 IST · square-off 15:00 IST · MIS same day · SELL 1 monthly CE + PE premium ≥200 · BUY 1 weekly CE + PE premium ≥20 · hedge SL 20%",
  };
  const report = buildBacktestReport(algo, {
    holdStyle: "intraday",
    overallTargetPct: 5,
    from: "2025-10-01",
    to: "2026-10-01",
    tradesBook: [],
    legsBook: [],
  });
  assert.equal(report.strategy.rules.enterIst, "09:31");
  assert.equal(report.strategy.rules.squareOffIst, "15:00");
  assert.equal(report.strategy.rules.sellPremium, 200);
  assert.equal(report.strategy.rules.hedgePremium, 20);
  assert.equal(report.strategy.rules.hedgeSlPct, 20);
  assert.equal(report.strategy.product, "MIS");
  const pdf = renderBacktestPdf(report).toString("latin1");
  assert.match(pdf, /enter 09:31 IST/);
  assert.match(pdf, /square-off 15:00 IST/);
  assert.match(pdf, /MIS same day/);
  assert.match(pdf, /premium >= 200/);
  assert.match(pdf, /premium >= 20/);
  assert.match(pdf, /Hedge SL 20%/);
  const pdfText = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map((row) => row[1])
    .filter((body) => body.includes("/F1 ") || body.includes("/F2 "))
    .join("\n");
  assert.equal(pdfText.includes("·"), false);
  assert.equal(pdfText.includes("≥"), false);
  const zip = renderBacktestExcel(report).toString("latin1");
  assert.match(zip, /Enter IST/);
  assert.match(zip, /09:31/);
  assert.match(zip, /Square-off IST/);
  assert.match(zip, /15:00/);
  assert.match(zip, /Hedge SL %/);
  assert.match(zip, /Hedge SL 20% of buy premium/);
  assert.match(zip, /SELL 1 monthly CE \+ PE premium &gt;= 200/);
  assert.match(zip, /BUY 1 weekly CE \+ PE premium &gt;= 20/);
});

test("TEST2 PDF warns when premiums are not from the option tape", () => {
  const report = buildBacktestReport(
    { id: "a16", name: "TEST2", kind: "nifty-test2", symbol: "BANKNIFTY", holdStyle: "intraday" },
    {
      holdStyle: "intraday",
      optionSource: "synth",
      trades: 2,
      pnl: -80,
      tradesBook: [{ day: "2026-07-08", side: "COMBO", symbol: "BANKNIFTY 4-leg", entry: 200, exit: 180, qty: 30, pnl: -40 }],
      legsBook: [],
    },
  );
  const pdf = renderBacktestPdf(report).toString("latin1");
  assert.match(pdf, /No Dhan rolling option tape stored for BANKNIFTY/);
  assert.match(pdf, /Connect Dhan LIVE/);
  assert.match(pdf, /BANKNIFTY/);
  assert.equal(pdf.includes("NOT REAL OPTION PRICES"), false);
  assert.equal(pdf.includes("research book from index candles"), false);
  assert.match(pdf, /COMBO/);
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

test("desk download uses the same branded proposal PDF and Excel", () => {
  assert.equal(T2S_STANDARD_BRAND_REPORT, "proposal-v1");
  const report = deskToProposalReport({
    date: "2026-10-10",
    netPnl: 1220,
    realizedPnl: 1220,
    trades: 1,
    wins: 1,
    losses: 0,
    winRate: 100,
    tradeBook: [
      { id: "t1", symbol: "NIFTY 24800 CE", side: "SELL", qty: 65, entry: 80, exit: 70, pnl: 650, closedAt: "2026-10-10T10:00:00.000Z" },
    ],
  });
  assert.equal(report.strategy.kind, "desk");
  assert.equal(report.trades[0].symbol, "NIFTY 24800 CE");
  const pdf = renderBacktestPdf(report).toString("latin1");
  assert.match(pdf, /\(TRADE\)/);
  assert.match(pdf, /\(2\)/);
  assert.match(pdf, /\(SMART\)/);
  assert.match(pdf, /Proposal report/);
  assert.match(pdf, /Confidential desk report/);
  assert.match(pdf, /NIFTY 24800 CE/);
  assert.match(pdf, /Drawdown/);
  assert.match(pdf, /Win rate/);
  assert.match(pdf, /Required margin/);
  assert.match(pdf, /rolling option tape/);
  const file = brandedReportFile(report, "xlsx", { name: "Desk Admin" });
  assert.equal(file.name, "Trade2Smart-Desk-Admin.xlsx");
  assert.match(file.body.toString("latin1"), /FFFD6B01/);
  assert.match(file.body.toString("latin1"), /FF000F29/);
  assert.match(file.body.toString("latin1"), /Proposal report/);
  assert.match(file.body.toString("latin1"), /Confidential desk report/);
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const deploy = fs.readFileSync(path.join(root, "deploy", "update-website.sh"), "utf8");
  assert.match(deploy, /T2S_STANDARD_BRAND_REPORT/);
  assert.match(deploy, /Do not deploy an old backtestReport\.js/);
  const reports = fs.readFileSync(path.join(root, "src", "pages", "Reports.tsx"), "utf8");
  assert.match(reports, /data-report-download="pdf"/);
  assert.match(reports, /data-report-download="xlsx"/);
  assert.equal(reports.includes("Download CSV"), false);
  const book = fs.readFileSync(path.join(root, "src", "pages", "MemberBook.tsx"), "utf8");
  const index = fs.readFileSync(path.join(root, "server", "index.js"), "utf8");
  const client = fs.readFileSync(path.join(root, "src", "api", "client.ts"), "utf8");
  assert.match(book, /data-member-report-download="pdf"/);
  assert.match(client, /downloadMemberReport/);
  assert.match(client, /\/member\/report\/download/);
  assert.match(index, /\/api\/member\/report\/download/);
  assert.match(index, /title: "My trade report"/);
  assert.match(index, /audience: "member"/);
  assert.match(index, /member: \{ name: user\.name, email: user\.email, mobile: user\.mobile \}/);
  assert.match(client, /Trade2Smart-\$\{storedUserName\(\) \|\| "user"\}/);
  assert.doesNotMatch(client, /t2s-proposal/);
  assert.match(index, /exposedHeaders: \["Content-Disposition"\]/);
  assert.match(index, /brandedReportFile\(report, req\.query\.format, user\)/);
});

test("member desk download keeps P&L cards, drops Drawdown, and prints identity", () => {
  const report = deskToProposalReport(
    {
      date: "2026-10-10",
      netPnl: 0,
      realizedPnl: 0,
      trades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      tradeBook: [
        { id: "t1", symbol: "NIFTY 24800 CE", side: "SELL", qty: 65, entry: 80, exit: 70, pnl: 650, closedAt: "2026-10-10T10:00:00.000Z" },
      ],
    },
    {
      title: "My trade report",
      audience: "member",
      member: { name: "Avinash Ramole", email: "avinash@t2s.app", mobile: "9876543210" },
    },
  );
  assert.equal(report.audience, "member");
  assert.equal(report.member.name, "Avinash Ramole");
  assert.equal(report.member.email, "avinash@t2s.app");
  assert.equal(report.member.mobile, "9876543210");
  assert.equal(reportDownloadName(report, "pdf"), "Trade2Smart-Avinash-Ramole.pdf");
  assert.equal(reportDownloadName(report, "xlsx"), "Trade2Smart-Avinash-Ramole.xlsx");
  const pdf = renderBacktestPdf(report).toString("latin1");
  assert.match(pdf, /Trade report/);
  assert.match(pdf, /Product T2S/);
  assert.match(pdf, /Start date 2026-10-10/);
  assert.match(pdf, /End date 2026-10-10/);
  assert.match(pdf, /Range 2026-10-10 Generated/);
  assert.match(pdf, /Avinash Ramole/);
  assert.match(pdf, /avinash@t2s\.app/);
  assert.match(pdf, /9876543210/);
  assert.doesNotMatch(pdf, /Name Avinash Ramole/);
  assert.doesNotMatch(pdf, /Email avinash@t2s\.app/);
  assert.doesNotMatch(pdf, /Mobile 9876543210/);
  assert.equal(PDF_MEMBER_IDENTITY_FONT, 12);
  assert.match(
    pdf,
    /\/F2 12 Tf[\s\S]{0,160}\(Avinash Ramole \| avinash@t2s\.app \| 9876543210\) Tj/,
  );
  const identityY = pdfTextY(pdf, "Avinash Ramole | avinash@t2s.app | 9876543210");
  const brandY = pdfTextY(pdf, "TRADE");
  const productAt = pdf.indexOf("(Product T2S");
  const productTd = pdf.lastIndexOf(" Td", productAt);
  const productLine = pdf.slice(pdf.lastIndexOf("\n", productTd) + 1, productTd);
  const productY = Number(productLine.split(" ")[1]);
  assert.ok(identityY < brandY);
  assert.ok(identityY > productY);
  assert.match(pdf, /Win rate/);
  assert.match(pdf, /TRADES/);
  assert.match(pdf, /NIFTY 24800 CE/);
  assert.match(pdf, /\(TRADE\)/);
  assert.match(pdf, /\(2\)/);
  assert.match(pdf, /\(SMART\)/);
  assert.match(pdf, /0\.918 0\.945 0\.969/);
  assert.match(pdf, /0\.122 0\.290 0\.451/);
  assert.match(pdf, /\/Im1 Do/);
  assert.match(pdf, /\/Subtype \/Image/);
  assert.match(pdf, /\/ca 0\.18/);
  const memberMark = watermarkBox(pdf);
  assert.ok(memberMark.w > 140);
  assert.ok(memberMark.w < 200);
  assert.equal(PDF_MEMBER_WATERMARK_COVER, 0.28);
  assert.equal(PDF_WATERMARK_COVER, 0.72);
  assert.equal(pdf.includes("0.000 0.059 0.161"), false);
  const pageFillAt = pdf.indexOf("0.00 0.00 842.00 595.00 re");
  const watermarkAt = pdf.indexOf("/Im1 Do");
  assert.equal(pageFillAt >= 0, true);
  assert.equal(watermarkAt > pageFillAt, true);
  const brandX = ["TRADE", "2", "SMART"].map((label) => {
    const needle = `(${label}) Tj`;
    const at = pdf.indexOf(needle);
    const td = pdf.lastIndexOf(" Td", at);
    const line = pdf.slice(pdf.lastIndexOf("\n", td) + 1, td);
    return Number(line.split(" ")[0]);
  });
  assert.equal(brandX.length, 3);
  assert.equal(brandX[0] < brandX[1], true);
  assert.equal(brandX[1] < brandX[2], true);
  assert.equal(brandX[1] - brandX[0] >= 48, true);
  assert.equal(brandX[2] - brandX[1] >= 10, true);
  assert.equal(pdf.includes("Proposal report"), false);
  assert.equal(pdf.includes("Drawdown"), false);
  assert.equal(pdf.includes("Avg/trade"), false);
  assert.equal(pdf.includes("Return/DD"), false);
  assert.equal(pdf.includes("Required margin"), false);
  assert.equal(pdf.includes("rolling option tape"), false);
  assert.equal(pdf.includes("Connect Dhan LIVE"), false);
  assert.equal(pdf.includes("LEGS"), false);
  assert.equal(pdf.includes("COMBOS"), false);
  const zip = renderBacktestExcel(report).toString("latin1");
  assert.match(zip, /Trade report/);
  assert.match(zip, /My trade report/);
  assert.match(zip, /Avinash Ramole/);
  assert.match(zip, /avinash@t2s\.app/);
  assert.match(zip, /9876543210/);
  assert.match(zip, /Win rate/);
  assert.match(zip, /NIFTY 24800 CE/);
  assert.equal(zip.includes("Drawdown"), false);
  assert.equal(zip.includes("Required margin"), false);
  assert.equal(zip.includes("Option source"), false);
  assert.equal(zip.includes("rolling option tape"), false);
  assert.equal(zip.includes("Connect Dhan LIVE"), false);
});
