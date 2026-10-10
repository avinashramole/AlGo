import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test2HoldStyle } from "./niftyVwap/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = process.env.T2S_BACKTEST_REPORT_DIR || path.join(__dirname, "data", "backtests");

/** Deploy must keep this marker. Old plain PDF/Excel files must not replace this file. */
export const T2S_STANDARD_BRAND_REPORT = "proposal-v1";

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

function optionSourceLine(report) {
  const symbol = report.strategy?.symbol || "NIFTY";
  if (report.summary?.optionSource === "stored") return "Option premiums: Dhan rolling option tape";
  if (report.summary?.optionSource === "mixed") {
    return `Option premiums: Dhan rolling tape + research gaps (${report.summary.storedTrades || 0} stored days)`;
  }
  return `No Dhan rolling option tape stored for ${symbol}. Connect Dhan LIVE and run Backtest again to fill option OHLC.`;
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

const XLSX_STYLE = {
  body: 0,
  brand: 1,
  brandSub: 2,
  header: 3,
  label: 4,
  zebra: 5,
  money: 6,
  moneyZebra: 7,
};

function xlsxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/><color rgb="FF000F29"/></font>
<font><sz val="16"/><b/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
<font><sz val="11"/><b/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
<font><sz val="11"/><b/><name val="Calibri"/><color rgb="FFFD6B01"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF000F29"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF6"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFD6B01"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="FFD0D7E2"/></left>
<right style="thin"><color rgb="FFD0D7E2"/></right>
<top style="thin"><color rgb="FFD0D7E2"/></top>
<bottom style="thin"><color rgb="FFD0D7E2"/></bottom>
</border>
</borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="8">
<xf fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf fontId="0" fillId="0" borderId="1" xfId="0" numFmtId="4" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="0" fillId="3" borderId="1" xfId="0" numFmtId="4" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;
}

function xlsxCell(value, ref, style) {
  const s = style != null ? ` s="${style}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${xmlEscape(value ?? "")}</t></is></c>`;
}

