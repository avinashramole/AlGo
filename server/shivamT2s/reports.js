import { shivamT2sConfig } from "./config.js";
import { shivamState } from "./state.js";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function zipCrc(data) {
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
    const crc = zipCrc(data);
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

const XLSX_STYLE = { body: 0, brand: 1, header: 3, label: 4, zebra: 5, money: 6 };

function xlsxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
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
<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>
<cellXfs count="8">
<xf fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
<xf fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1"/>
<xf fontId="0" fillId="0" borderId="1" xfId="0" numFmtId="4" applyNumberFormat="1" applyBorder="1"/>
<xf fontId="0" fillId="3" borderId="1" xfId="0" numFmtId="4" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;
}

function xlsxCell(value, ref, style) {
  const s = style != null ? ` s="${style}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${xmlEscape(value ?? "")}</t></is></c>`;
}

function xlsxSheet(rows = [], { widths = [], freeze = 0 } = {}) {
  const cols = widths.length
    ? `<cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const view = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  const autoFilter = rows[0] ? `<autoFilter ref="A1:${colLetter((rows[0] || []).length - 1)}${Math.max(1, rows.length)}"/>` : "";
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
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${body}</sheetData>${autoFilter}</worksheet>`;
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
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: xlsxStylesXml() },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: xlsxSheet(sheet.rows || [], { widths: sheet.widths || [], freeze: sheet.freeze || 0 }),
    })),
  ];
  return zipStore(files);
}

