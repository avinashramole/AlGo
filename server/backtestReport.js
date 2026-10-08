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

function istStamp(ms) {
  const t = Number(ms);
  if (!(t > 0)) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(t))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function clockOf(row, key, fallbackKey) {
  const labeled = cell(row?.[key] || "");
  if (labeled) return labeled;
  return istStamp(row?.[fallbackKey]);
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function indianNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pdfInr(value) {
  return `Rs. ${indianNumber(value)}`;
}

function mapTradeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    n: index + 1,
    day: cell(row.day || row.date || ""),
    exitDay: cell(row.exitDay || ""),
    side: cell(row.side || row.type || ""),
    option: cell(row.option || ""),
    strike: Number(row.strike || 0),
    symbol: cell(row.symbol || row.reason || ""),
    entry: Number(row.entry || row.avg || 0),
    exit: Number(row.exit || 0),
    entryTime: Number(row.entryTime || 0),
    exitTime: Number(row.exitTime || 0),
    entryAt: clockOf(row, "entryAt", "entryTime"),
    exitAt: clockOf(row, "exitAt", "exitTime"),
    qty: Number(row.qty || 0),
    pnl: Number(row.pnl || 0),
    margin: Number(row.margin || 0),
    rom: Number(row.rom || 0),
    netCredit: Number(row.netCredit || 0),
    bars: Number(row.bars || 0),
    key: cell(row.key || ""),
  }));
}

function tradeRows(result = {}) {
  return mapTradeRows(
    Array.isArray(result.tradesBook) ? result.tradesBook : Array.isArray(result.book) ? result.book : [],
  );
}

function legRows(result = {}) {
  if (Array.isArray(result.legsBook) && result.legsBook.length) return mapTradeRows(result.legsBook);
  if (Array.isArray(result.legBook) && result.legBook.length) return mapTradeRows(result.legBook);
  return [];
}

function pdfSafe(text) {
  return String(text ?? "")
    .replace(/[·•]/g, " - ")
    .replace(/₹/g, "Rs. ")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/→/g, "->")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-");
}

function test2Rules(algo = {}, result = {}) {
  const kind = String(algo.kind || result.kind || "");
  if (!kind.includes("test2") && !/^TEST2$/i.test(String(algo.name || ""))) return null;
  const style = result.holdStyle || test2HoldStyle(algo);
  const enterIst = cell(algo.startTimeIst || "09:35");
  const endIst = cell(algo.endTimeIst || "15:15");
  const exitIst = cell(algo.exitTimeIst && algo.exitTimeIst !== "09:35" ? algo.exitTimeIst : "15:15");
  const squareOffIst = style === "intraday" ? endIst : exitIst;
  const sellPremium = Number(algo.sellPremium || result.sellPremium || 80);
  const hedgePremium = Number(algo.hedgePremium || result.hedgePremium || 20);
  const hedgeSlPct = Number(algo.hedgeSlPct || result.hedgeSlPct || 20);
  const overallTargetPct = Number(result.overallTargetPct || algo.overallTargetPct || 5);
  const symbol = cell(algo.symbol || "NIFTY");
  const sellOpt = algo.sellExpiryKind === "weekly" ? "weekly" : "monthly";
  const hedgeOpt = algo.hedgeExpiryKind === "monthly" ? "monthly" : "weekly";
  const hold =
    style === "intraday"
      ? `${symbol} INTRADAY - enter ${enterIst} IST - square-off ${squareOffIst} IST - MIS same day`
      : `${symbol} BTST - buy today ${enterIst} IST - sell tomorrow ${squareOffIst} IST - NRML overnight`;
  return {
    holdStyle: style,
    product: style === "intraday" ? "MIS" : "NRML",
    enterIst,
    squareOffIst,
    symbol,
    sellExpiryKind: sellOpt,
    hedgeExpiryKind: hedgeOpt,
    sellPremium,
    hedgePremium,
    hedgeSlPct,
    overallTargetPct,
    lines: [
      `TEST2 - ${hold}`,
      `SELL 1 ${sellOpt} CE + PE premium >= ${sellPremium}`,
      `BUY 1 ${hedgeOpt} CE + PE premium >= ${hedgePremium}`,
      `Hedge SL ${hedgeSlPct}% of buy premium`,
      `Overall profit +${overallTargetPct}% of required margin exits all 4 legs`,
    ],
  };
}

