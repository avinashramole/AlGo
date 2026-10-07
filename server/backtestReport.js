import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test2HoldStyle } from "./niftyVwap/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = process.env.T2S_BACKTEST_REPORT_DIR || path.join(__dirname, "data", "backtests");

function safeName(value) {
  return String(value || "strategy")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "strategy";
}

function reportPath(id) {
  return path.join(REPORT_DIR, `${safeName(id)}.json`);
}

function cell(value) {
  if (value == null) return "";
  return String(value);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function tradeRows(result = {}) {
  const rows = Array.isArray(result.tradesBook)
    ? result.tradesBook
    : Array.isArray(result.book)
      ? result.book
      : [];
  return rows.map((row, index) => ({
    n: index + 1,
    day: cell(row.day || row.date || ""),
    side: cell(row.side || row.type || ""),
    symbol: cell(row.symbol || row.reason || ""),
    entry: Number(row.entry || row.avg || 0),
    exit: Number(row.exit || 0),
    qty: Number(row.qty || 0),
    pnl: Number(row.pnl || 0),
    bars: Number(row.bars || 0),
  }));
}

export function buildBacktestReport(algo = {}, result = {}) {
  const trades = tradeRows(result);
  const holdStyle = result.holdStyle || (String(algo.kind || "").includes("test2") ? test2HoldStyle(algo) : "");
  return {
    generatedAt: result.ranAt || new Date().toISOString(),
    strategy: {
      id: cell(algo.id),
      name: cell(algo.name || "Strategy"),
      kind: cell(algo.kind || ""),
      symbol: cell(algo.symbol || "NIFTY"),
      holdStyle,
      product: holdStyle === "intraday" ? "MIS" : holdStyle === "btst" ? "NRML" : cell(algo.product || ""),
      summary: cell(algo.summary || ""),
    },
    summary: {
      pnl: Number(result.pnl || 0),
      trades: Number(result.trades || trades.length || 0),
      wins: Number(result.wins || trades.filter((row) => row.pnl > 0).length || 0),
      losses: Number(result.losses || 0),
      winRate: Number(result.winRate || 0),
      combos: Number(result.combos || 0),
      comboWinRate: Number(result.comboWinRate || 0),
      maxDrawdown: Number(result.maxDrawdown || 0),
      avgProfit: Number(result.avgProfit || 0),
      avgWin: Number(result.avgWin || 0),
      avgLoss: Number(result.avgLoss || 0),
      maxProfit: Number(result.maxProfit || 0),
      maxLoss: Number(result.maxLoss || 0),
      maxWinStreak: Number(result.maxWinStreak || 0),
      maxLoseStreak: Number(result.maxLoseStreak || 0),
      expectancy: Number(result.expectancy || 0),
      rewardRisk: Number(result.rewardRisk || 0),
      returnDd: Number(result.returnDd || 0),
      legs: Number(result.legs || 0),
      maxDdFrom: cell(result.maxDdFrom || ""),
      maxDdTo: cell(result.maxDdTo || ""),
      maxTradesInDd: Number(result.maxTradesInDd || 0),
      lotNote: cell(result.lotNote || ""),
      timeframe: cell(result.timeframe || algo.timeframe || ""),
      range: cell(result.range || ""),
      years: Number(result.years || 0),
      from: cell(result.from || ""),
      to: cell(result.to || ""),
      source: cell(result.source || ""),
      optionSource: cell(result.optionSource || ""),
      holdStyle,
    },
    trades,
  };
}

export function saveBacktestReport(algo, result) {
  const report = buildBacktestReport(algo, result);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath(algo.id), JSON.stringify(report));
  return report;
}

export function loadBacktestReport(id, algo, fallback) {
  const file = reportPath(id);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      /* rebuild from last backtest */
    }
  }
  if (fallback || algo?.lastBacktest) return buildBacktestReport(algo || {}, fallback || algo.lastBacktest);
  return null;
}