function xlsxSheet(rows = [], { widths = [], freeze = 0 } = {}) {
  const cols = widths.length
    ? `<cols>${widths
        .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const view = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const body = rows
    .map((row, r) => {
      const cells = (Array.isArray(row) ? row : []).map((item, c) => {
        const value = item && typeof item === "object" && "v" in item ? item.v : item;
        const style = item && typeof item === "object" && "s" in item ? item.s : undefined;
        return xlsxCell(value, `${colLetter(c)}${r + 1}`, style);
      });
      return `<row r="${r + 1}">${cells.join("")}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${body}</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>&amp;C&amp;"Calibri,Bold"TRADE 2 SMART — Proposal report</oddHeader><oddFooter>&amp;Ltrade2smart.com&amp;CPage &amp;P&amp;RA4 landscape rows</oddFooter></headerFooter></worksheet>`;
}

function xlsxWorkbook(names = []) {
  const sheets = names
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function xlsxRels(count) {
  const rels = [
    ...Array.from({ length: count }, (_, i) => {
      return `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
    }),
    `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join("");
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
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
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
    { name: "xl/styles.xml", data: xlsxStylesXml() },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: xlsxSheet(sheet.rows || [], { widths: sheet.widths || [], freeze: sheet.freeze || 0 }),
    })),
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

function excelPair(label, value, zebra = false) {
  const money = typeof value === "number";
  return [
    { v: label, s: XLSX_STYLE.label },
    { v: value, s: money ? (zebra ? XLSX_STYLE.moneyZebra : XLSX_STYLE.money) : zebra ? XLSX_STYLE.zebra : XLSX_STYLE.body },
  ];
}

function excelHeaderRow(values) {
  return values.map((value) => ({ v: value, s: XLSX_STYLE.header }));
}

function excelFillRow(row, zebra) {
  return fillTableRow(row).map((value) => ({
    v: value,
    s: typeof value === "number" ? (zebra ? XLSX_STYLE.moneyZebra : XLSX_STYLE.money) : zebra ? XLSX_STYLE.zebra : XLSX_STYLE.body,
  }));
}

function excelBookRows(rows) {
  return [
    [{ v: "TRADE 2 SMART", s: XLSX_STYLE.brand }, { v: "Proposal report", s: XLSX_STYLE.brandSub }],
    [{ v: "trade2smart.com", s: XLSX_STYLE.brandSub }, { v: "A4 landscape row / column desk", s: XLSX_STYLE.brandSub }],
    [],
    excelHeaderRow(FILL_HEADER),
    ...rows.map((row, i) => excelFillRow(row, i % 2 === 1)),
  ];
}

export function renderBacktestExcel(report) {
  const pairs = [
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
    ["Option source", optionSourceLine(report)],
    ["Generated", report.generatedAt],
    ["Summary", report.strategy.summary],
  ];
  const summaryRows = [
    [{ v: "TRADE 2 SMART", s: XLSX_STYLE.brand }, { v: "Proposal report", s: XLSX_STYLE.brandSub }],
    [{ v: "trade2smart.com", s: XLSX_STYLE.brandSub }, { v: "A4 landscape row / column desk", s: XLSX_STYLE.brandSub }],
    [],
    excelHeaderRow(["Metric", "Value"]),
    ...pairs.map(([label, value], i) => excelPair(label, value, i % 2 === 1)),
  ];
  const fills = report.legs?.length ? report.legs : report.trades || [];
  const tableWidths = [6, 12, 8, 8, 10, 18, 16, 16, 12, 12, 8, 12, 14, 10, 12, 8];
  return buildXlsx([
    { name: "Summary", rows: summaryRows, widths: [36, 72], freeze: 4 },
    { name: "Combos", rows: excelBookRows(report.trades || []), widths: tableWidths, freeze: 4 },
    { name: "Legs", rows: excelBookRows(fills), widths: tableWidths, freeze: 4 },
  ]);
}

function pdfEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PDF_NAVY = "0.000 0.059 0.161";
const PDF_ORANGE = "0.992 0.420 0.004";
const PDF_LINE = "0.820 0.847 0.886";
const PDF_ZEBRA = "0.910 0.933 0.965";
const PDF_WHITE = "1 1 1";
const PDF_INK = "0.000 0.059 0.161";
const PAGE_W = 842;
const PAGE_H = 595;
const PAGE_MARGIN = 22;

const PDF_COLS = [
  { key: "n", title: "#", w: 22, align: "right" },
  { key: "day", title: "Day", w: 62 },
  { key: "side", title: "Side", w: 40 },
  { key: "option", title: "Opt", w: 28 },
  { key: "strike", title: "Strike", w: 42, align: "right" },
  { key: "symbol", title: "Symbol", w: 90 },
  { key: "entryAt", title: "Entry time", w: 78 },
  { key: "exitAt", title: "Exit time", w: 78 },
  { key: "entry", title: "Entry Rs.", w: 68, align: "right", money: true },
  { key: "exit", title: "Exit Rs.", w: 68, align: "right", money: true },
  { key: "qty", title: "Qty", w: 28, align: "right" },
  { key: "pnl", title: "P&L Rs.", w: 70, align: "right", money: true },
  { key: "margin", title: "Margin Rs.", w: 72, align: "right", money: true },
  { key: "rom", title: "ROM %", w: 38, align: "right" },
];

function pdfTextWidth(text, size) {
  return String(text || "").length * size * 0.5;
}

function cellDisplay(row, col) {
  if (col.money) return pdfInr(row[col.key]);
  if (col.key === "rom") return Number(row.rom || 0).toFixed(2);
  if (col.key === "strike") return row.strike || "";
  return row[col.key] ?? "";
}

function makePdfDoc(report) {
  const pages = [];
  let ops = [];
  let y = 0;
  let pageNo = 0;

  function flush() {
    if (ops.length) pages.push(ops);
    ops = [];
  }

  function text(x, yPos, value, size, font = "F1", color = PDF_INK) {
    ops.push("BT", `/${font} ${size} Tf`, `${color} rg`, `${x.toFixed(2)} ${yPos.toFixed(2)} Td`, `(${pdfEscape(pdfSafe(value))}) Tj`, "ET");
  }

  function rect(x, yPos, w, h, fill, stroke) {
    if (fill) ops.push(`${fill} rg`);
    if (stroke) ops.push("0.4 w", `${stroke} RG`);
    ops.push(`${x.toFixed(2)} ${yPos.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    ops.push(fill && stroke ? "B" : fill ? "f" : "S");
  }

  function footer() {
    rect(PAGE_MARGIN, 12, PAGE_W - PAGE_MARGIN * 2, 14, PDF_NAVY);
    rect(PAGE_MARGIN, 26, PAGE_W - PAGE_MARGIN * 2, 2, PDF_ORANGE);
    text(PAGE_MARGIN + 8, 16, `trade2smart.com  |  T2S desk  |  A4 landscape  |  Page ${pageNo}`, 7, "F2", PDF_WHITE);
  }

  function brandTitle(x, yPos, size) {
    text(x, yPos, "TRADE ", size, "F2", PDF_WHITE);
    text(x + pdfTextWidth("TRADE ", size), yPos, "2", size, "F2", PDF_ORANGE);
    text(x + pdfTextWidth("TRADE 2", size), yPos, " SMART", size, "F2", PDF_WHITE);
  }

  function header() {
    pageNo += 1;
    y = PAGE_H - PAGE_MARGIN;
    rect(0, PAGE_H - 40, PAGE_W, 40, PDF_NAVY);
    rect(0, PAGE_H - 44, PAGE_W, 4, PDF_ORANGE);
    brandTitle(PAGE_MARGIN, PAGE_H - 18, 13);
    text(PAGE_W - PAGE_MARGIN - pdfTextWidth("PROPOSAL REPORT", 11), PAGE_H - 18, "PROPOSAL REPORT", 11, "F2", PDF_ORANGE);
    text(PAGE_MARGIN, PAGE_H - 32, `${report.strategy.name}  |  T2S branded row/column proposal  |  Indian Rupee (Rs.)`, 8, "F1", PDF_WHITE);
    y = PAGE_H - 56;
    footer();
  }

  function ensure(h) {
    if (y - h < 32) {
      flush();
      header();
    }
  }

  function line(value, size = 8) {
    ensure(12);
    text(PAGE_MARGIN, y - 9, value, size);
    y -= 12;
  }

  function section(title) {
    ensure(20);
    rect(PAGE_MARGIN, y - 16, PAGE_W - PAGE_MARGIN * 2, 16, PDF_NAVY);
    rect(PAGE_MARGIN, y - 16, 4, 16, PDF_ORANGE);
    text(PAGE_MARGIN + 8, y - 11, title, 9, "F2", PDF_WHITE);
    y -= 20;
  }

  function metricGrid(items) {
    const cols = 4;
    const gap = 6;
    const boxW = (PAGE_W - PAGE_MARGIN * 2 - gap * (cols - 1)) / cols;
    const boxH = 28;
    items.forEach((item, i) => {
      if (i % cols === 0) ensure(boxH + 6);
      const col = i % cols;
      const x = PAGE_MARGIN + col * (boxW + gap);
      if (col === 0) y -= boxH + 6;
      rect(x, y, boxW, boxH, PDF_ZEBRA, PDF_LINE);
      text(x + 6, y + 17, item.label, 7);
      text(x + 6, y + 6, item.value, 9, "F2");
    });
    y -= 4;
  }

  function table(rows) {
    const tableW = PDF_COLS.reduce((sum, col) => sum + col.w, 0);
    const rowH = 13;
    const drawHead = () => {
      ensure(rowH + 2);
      let x = PAGE_MARGIN;
      for (const col of PDF_COLS) {
        rect(x, y - rowH, col.w, rowH, PDF_NAVY, PDF_NAVY);
        const label = col.title;
        const tx = col.align === "right" ? x + col.w - 3 - pdfTextWidth(label, 6.5) : x + 3;
        text(tx, y - 9, label, 6.5, "F2", PDF_WHITE);
        x += col.w;
      }
      y -= rowH;
    };
    drawHead();
    if (!rows.length) {
      ensure(rowH);
      rect(PAGE_MARGIN, y - rowH, tableW, rowH, PDF_WHITE, PDF_LINE);
      text(PAGE_MARGIN + 4, y - 9, "No rows in this replay.", 7);
      y -= rowH + 6;
      return;
    }
    rows.forEach((row, i) => {
      if (y - rowH < 32) {
        flush();
        header();
        drawHead();
      }
      let x = PAGE_MARGIN;
      for (const col of PDF_COLS) {
        rect(x, y - rowH, col.w, rowH, i % 2 ? PDF_ZEBRA : PDF_WHITE, PDF_LINE);
        const raw = String(cellDisplay(row, col));
        const label = raw.length > 18 && col.w < 50 ? raw.slice(0, 16) : raw;
        const tx = col.align === "right" ? x + col.w - 3 - pdfTextWidth(label, 6.5) : x + 3;
        text(tx, y - 9, label, 6.5);
        x += col.w;
      }
      y -= rowH;
    });
    y -= 8;
  }

  header();
  metricGrid([
    { label: "Product / Symbol", value: `${report.strategy.product || "-"} ${report.strategy.symbol}` },
    { label: "Style / Timeframe", value: `${report.summary.holdStyle || report.strategy.kind || "strategy"} ${report.summary.timeframe || ""}`.trim() },
    { label: "Start date", value: report.summary.from || "-" },
    { label: "End date", value: report.summary.to || "-" },
    { label: "P&L", value: pdfInr(report.summary.pnl) },
    { label: "Trades / Win rate", value: `${report.summary.trades} / ${report.summary.winRate}%` },
    { label: "Wins / Losses", value: `${report.summary.wins} / ${report.summary.losses}` },
    { label: "Drawdown", value: pdfInr(report.summary.maxDrawdown) },
    { label: "Avg/trade", value: pdfInr(report.summary.avgProfit) },
    { label: "Avg win / Avg loss", value: `${pdfInr(report.summary.avgWin)} / ${pdfInr(report.summary.avgLoss)}` },
    { label: "Return/DD", value: String(report.summary.returnDd || 0) },
    { label: "R:R / Expectancy", value: `${report.summary.rewardRisk || 0} / ${pdfInr(report.summary.expectancy)}` },
    { label: "Required margin", value: `${pdfInr(report.summary.requiredMargin)} max` },
    { label: "Avg margin / ROM", value: `${pdfInr(report.summary.avgMargin)} / ${report.summary.rom || 0}%` },
    { label: "Range", value: report.summary.years ? `last ${report.summary.years} year(s)` : report.summary.months ? `last ${report.summary.months} month(s)` : report.summary.range || `${report.summary.from} to ${report.summary.to}` },
    { label: "Generated", value: String(report.generatedAt || "").slice(0, 19) },
    { label: "Option source", value: optionSourceLine(report) },
  ]);
  line(`Start date ${report.summary.from || "-"}  End date ${report.summary.to || "-"}`);
  if (report.summary.combos) line(`Combos ${report.summary.combos} - Combo win rate ${report.summary.comboWinRate}% - Legs ${report.summary.legs || ""}`);
  if (report.summary.maxWinStreak || report.summary.maxLoseStreak) {
    line(`Streaks ${report.summary.maxWinStreak}W / ${report.summary.maxLoseStreak}L - Max DD ${report.summary.maxDdFrom || "-"} to ${report.summary.maxDdTo || "-"}`);
  }
  if (report.summary.overallTargetPct || report.summary.targetHits) {
    line(`Overall profit ${report.summary.overallTargetPct || 5}% of margin - ${report.summary.targetHits || 0} target exits (all 4 legs)`);
  }
  for (const rule of report.strategy.rules?.lines || []) line(rule);
  for (const leg of report.legStats || []) {
    line(`${leg.label || "Leg"} P&L ${pdfInr(leg.pnl)} - ${leg.trades || 0} fills - WR ${leg.winRate || 0}% - avg ${pdfInr(leg.avgProfit)}`);
  }
  line(optionSourceLine(report));
  line(`Generated ${report.generatedAt}`);
  section("LEGS");
  table(report.legs?.length ? report.legs : []);
  section("COMBOS");
  table(report.trades || []);
  flush();
  return pages;
}