export function buildBacktestReport(algo = {}, result = {}) {
  const trades = tradeRows(result);
  const holdStyle = result.holdStyle || (String(algo.kind || "").includes("test2") ? test2HoldStyle(algo) : "");
  const rules = test2Rules(algo, { ...result, holdStyle });
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
      rules,
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
      costPerCombo: Number(result.costPerCombo || 0),
      storedTrades: Number(result.storedTrades || 0),
      storedWinRate: Number(result.storedWinRate || 0),
      storedPnl: Number(result.storedPnl || 0),
      skippedDays: Number(result.skippedDays || 0),
      timeframe: cell(result.timeframe || algo.timeframe || ""),
      range: cell(result.range || ""),
      years: Number(result.years || 0),
      from: cell(result.from || ""),
      to: cell(result.to || ""),
      months: Number(result.months || 0),
      source: cell(result.source || ""),
      optionSource: cell(result.optionSource || ""),
      holdStyle,
      requiredMargin: Number(result.requiredMargin || result.maxMargin || 0),
      avgMargin: Number(result.avgMargin || 0),
      maxMargin: Number(result.maxMargin || 0),
      rom: Number(result.rom || 0),
      overallTargetPct: Number(result.overallTargetPct || 0),
      overallTarget: Number(result.overallTarget || 0),
      targetHits: Number(result.targetHits || 0),
    },
    trades,
    legs: legRows(result),
    legStats: Array.isArray(result.legStats) ? result.legStats : [],
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

