import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-master-"));
process.env.T2S_TRADE_ARCHIVE_FILE = path.join(dir, "trade-archive.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");
fs.writeFileSync(process.env.T2S_USERS_FILE, "[]\n");
fs.writeFileSync(process.env.T2S_SESSIONS_FILE, "{}\n");

const { archiveTrades, mergeLiveAndArchived, tradeInWindow } = await import("./tradeArchive.js");
const { clampMasterMonths, resolveMasterWindow, buildMasterReport } = await import("./masterReport.js");
const { brandedReportFile, renderBacktestPdf, reportDownloadName } = await import("./backtestReport.js");
const { saveClientSettings } = await import("./memberDesk.js");

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("master report windows cover custom and 1 3 6 12 months", () => {
  assert.deepEqual(clampMasterMonths(12), 12);
  assert.equal(clampMasterMonths(3), 3);
  const custom = resolveMasterWindow({ range: "custom", from: "2026-01-10", to: "2026-02-01" });
  assert.equal(custom.range, "custom");
  assert.equal(custom.from, "2026-01-10");
  assert.equal(custom.to, "2026-02-01");
  const flipped = resolveMasterWindow({ range: "custom", from: "2026-03-01", to: "2026-02-01" });
  assert.equal(flipped.from, "2026-02-01");
  assert.equal(flipped.to, "2026-03-01");
  const month = resolveMasterWindow({ range: "months", months: 1 }, new Date("2026-10-17T12:00:00+05:30"));
  assert.equal(month.months, 1);
  assert.equal(month.to, "2026-10-17");
  assert.equal(month.from <= month.to, true);
  const year = resolveMasterWindow({ months: 12 }, new Date("2026-10-17T12:00:00+05:30"));
  assert.equal(year.months, 12);
  assert.equal(year.from.slice(0, 4), "2025");
});

test("archived trades keep only the selected date window", () => {
  archiveTrades("u-tape", [
    { id: "old", symbol: "NIFTY 24000 CE", side: "BUY", qty: 65, entry: 80, exit: 90, pnl: 650, closedAt: "2026-01-05T10:00:00.000Z" },
    { id: "mid", symbol: "NIFTY 24100 CE", side: "BUY", qty: 65, entry: 70, exit: 60, pnl: -650, closedAt: "2026-09-01T10:00:00.000Z" },
  ]);
  const live = [{ id: "today", symbol: "CRUDEOIL 5400 CE", side: "SELL", qty: 1, entry: 120, exit: 100, pnl: 20, closedAt: "2026-10-17T05:30:00.000Z" }];
  const rows = mergeLiveAndArchived("u-tape", live, { from: "2026-09-01", to: "2026-10-17" });
  assert.equal(rows.some((row) => row.id === "old"), false);
  assert.equal(rows.some((row) => row.id === "mid"), true);
  assert.equal(rows.some((row) => row.id === "today"), true);
  assert.equal(tradeInWindow({ closedAt: "2026-08-31T10:00:00.000Z" }, "2026-09-01", "2026-10-17"), false);
});

test("master PDF puts admin and user identity in one file", () => {
  saveClientSettings("u-tape", { brokerId: "paper" });
  archiveTrades("admin", [
    { id: "a1", symbol: "NIFTY 25000 CE", side: "BUY", qty: 65, entry: 100, exit: 110, pnl: 650, closedAt: "2026-10-16T10:00:00.000Z" },
  ]);
  archiveTrades("u-tape", [
    { id: "u1", symbol: "CRUDEOIL 5400 CE", side: "SELL", qty: 1, entry: 80, exit: 70, pnl: 10, closedAt: "2026-10-16T10:00:00.000Z" },
  ]);
  const report = buildMasterReport({
    includeAdmin: true,
    userIds: [],
    range: "custom",
    from: "2026-10-01",
    to: "2026-10-17",
  });
  assert.equal(report.audience, "master");
  assert.ok(report.sections.length >= 1);
  assert.equal(reportDownloadName(report, "pdf"), "Trade2Smart-Master-report.pdf");
  const pdf = renderBacktestPdf(report).toString("latin1");
  assert.match(pdf, /Master report/);
  assert.match(pdf, /in this PDF/);
  const file = brandedReportFile(report, "pdf", { name: "Desk Admin" });
  assert.equal(file.name, "Trade2Smart-Master-report.pdf");
  assert.equal(file.body.length > 800, true);
});

test("Reports hub exposes the Master report menu and download", () => {
  const hub = fs.readFileSync(path.join(root, "src/pages/ReportsHub.tsx"), "utf8");
  const tabBar = fs.readFileSync(path.join(root, "src/components/desk/ReportsBookTabs.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/pages/MasterReport.tsx"), "utf8");
  const reports = fs.readFileSync(path.join(root, "src/pages/Reports.tsx"), "utf8");
  const tabs = fs.readFileSync(path.join(root, "src/lib/bookTabs.ts"), "utf8");
  const side = fs.readFileSync(path.join(root, "src/components/layout/Sidebar.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const index = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  assert.match(hub, /ReportsBookTabs/);
  assert.match(tabBar, /data-master-tab="true"/);
  assert.match(tabBar, /Master report/);
  assert.match(tabBar, /\/master-report/);
  assert.match(tabs, /if \(value === "master"\) return "master"/);
  assert.match(page, /MasterReportPage/);
  assert.match(page, /data-master-report-page="true"/);
  assert.match(page, /data-master-report="true"/);
  assert.match(page, /Custom date/);
  assert.match(page, /MASTER_MONTH_PRESETS/);
  assert.match(page, /data-master-admin="true"/);
  assert.match(page, /Select all users/);
  assert.match(page, /Download \$\{selected\}/);
  assert.match(reports, /data-master-report-menu="true"/);
  assert.match(reports, /navigate\("\/master-report"\)/);
  assert.match(side, /to: "\/master-report", label: "Master report"/);
  assert.match(app, /path="master-report"/);
  assert.match(index, /\/api\/report\/master\/download/);
  assert.match(index, /buildMasterReport/);
});