function istStamp(ms = Date.now()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function publicUserId(user = {}) {
  return String(user.id || user.email || "admin").replace(/token|password|secret/gi, "");
}

function sanitizeRow(row = {}) {
  const next = { ...row };
  for (const key of Object.keys(next)) {
    if (/token|password|secret|accesskey|apisecret/i.test(key)) delete next[key];
  }
  return next;
}

function belongs(row, algo, user) {
  if (row?.copyUserId && user?.role !== "admin") return String(row.copyUserId) === String(user.id);
  if (row?.copyUserId && user?.role === "admin") return false;
  if (row.strategyId) return row.strategyId === algo.id;
  return row.strategy === algo.name;
}

export function buildShivamReport({ algo, user, orders = [], positions = [], closed = [] } = {}) {
  const cfg = shivamT2sConfig(algo || {});
  const state = shivamState(algo || {});
  const mine = (rows) => (rows || []).filter((row) => belongs(row, algo, user)).map(sanitizeRow);
  const orderRows = mine(orders);
  const tradeRows = mine(closed.length ? closed : positions);
  const used = Number(state.sessionTrades || 0);
  const limit = Number(cfg.maxTradesPerDay || 0);
  const pnl = tradeRows.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const rejected = orderRows.filter((row) => /REJECT|FAIL/i.test(String(row.status || "")));
  return {
    title: "Shivam T2S Strategy report",
    generatedAt: istStamp(),
    userId: publicUserId(user),
    config: {
      name: cfg.name,
      index: cfg.symbol,
      futures: cfg.futuresInstrument,
      ceTimeframe: cfg.ceTimeframe,
      peTimeframe: cfg.peTimeframe,
      indexTimeframe: cfg.indexTimeframe,
      strikePolicy: cfg.strikePolicy,
      slMode: cfg.slMode,
      slValue: cfg.slValue,
      targetMode: cfg.targetMode,
      targetValue: cfg.targetValue,
      lots: cfg.lots,
      capitalMode: cfg.capitalMode,
      capitalValue: cfg.capitalValue,
      runMode: cfg.runMode,
      liveAuthorized: cfg.liveAuthorized,
      maxTradesPerDay: cfg.maxTradesPerDay,
    },
    summary: {
      tradesUsed: used,
      tradesRemaining: Math.max(0, limit - used),
      tradeCount: tradeRows.length,
      orderCount: orderRows.length,
      rejected: rejected.length,
      grossPnl: pnl,
      netPnl: pnl,
      sessionDate: state.sessionDate || "",
    },
    trades: tradeRows,
    orders: orderRows,
    riskEvents: (state.riskEvents || []).map(sanitizeRow),
  };
}

function headerRow(values) {
  return values.map((value) => ({ v: value, s: XLSX_STYLE.header }));
}

function pairRow(label, value, zebra) {
  return [
    { v: label, s: XLSX_STYLE.label },
    { v: value, s: typeof value === "number" ? XLSX_STYLE.money : zebra ? XLSX_STYLE.zebra : XLSX_STYLE.body },
  ];
}

export function renderShivamExcel(report) {
  const cfg = report.config || {};
  const summary = report.summary || {};
  const tradeHeader = ["Time", "Side", "Option", "Contract", "Strike", "Expiry", "Entry", "Exit", "Lots", "Qty", "Status", "Gross P&L", "Net P&L"];
  const orderHeader = ["Time", "Side", "Symbol", "Qty", "Price", "Status", "Error"];
  const riskHeader = ["Time", "Kind", "Detail"];
  return buildXlsx([
    {
      name: "Trade Summary",
      freeze: 4,
      widths: [36, 28],
      rows: [
        [{ v: "TRADE 2 SMART", s: XLSX_STYLE.brand }, { v: report.title, s: XLSX_STYLE.brand }],
        [{ v: `Generated ${report.generatedAt}`, s: XLSX_STYLE.body }, { v: `Account ${report.userId}`, s: XLSX_STYLE.body }],
        [],
        headerRow(["Metric", "Value"]),
        pairRow("Trades used", summary.tradesUsed || 0),
        pairRow("Trades remaining", summary.tradesRemaining || 0, true),
        pairRow("Trade count", summary.tradeCount || 0),
        pairRow("Rejected orders", summary.rejected || 0, true),
        pairRow("Gross P&L", Number(summary.grossPnl) || 0),
        pairRow("Net P&L", Number(summary.netPnl) || 0, true),
      ],
    },
    {
      name: "Trade Details",
      freeze: 1,
      widths: [18, 10, 10, 22, 12, 14, 12, 12, 8, 8, 12, 12, 12],
      rows: [
        headerRow(tradeHeader),
        ...(report.trades || []).map((row, i) =>
          [
            row.entryAt || row.time || "",
            row.side || row.type || "BUY",
            row.option || "",
            row.symbol || "",
            Number(row.strike) || 0,
            row.expiry || "",
            Number(row.avg || row.entry) || 0,
            Number(row.exit || row.ltp) || 0,
            Number(row.lots) || 0,
            Number(row.qty) || 0,
            row.status || row.type || "",
            Number(row.pnl) || 0,
            Number(row.netPnl ?? row.pnl) || 0,
          ].map((value) => ({ v: value, s: typeof value === "number" ? XLSX_STYLE.money : i % 2 ? XLSX_STYLE.zebra : XLSX_STYLE.body })),
        ),
      ],
    },
    {
      name: "Order History",
      freeze: 1,
      widths: [18, 10, 24, 10, 12, 14, 28],
      rows: [
        headerRow(orderHeader),
        ...(report.orders || []).map((row, i) =>
          [row.placedAt || row.time || "", row.side || "", row.symbol || "", Number(row.qty) || 0, Number(row.price || row.avg) || 0, row.status || "", row.error || row.reason || ""].map(
            (value) => ({ v: value, s: typeof value === "number" ? XLSX_STYLE.money : i % 2 ? XLSX_STYLE.zebra : XLSX_STYLE.body }),
          ),
        ),
      ],
    },
    {
      name: "Risk and Rejections",
      freeze: 1,
      widths: [18, 18, 48],
      rows: [
        headerRow(riskHeader),
        ...(report.riskEvents || []).map((row, i) =>
          [istStamp(row.at), row.kind || "", JSON.stringify({ ...row, at: undefined, kind: undefined })].map((value) => ({
            v: value,
            s: i % 2 ? XLSX_STYLE.zebra : XLSX_STYLE.body,
          })),
        ),
      ],
    },
    {
      name: "Strategy Configuration",
      freeze: 1,
      widths: [28, 36],
      rows: [
        headerRow(["Setting", "Value"]),
        ...Object.entries(cfg).map(([key, value], i) => pairRow(key, value === true || value === false ? String(value) : value, i % 2 === 1)),
      ],
    },
  ]);
}

function pdfEscape(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function renderShivamPdf(report) {
  const lines = [
    "TRADE 2 SMART — Shivam T2S Strategy report",
    `Generated ${report.generatedAt} IST`,
    `Account ${report.userId}`,
    "",
    "Configuration",
    ...Object.entries(report.config || {}).map(([key, value]) => `${key}: ${value}`),
    "",
    `Trades used ${report.summary?.tradesUsed || 0} / ${report.config?.maxTradesPerDay || 0}  remaining ${report.summary?.tradesRemaining || 0}`,
    `Gross P&L ${Number(report.summary?.grossPnl || 0).toFixed(2)}  Net P&L ${Number(report.summary?.netPnl || 0).toFixed(2)}`,
    `Rejected ${report.summary?.rejected || 0}`,
    "",
    "Trades",
    ...(report.trades || []).map(
      (row) =>
        `${row.entryAt || ""} BUY ${row.option || ""} ${row.symbol || ""} strike ${row.strike || ""} expiry ${row.expiry || ""} entry ${row.avg || row.entry || ""} exit ${row.exit || ""} qty ${row.qty || ""} pnl ${row.pnl || 0}`,
    ),
    "",
    "Orders",
    ...(report.orders || []).map((row) => `${row.side || ""} ${row.symbol || ""} qty ${row.qty || ""} ${row.status || ""} ${row.error || ""}`),
    "",
    "Risk and rejections",
    ...(report.riskEvents || []).map((row) => `${row.kind || ""} ${JSON.stringify({ ...row, at: undefined, kind: undefined })}`),
  ];
  const content = lines
    .map((line, i) => `BT /F1 10 Tf 36 ${560 - i * 12} Td (${pdfEscape(String(line).slice(0, 110))}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let offset = 9;
  const xref = ["0000000000 65535 f "];
  let body = "%PDF-1.4\n";
  objects.forEach((obj, i) => {
    const chunk = `${i + 1} 0 obj\n${obj}\nendobj\n`;
    xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    body += chunk;
    offset += Buffer.byteLength(chunk);
  });
  const startxref = offset;
  body += `xref\n0 ${objects.length + 1}\n${xref.join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(body);
}