export function clearBacktestReport(id) {
  const file = reportPath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelCell(value, type = "String") {
  if (type === "Number") {
    const n = Number(value);
    return `<Cell ss:Type="Number">${Number.isFinite(n) ? n : 0}</Cell>`;
  }
  return `<Cell ss:Type="String">${xmlEscape(value)}</Cell>`;
}

export function renderBacktestExcel(report) {
  const summaryRows = [
    ["Strategy", report.strategy.name],
    ["Style", report.summary.holdStyle || "—"],
    ["Product", report.strategy.product || "—"],
    ["Symbol", report.strategy.symbol],
    ["Range", report.summary.years ? `Last ${report.summary.years} year(s)` : `${report.summary.from} → ${report.summary.to}`],
    ["From", report.summary.from],
    ["To", report.summary.to],
    ["Timeframe", report.summary.timeframe],
    ["P&L", money(report.summary.pnl)],
    ["Trades", report.summary.trades],
    ["Wins", report.summary.wins],
    ["Losses", report.summary.losses],
    ["Win rate %", report.summary.winRate],
    ["Combos", report.summary.combos],
    ["Combo win rate %", report.summary.comboWinRate],
    ["Legs", report.summary.legs],
    ["Drawdown", money(report.summary.maxDrawdown)],
    ["Avg profit / trade", money(report.summary.avgProfit)],
    ["Avg win", money(report.summary.avgWin)],
    ["Avg loss", money(report.summary.avgLoss)],
    ["Max profit", money(report.summary.maxProfit)],
    ["Max loss", money(report.summary.maxLoss)],
    ["Return / Max DD", report.summary.returnDd],
    ["Reward : Risk", report.summary.rewardRisk],
    ["Expectancy", money(report.summary.expectancy)],
    ["Max win streak", report.summary.maxWinStreak],
    ["Max lose streak", report.summary.maxLoseStreak],
    ["Max DD from", report.summary.maxDdFrom],
    ["Max DD to", report.summary.maxDdTo],
    ["Max trades in DD", report.summary.maxTradesInDd],
    ["Lot", report.summary.lotNote],
    ["Option source", report.summary.optionSource],
    ["Generated", report.generatedAt],
    ["Summary", report.strategy.summary],
  ]
    .map(([label, value]) => `<Row>${excelCell(label)}${excelCell(value)}</Row>`)
    .join("");
  const tradeHeader = `<Row>${["#", "Day", "Side", "Symbol", "Entry", "Exit", "Qty", "P&L", "Bars"].map((h) => excelCell(h)).join("")}</Row>`;
  const tradeBody = report.trades
    .map(
      (row) =>
        `<Row>${excelCell(row.n, "Number")}${excelCell(row.day)}${excelCell(row.side)}${excelCell(row.symbol)}${excelCell(row.entry, "Number")}${excelCell(row.exit, "Number")}${excelCell(row.qty, "Number")}${excelCell(row.pnl, "Number")}${excelCell(row.bars, "Number")}</Row>`,
    )
    .join("");
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Summary"><Table>${summaryRows}</Table></Worksheet>
<Worksheet ss:Name="Trades"><Table>${tradeHeader}${tradeBody}</Table></Worksheet>
</Workbook>`;
  return Buffer.from(xml, "utf8");
}

function pdfEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function renderBacktestPdf(report) {
  const lines = [
    `T2S backtest report`,
    `${report.strategy.name} · ${report.summary.holdStyle || report.strategy.kind || "strategy"}`,
    `Product ${report.strategy.product || "—"} · ${report.strategy.symbol} · ${report.summary.timeframe || ""}`,
    `Range ${report.summary.years ? `last ${report.summary.years} year(s)` : `${report.summary.from} to ${report.summary.to}`}`,
    `P&L Rs ${money(report.summary.pnl)} · Trades ${report.summary.trades} · Win rate ${report.summary.winRate}%`,
    `Wins ${report.summary.wins} · Losses ${report.summary.losses} · Drawdown Rs ${money(report.summary.maxDrawdown)}`,
    report.summary.combos ? `Combos ${report.summary.combos} · Combo win rate ${report.summary.comboWinRate}% · Legs ${report.summary.legs || ""}` : "",
    report.summary.avgProfit || report.summary.rewardRisk
      ? `Avg/trade Rs ${money(report.summary.avgProfit)} · Avg win ${money(report.summary.avgWin)} · Avg loss ${money(report.summary.avgLoss)}`
      : "",
    report.summary.returnDd || report.summary.rewardRisk
      ? `Return/DD ${report.summary.returnDd} · R:R ${report.summary.rewardRisk} · Expectancy Rs ${money(report.summary.expectancy)}`
      : "",
    report.summary.maxWinStreak || report.summary.maxLoseStreak
      ? `Streaks ${report.summary.maxWinStreak}W / ${report.summary.maxLoseStreak}L · Max DD ${report.summary.maxDdFrom || "-"} to ${report.summary.maxDdTo || "-"}`
      : "",
    report.summary.optionSource ? `Premiums ${report.summary.optionSource} (not AlgoTest NSE tape)` : "",
    `Generated ${report.generatedAt}`,
    report.strategy.summary,
    "",
    "#  Day         Side        Entry      Exit       Qty      P&L",
  ].filter((line, index, all) => line || all[index - 1]);
  for (const row of report.trades) {
    const n = String(row.n).padStart(3, " ");
    const day = String(row.day || "").padEnd(11, " ").slice(0, 11);
    const side = String(row.side || "").padEnd(10, " ").slice(0, 10);
    lines.push(
      `${n} ${day} ${side} ${money(row.entry).padStart(8)} ${money(row.exit).padStart(8)} ${String(row.qty).padStart(6)} ${money(row.pnl).padStart(8)}`,
    );
  }
  if (!report.trades.length) lines.push("No trades in this replay.");

  const perPage = 46;
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  const objects = ["", "<< /Type /Catalog /Pages 2 0 R >>"];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  for (let i = 0; i < pages.length; i += 1) {
    const contentId = 4 + i * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> >> >> >>`);
    const stream = ["BT", "/F1 9 Tf", "36 760 Td", "12 TL", ...pages[i].map((line) => `(${pdfEscape(line)}) Tj T*`), "ET"].join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function reportDownloadName(report, format) {
  const stamp = String(report.generatedAt || "").slice(0, 10) || "backtest";
  const style = report.summary.holdStyle ? `-${report.summary.holdStyle}` : "";
  return `${safeName(report.strategy.name)}${style}-backtest-${stamp}.${format === "pdf" ? "pdf" : "xls"}`;
}