function crc32(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files = []) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, data]);
    locals.push(localFull);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function colLetter(index) {
  let n = Number(index) + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function xlsxCell(value, ref) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value ?? "")}</t></is></c>`;
}

function xlsxSheet(rows = []) {
  const body = rows
    .map((row, r) => {
      const cells = (Array.isArray(row) ? row : []).map((value, c) => xlsxCell(value, `${colLetter(c)}${r + 1}`)).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function xlsxWorkbook(names = []) {
  const sheets = names
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function xlsxRels(count) {
  const rels = Array.from({ length: count }, (_, i) => {
    return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function buildXlsx(sheets = []) {
  const names = sheets.map((sheet) => String(sheet.name || "Sheet").slice(0, 31));
  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    { name: "xl/workbook.xml", data: xlsxWorkbook(names) },
    { name: "xl/_rels/workbook.xml.rels", data: xlsxRels(names.length) },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xlsxSheet(sheet.rows || []) })),
  ];
  return zipStore(files);
}

function fillTableRow(row) {
  return [
    Number(row.n) || 0,
    row.day || "",
    row.side || "",
    row.option || "",
    Number(row.strike) || 0,
    row.symbol || "",
    row.entryAt || "",
    row.exitAt || "",
    Number(row.entry) || 0,
    Number(row.exit) || 0,
    Number(row.qty) || 0,
    Number(row.pnl) || 0,
    Number(row.margin) || 0,
    Number(row.rom) || 0,
    Number(row.netCredit) || 0,
    Number(row.bars) || 0,
  ];
}

const FILL_HEADER = ["#", "Day", "Side", "Option", "Strike", "Symbol", "Entry time", "Exit time", "Entry", "Exit", "Qty", "P&L", "Margin", "ROM %", "Net credit", "Bars"];

export function renderBacktestExcel(report) {
  const summaryRows = [
    ["Currency", "Indian Rupee (INR ₹)"],
    ["Strategy", report.strategy.name],
    ["Style", report.summary.holdStyle || "—"],
    ["Product", report.strategy.product || "—"],
    ["Symbol", report.strategy.symbol],
    ...(report.strategy.rules
      ? [
          ["Enter IST", report.strategy.rules.enterIst],
          [report.strategy.rules.holdStyle === "intraday" ? "Square-off IST" : "Sell tomorrow IST", report.strategy.rules.squareOffIst],
          ["SELL monthly CE+PE premium >=", report.strategy.rules.sellPremium],
          ["BUY weekly CE+PE premium >=", report.strategy.rules.hedgePremium],
          ["Hedge SL %", report.strategy.rules.hedgeSlPct],
          ["Overall profit %", report.strategy.rules.overallTargetPct],
          ...(report.strategy.rules.lines || []).map((line, i) => [`Rule ${i + 1}`, line]),
        ]
      : []),
    ["Start date", report.summary.from],
    ["End date", report.summary.to],
    ["Range", report.summary.years ? `Last ${report.summary.years} year(s)` : report.summary.months ? `Last ${report.summary.months} month(s)` : report.summary.range || ""],
    ["Timeframe", report.summary.timeframe],
    ["P&L", Number(report.summary.pnl) || 0],
    ["Trades", Number(report.summary.trades) || 0],
    ["Wins", Number(report.summary.wins) || 0],
    ["Losses", Number(report.summary.losses) || 0],
    ["Win rate %", Number(report.summary.winRate) || 0],
    ["Combos", Number(report.summary.combos) || 0],
    ["Combo win rate %", Number(report.summary.comboWinRate) || 0],
    ["Legs", Number(report.summary.legs) || 0],
    ["Drawdown", Number(report.summary.maxDrawdown) || 0],
    ["Avg profit / trade", Number(report.summary.avgProfit) || 0],
    ["Avg win", Number(report.summary.avgWin) || 0],
    ["Avg loss", Number(report.summary.avgLoss) || 0],
    ["Max profit", Number(report.summary.maxProfit) || 0],
    ["Max loss", Number(report.summary.maxLoss) || 0],
    ["Return / Max DD", Number(report.summary.returnDd) || 0],
    ["Reward : Risk", Number(report.summary.rewardRisk) || 0],
    ["Expectancy", Number(report.summary.expectancy) || 0],
    ["Max win streak", Number(report.summary.maxWinStreak) || 0],
    ["Max lose streak", Number(report.summary.maxLoseStreak) || 0],
    ["Max DD from", report.summary.maxDdFrom],
    ["Max DD to", report.summary.maxDdTo],
    ["Max trades in DD", Number(report.summary.maxTradesInDd) || 0],
    ["Lot", report.summary.lotNote],
    ["Cost / combo", Number(report.summary.costPerCombo) || 0],
    ["Required margin (max)", Number(report.summary.requiredMargin) || 0],
    ["Avg required margin", Number(report.summary.avgMargin) || 0],
    ["Return on margin %", Number(report.summary.rom) || 0],
    ["Overall profit %", Number(report.summary.overallTargetPct) || 5],
    ["Overall target exits", Number(report.summary.targetHits) || 0],
    ...(Array.isArray(report.legStats) ? report.legStats : []).flatMap((leg) => [
      [`${leg.label || "Leg"} P&L`, Number(leg.pnl) || 0],
      [`${leg.label || "Leg"} trades`, Number(leg.trades) || 0],
      [`${leg.label || "Leg"} win rate %`, Number(leg.winRate) || 0],
      [`${leg.label || "Leg"} avg`, Number(leg.avgProfit) || 0],
    ]),
    ["Stored trades", Number(report.summary.storedTrades) || 0],
    ["Stored win rate %", Number(report.summary.storedWinRate) || 0],
    ["Skipped days", Number(report.summary.skippedDays) || 0],
    ["Option source", report.summary.optionSource],
    ["Generated", report.generatedAt],
    ["Summary", report.strategy.summary],
  ];
  const fills = report.legs?.length ? report.legs : report.trades || [];
  return buildXlsx([
    { name: "Summary", rows: summaryRows },
    { name: "Combos", rows: [FILL_HEADER, ...(report.trades || []).map(fillTableRow)] },
    { name: "Legs", rows: [FILL_HEADER, ...fills.map(fillTableRow)] },
  ]);
}

function pdfEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PDF_W = 842;
const PDF_H = 595;
const PDF = {
  navy: "0.027 0.094 0.200",
  brand: "0.114 0.306 0.847",
  white: "1 1 1",
  text: "0.090 0.141 0.212",
  muted: "0.392 0.455 0.545",
  line: "0.780 0.820 0.880",
  alt: "0.933 0.949 0.988",
  card: "0.976 0.980 0.992",
  up: "0.059 0.616 0.345",
  down: "0.851 0.188 0.145",
  warnBg: "1.000 0.953 0.878",
  warn: "0.573 0.251 0.047",
};

const TABLE_COLS = [
  { key: "n", title: "#", w: 22, align: "right" },
  { key: "day", title: "Day", w: 58 },
  { key: "side", title: "Side", w: 36 },
  { key: "option", title: "Opt", w: 24 },
  { key: "strike", title: "Strike", w: 42, align: "right" },
  { key: "symbol", title: "Symbol", w: 70 },
  { key: "entryAt", title: "Entry time", w: 80 },
  { key: "exitAt", title: "Exit time", w: 80 },
  { key: "entry", title: "Entry Rs.", w: 62, align: "right", money: true },
  { key: "exit", title: "Exit Rs.", w: 62, align: "right", money: true },
  { key: "qty", title: "Qty", w: 28, align: "right" },
  { key: "pnl", title: "P&L Rs.", w: 64, align: "right", money: true, signed: true },
  { key: "margin", title: "Margin Rs.", w: 68, align: "right", money: true },
  { key: "rom", title: "ROM %", w: 40, align: "right" },
];

function pdfTextWidth(text, size) {
  return String(text || "").length * size * 0.5;
}

function moneyColor(value) {
  const n = Number(value);
  if (n > 0) return PDF.up;
  if (n < 0) return PDF.down;
  return PDF.text;
}

function cellDisplay(col, row) {
  if (col.key === "rom") return Number(row.rom || 0).toFixed(2);
  if (col.key === "strike") return row.strike ? String(row.strike) : "";
  if (col.money) return pdfInr(row[col.key]);
  return row[col.key] == null ? "" : String(row[col.key]);
}

function buildPdfOps(report) {
  const pages = [];
  let ops = [];
  let y = PDF_H - 18;
  const left = 18;
  const tableW = TABLE_COLS.reduce((sum, col) => sum + col.w, 0);
  const rowH = 14;

  const push = (...items) => {
    ops.push(...items);
  };
  const text = (str, x, yy, size, font, color, align = "left", width = 0) => {
    const value = pdfSafe(str);
    let tx = x;
    if (align === "right" && width) tx = x + width - 3 - pdfTextWidth(value, size);
    else if (align === "center" && width) tx = x + (width - pdfTextWidth(value, size)) / 2;
    else tx = x + (align === "left" ? 3 : 0);
    push("BT", `${color} rg`, `/${font} ${size} Tf`, `1 0 0 1 ${tx.toFixed(2)} ${yy.toFixed(2)} Tm`, `(${pdfEscape(value)}) Tj`, "ET");
  };
  const rect = (x, yy, w, h, fill, stroke) => {
    if (fill) push(`${fill} rg`, `${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    if (stroke) push(`${stroke} RG`, "0.4 w", `${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  };
  const finishPage = () => {
    text("trade2smart.com   Confidential desk report   A4 landscape", left, 12, 7, "F1", PDF.muted);
    text(`Page ${pages.length + 1}`, PDF_W - 70, 12, 7, "F1", PDF.muted);
    pages.push(ops);
    ops = [];
    y = PDF_H - 18;
  };
  const need = (h) => {
    if (y - h < 28) {
      finishPage();
      brandBar(true);
    }
  };
  const brandBar = (cont = false) => {
    rect(0, PDF_H - 36, PDF_W, 36, PDF.navy);
    text("TRADE 2 SMART", left, PDF_H - 23, 13, "F2", PDF.white);
    text(cont ? "Backtest report (continued)" : "Backtest report", PDF_W - 210, PDF_H - 23, 10, "F1", PDF.white);
    y = PDF_H - 48;
  };
  const section = (title) => {
    need(22);
    text(title, left, y, 10, "F2", PDF.navy);
    y -= 16;
  };

  brandBar(false);
  text(`${report.strategy.name}  -  ${report.summary.holdStyle || report.strategy.kind || "strategy"}  -  Currency Indian Rupee (Rs.)`, left, y, 11, "F2", PDF.text);
  y -= 13;
  text(
    `Product ${report.strategy.product || "-"}  |  ${report.strategy.symbol}  |  ${report.summary.timeframe || ""}  |  Start date ${report.summary.from || "-"}  -  End date ${report.summary.to || "-"}`,
    left,
    y,
    8,
    "F1",
    PDF.muted,
  );
  y -= 12;
  const range = report.summary.years
    ? `Range last ${report.summary.years} year(s)`
    : report.summary.months
      ? `Range last ${report.summary.months} month(s)`
      : `Range ${report.summary.range || `${report.summary.from} to ${report.summary.to}`}`;
  text(`${range}   Generated ${report.generatedAt}`, left, y, 8, "F1", PDF.muted);
  y -= 14;

  for (const line of report.strategy.rules?.lines || []) {
    need(11);
    text(line, left, y, 8, "F1", PDF.text);
    y -= 11;
  }
  y -= 4;

  const kpis = [
    { label: "P&L", value: pdfInr(report.summary.pnl), color: moneyColor(report.summary.pnl) },
    { label: "Trades", value: String(report.summary.trades || 0) },
    { label: "Win rate", value: `${report.summary.winRate || 0}%` },
    { label: "Drawdown", value: pdfInr(report.summary.maxDrawdown), color: PDF.down },
    { label: "ROM", value: `${report.summary.rom || 0}%` },
  ];
  const cardW = 152;
  const cardH = 36;
  need(cardH + 8);
  kpis.forEach((kpi, i) => {
    const x = left + i * (cardW + 8);
    rect(x, y - cardH + 10, cardW, cardH, PDF.card, PDF.line);
    text(kpi.label, x + 6, y, 7, "F1", PDF.muted);
    text(kpi.value, x + 6, y - 16, 11, "F2", kpi.color || PDF.text);
  });
  y -= cardH + 8;

  const facts = [
    `P&L ${pdfInr(report.summary.pnl)} - Trades ${report.summary.trades} - Win rate ${report.summary.winRate}%`,
    `Wins ${report.summary.wins} - Losses ${report.summary.losses} - Drawdown ${pdfInr(report.summary.maxDrawdown)}`,
    report.summary.combos ? `Combos ${report.summary.combos} - Combo win rate ${report.summary.comboWinRate}% - Legs ${report.summary.legs || ""}` : "",
    report.summary.avgProfit || report.summary.rewardRisk
      ? `Avg/trade ${pdfInr(report.summary.avgProfit)} - Avg win ${pdfInr(report.summary.avgWin)} - Avg loss ${pdfInr(report.summary.avgLoss)}`
      : "",
    report.summary.returnDd || report.summary.rewardRisk
      ? `Return/DD ${report.summary.returnDd} - R:R ${report.summary.rewardRisk} - Expectancy ${pdfInr(report.summary.expectancy)}`
      : "",
    report.summary.maxWinStreak || report.summary.maxLoseStreak
      ? `Streaks ${report.summary.maxWinStreak}W / ${report.summary.maxLoseStreak}L - Max DD ${report.summary.maxDdFrom || "-"} to ${report.summary.maxDdTo || "-"}`
      : "",
    report.summary.requiredMargin || report.summary.avgMargin
      ? `Required margin ${pdfInr(report.summary.requiredMargin)} max - avg ${pdfInr(report.summary.avgMargin)} - ROM ${report.summary.rom || 0}%`
      : "",
    report.summary.overallTargetPct || report.summary.targetHits
      ? `Overall profit ${report.summary.overallTargetPct || 5}% of margin - ${report.summary.targetHits || 0} target exits (all 4 legs)`
      : "",
    ...(Array.isArray(report.legStats) ? report.legStats : []).map(
      (leg) =>
        `${leg.label || "Leg"} P&L ${pdfInr(leg.pnl)} - ${leg.trades || 0} fills - WR ${leg.winRate || 0}% - avg ${pdfInr(leg.avgProfit)}`,
    ),
  ].filter(Boolean);
  for (const line of facts) {
    need(11);
    text(line, left, y, 8, "F1", line.startsWith("P&L ") ? moneyColor(report.summary.pnl) : PDF.text);
    y -= 11;
  }

  const tape =
    report.summary.optionSource === "stored"
      ? "Premiums stored Dhan rolling option tape"
      : report.summary.optionSource === "mixed"
        ? `Premiums mixed - ${report.summary.storedTrades || 0} stored Dhan days in this book; remaining days used the research model`
        : `NOT REAL OPTION PRICES - no Dhan rolling tape for ${report.strategy.symbol} - research book from index candles - do not treat P&L or win rate as live proof`;
  need(22);
  rect(left, y - 10, tableW, 18, report.summary.optionSource === "stored" ? PDF.alt : PDF.warnBg, PDF.line);
  text(tape, left + 4, y - 4, 7.5, "F2", report.summary.optionSource === "stored" ? PDF.navy : PDF.warn);
  y -= 26;

  const drawTable = (title, rows) => {
    section(title);
    const headerH = 16;
    need(headerH + rowH);
    let x = left;
    rect(left, y - headerH + 4, tableW, headerH, PDF.navy);
    for (const col of TABLE_COLS) {
      text(col.title, x, y - 7, 7, "F2", PDF.white, col.align === "right" ? "right" : "left", col.w);
      x += col.w;
    }
    y -= headerH;
    if (!rows.length) {
      need(rowH);
      rect(left, y - rowH + 4, tableW, rowH, PDF.card, PDF.line);
      text(title === "LEGS" ? "No legs in this replay." : "No combos in this replay.", left + 6, y - 6, 8, "F1", PDF.muted);
      y -= rowH + 8;
      return;
    }
    rows.forEach((row, index) => {
      need(rowH);
      let cx = left;
      rect(left, y - rowH + 4, tableW, rowH, index % 2 ? PDF.alt : PDF.white, PDF.line);
      for (const col of TABLE_COLS) {
        const value = cellDisplay(col, row);
        const color = col.signed ? moneyColor(row.pnl) : PDF.text;
        text(value, cx, y - 6, 7, col.signed ? "F2" : "F1", color, col.align === "right" ? "right" : "left", col.w);
        cx += col.w;
      }
      y -= rowH;
    });
    y -= 10;
  };

  drawTable("LEGS", report.legs || []);
  drawTable("COMBOS", report.trades || []);
  finishPage();
  return pages;
}

export function renderBacktestPdf(report) {
  const pages = buildPdfOps(report);
  const firstPage = 3;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`,
  ];
  for (let i = 0; i < pages.length; i += 1) {
    const contentId = firstPage + i * 2 + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Rotate 0 /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> >>`,
    );
    const stream = pages[i].join("\n");
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
  return `${safeName(report.strategy.name)}${style}-backtest-${stamp}.${format === "pdf" ? "pdf" : "xlsx"}`;
}
