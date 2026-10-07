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

function inr(value) {
  return `₹${indianNumber(value)}`;
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

function pdfRupeeGlyph() {
  const body = `600 0 0 0 600 750 d1
22 w 1 J 1 j
50 650 m 430 650 l S
50 705 m 390 705 l S
95 40 m 95 615 l S
95 615 260 635 340 530 c 340 410 230 380 95 380 l S
250 380 m 450 40 l S`;
  return `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;
}

function pdfLineOps(line, fontSize) {
  const parts = String(line).split("₹");
  const ops = [];
  parts.forEach((part, i) => {
    if (i) {
      ops.push(`/FR ${fontSize} Tf`);
      ops.push("(R) Tj");
      ops.push(`/F1 ${fontSize} Tf`);
    }
    if (part) ops.push(`(${pdfEscape(part)}) Tj`);
  });
  ops.push("T*");
  return ops;
}

function col(value, width, right = false) {
  const text = String(value ?? "");
  return right ? text.slice(-width).padStart(width, " ") : text.slice(0, width).padEnd(width, " ");
}

function pdfFillRow(row) {
  return [
    col(row.n, 3, true),
    col(row.day, 10),
    col(row.side, 5),
    col(row.option, 3),
    col(row.strike || "", 6, true),
    col(row.symbol, 14),
    col(row.entryAt, 16),
    col(row.exitAt, 16),
    col(inr(row.entry), 12, true),
    col(inr(row.exit), 12, true),
    col(row.qty, 4, true),
    col(inr(row.pnl), 13, true),
    col(inr(row.margin), 14, true),
    col(Number(row.rom || 0).toFixed(2), 6, true),
  ].join(" ");
}

const PDF_FILL_HEADER = [
  col("#", 3, true),
  col("Day", 10),
  col("Side", 5),
  col("Opt", 3),
  col("Strike", 6, true),
  col("Symbol", 14),
  col("Entry time", 16),
  col("Exit time", 16),
  col("Entry ₹", 12, true),
  col("Exit ₹", 12, true),
  col("Qty", 4, true),
  col("P&L ₹", 13, true),
  col("Margin ₹", 14, true),
  col("ROM %", 6, true),
].join(" ");

export function renderBacktestPdf(report) {
  const lines = [
    `T2S backtest report  (landscape)`,
    `${report.strategy.name} · ${report.summary.holdStyle || report.strategy.kind || "strategy"} · Currency Indian Rupee (INR)`,
    `Product ${report.strategy.product || "—"} · ${report.strategy.symbol} · ${report.summary.timeframe || ""}`,
    `Start date ${report.summary.from || "—"} · End date ${report.summary.to || "—"}`,
    `Range ${report.summary.years ? `last ${report.summary.years} year(s)` : report.summary.months ? `last ${report.summary.months} month(s)` : report.summary.range || `${report.summary.from} to ${report.summary.to}`}`,
    `P&L ${inr(report.summary.pnl)} · Trades ${report.summary.trades} · Win rate ${report.summary.winRate}%`,
    `Wins ${report.summary.wins} · Losses ${report.summary.losses} · Drawdown ${inr(report.summary.maxDrawdown)}`,
    report.summary.combos ? `Combos ${report.summary.combos} · Combo win rate ${report.summary.comboWinRate}% · Legs ${report.summary.legs || ""}` : "",
    report.summary.avgProfit || report.summary.rewardRisk
      ? `Avg/trade ${inr(report.summary.avgProfit)} · Avg win ${inr(report.summary.avgWin)} · Avg loss ${inr(report.summary.avgLoss)}`
      : "",
    report.summary.returnDd || report.summary.rewardRisk
      ? `Return/DD ${report.summary.returnDd} · R:R ${report.summary.rewardRisk} · Expectancy ${inr(report.summary.expectancy)}`
      : "",
    report.summary.maxWinStreak || report.summary.maxLoseStreak
      ? `Streaks ${report.summary.maxWinStreak}W / ${report.summary.maxLoseStreak}L · Max DD ${report.summary.maxDdFrom || "-"} to ${report.summary.maxDdTo || "-"}`
      : "",
    report.summary.requiredMargin || report.summary.avgMargin
      ? `Required margin ${inr(report.summary.requiredMargin)} max · avg ${inr(report.summary.avgMargin)} · ROM ${report.summary.rom || 0}%`
      : "",
    report.summary.overallTargetPct || report.summary.targetHits
      ? `Overall profit ${report.summary.overallTargetPct || 5}% of margin · ${report.summary.targetHits || 0} target exits (all 4 legs)`
      : "",
    ...(Array.isArray(report.legStats) ? report.legStats : []).map(
      (leg) =>
        `${leg.label || "Leg"} P&L ${inr(leg.pnl)} · ${leg.trades || 0} fills · WR ${leg.winRate || 0}% · avg ${inr(leg.avgProfit)}`,
    ),
    report.summary.optionSource ? `Premiums ${report.summary.optionSource}` : "",
    `Generated ${report.generatedAt}`,
    report.strategy.summary,
    "",
    "LEGS",
    PDF_FILL_HEADER,
  ].filter((line, index, all) => line || all[index - 1]);
  const fillRows = report.legs?.length ? report.legs : [];
  for (const row of fillRows) lines.push(pdfFillRow(row));
  if (!fillRows.length) lines.push("No legs in this replay.");
  lines.push("", "COMBOS", PDF_FILL_HEADER);
  for (const row of report.trades || []) lines.push(pdfFillRow(row));
  if (!(report.trades || []).length) lines.push("No combos in this replay.");

  const pageW = 842;
  const pageH = 595;
  const marginX = 24;
  const marginY = 24;
  const fontSize = 8;
  const leading = 10;
  const startY = pageH - marginY - 6;
  const perPage = Math.max(20, Math.floor((startY - marginY) / leading));
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  const firstPage = 5;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`,
    "<< /Type /Font /Subtype /Type3 /Name /FR /FontBBox [0 0 600 750] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /rupee 4 0 R >> /Encoding << /Type /Encoding /Differences [82 /rupee] >> /FirstChar 82 /LastChar 82 /Widths [600] >>",
    pdfRupeeGlyph(),
  ];
  for (let i = 0; i < pages.length; i += 1) {
    const contentId = firstPage + i * 2 + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Rotate 0 /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Courier >> /FR 3 0 R >> >> >>`,
    );
    const stream = [
      "BT",
      `/F1 ${fontSize} Tf`,
      `${marginX} ${startY} Td`,
      `${leading} TL`,
      ...pages[i].flatMap((line) => pdfLineOps(line, fontSize)),
      "ET",
    ].join("\n");
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