export function renderBacktestPdf(report) {
  const pages = makePdfDoc(report);
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
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Rotate 0 /Contents ${contentId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> >>`,
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
  const stamp = String(report.generatedAt || report.summary?.to || "").slice(0, 10) || "report";
  const style = report.summary?.holdStyle ? `-${report.summary.holdStyle}` : "";
  const kind = report.strategy?.kind === "desk" ? "proposal" : "backtest";
  return `${safeName(report.strategy?.name)}${style}-${kind}-${stamp}.${format === "pdf" ? "pdf" : "xlsx"}`;
}

export function isExcelFormat(format) {
  const value = String(format || "").toLowerCase();
  return value === "xlsx" || value === "xls" || value === "excel";
}

export function brandedReportFile(report, format) {
  if (isExcelFormat(format)) {
    return {
      body: renderBacktestExcel(report),
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: reportDownloadName(report, "xlsx"),
    };
  }
  return {
    body: renderBacktestPdf(report),
    type: "application/pdf",
    name: reportDownloadName(report, "pdf"),
  };
}

export function deskToProposalReport(desk = {}, extras = {}) {
  const book = Array.isArray(desk.tradeBook) ? desk.tradeBook : [];
  const trades = book.map((row, index) => ({
    n: index + 1,
    day: String(row.closedAt || desk.date || "").slice(0, 10),
    side: cell(row.side),
    option: cell(row.option),
    strike: Number(row.strike || 0),
    symbol: cell(row.symbol),
    entry: Number(row.entry || 0),
    exit: Number(row.exit || 0),
    entryAt: cell(row.entryAt || row.openedAt),
    exitAt: cell(row.exitAt || row.closedAt),
    qty: Number(row.qty || 0),
    pnl: Number(row.pnl || 0),
    margin: Number(row.margin || 0),
    rom: Number(row.rom || 0),
    netCredit: Number(row.netCredit || 0),
    bars: Number(row.bars || 0),
    key: cell(row.id || row.key),
  }));
  const date = cell(desk.date) || new Date().toISOString().slice(0, 10);
  return {
    strategy: {
      name: extras.title || "Desk P&L",
      product: "T2S",
      symbol: "ALL",
      kind: "desk",
      summary: "Trade 2 Smart standard branded proposal report",
    },
    summary: {
      from: date,
      to: date,
      holdStyle: "live",
      timeframe: "1d",
      pnl: Number(desk.netPnl || 0),
      trades: Number(desk.trades || trades.length || 0),
      wins: Number(desk.wins || 0),
      losses: Number(desk.losses || 0),
      winRate: Number(desk.winRate || 0),
      maxDrawdown: Number(desk.maxDrawdown || 0),
      avgProfit: Number(desk.trades || trades.length) ? Number(desk.realizedPnl || 0) / Number(desk.trades || trades.length) : 0,
      avgWin: 0,
      avgLoss: 0,
      returnDd: 0,
      rewardRisk: 0,
      expectancy: 0,
      requiredMargin: 0,
      avgMargin: 0,
      rom: 0,
      range: date,
    },
    trades,
    legs: trades,
    generatedAt: extras.generatedAt || new Date().toISOString(),
  };
}
