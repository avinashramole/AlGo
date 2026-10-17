import { listPublicUsers } from "./auth.js";
import { deskToProposalReport } from "./backtestReport.js";
import { listClients } from "./clients.js";
import { buildReport } from "./desk.js";
import { ADMIN_ARCHIVE_ID, mergeLiveAndArchived } from "./tradeArchive.js";
import { peekClientBook } from "./memberDesk.js";
import { snapshot } from "./market.js";

export const MASTER_MONTH_PRESETS = [1, 3, 6, 12];

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function ymdIst(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftYmdMonths(months, date = new Date()) {
  const n = Math.max(1, Math.min(12, Math.round(Number(months) || 1)));
  const next = new Date(date);
  next.setMonth(next.getMonth() - n);
  return ymdIst(next);
}

export function clampMasterMonths(value) {
  const n = Math.round(Number(value));
  if (MASTER_MONTH_PRESETS.includes(n)) return n;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(12, n));
}

export function resolveMasterWindow({ range, months, from, to } = {}, now = new Date()) {
  const today = ymdIst(now);
  const kind = String(range || "").toLowerCase() === "custom" ? "custom" : "months";
  if (kind === "custom") {
    const start = String(from || "").slice(0, 10) || today;
    const end = String(to || "").slice(0, 10) || today;
    return start <= end ? { range: "custom", from: start, to: end, months: 0 } : { range: "custom", from: end, to: start, months: 0 };
  }
  const span = clampMasterMonths(months);
  return { range: "months", months: span, from: shiftYmdMonths(span, now), to: today };
}

export function listMasterReportPeople(users = listPublicUsers()) {
  const admin = (users || []).find((row) => row?.role === "admin") || { id: ADMIN_ARCHIVE_ID, name: "Admin", role: "admin" };
  const clients = listClients(users);
  return {
    admin: {
      id: ADMIN_ARCHIVE_ID,
      name: admin.name || "Admin",
      email: admin.email || "",
      mobile: admin.mobile || "",
      role: "admin",
    },
    users: clients.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email || "",
      mobile: row.mobile || "",
      role: "user",
    })),
  };
}

function liveClosedTrades(userId) {
  if (String(userId) === ADMIN_ARCHIVE_ID) {
    try {
      const snap = snapshot() || {};
      return Array.isArray(snap.closedTrades) ? snap.closedTrades : snap.report?.tradeBook || [];
    } catch {
      return [];
    }
  }
  const book = peekClientBook(userId);
  return Array.isArray(book?.closedTrades) ? book.closedTrades : [];
}

function sectionReport(person, trades, window) {
  const desk = buildReport({ closedTrades: trades, positions: [], orders: [] });
  return deskToProposalReport(desk, {
    title: person.role === "admin" ? "Admin desk" : person.name || "User",
    audience: "member",
    member: { name: person.name, email: person.email, mobile: person.mobile },
    from: window.from,
    to: window.to,
    months: window.months,
    range: window.range === "custom" ? `${window.from} to ${window.to}` : `last ${window.months} month(s)`,
  });
}

export function buildMasterReport({ includeAdmin = true, userIds = [], range, months, from, to } = {}) {
  const window = resolveMasterWindow({ range, months, from, to });
  const people = listMasterReportPeople();
  const wanted = [];
  if (includeAdmin !== false) wanted.push(people.admin);
  const allow = new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  for (const row of people.users) {
    if (allow.has(row.id)) wanted.push(row);
  }
  if (!wanted.length) {
    const error = new Error("Select admin or at least one user.");
    error.status = 400;
    throw error;
  }
  const sections = wanted.map((person) => {
    const live = liveClosedTrades(person.id);
    const trades = mergeLiveAndArchived(person.id, live, window);
    return sectionReport(person, trades, window);
  });
  const pnl = sections.reduce((sum, row) => sum + Number(row.summary?.pnl || 0), 0);
  const trades = sections.reduce((sum, row) => sum + Number(row.summary?.trades || 0), 0);
  const wins = sections.reduce((sum, row) => sum + Number(row.summary?.wins || 0), 0);
  const losses = sections.reduce((sum, row) => sum + Number(row.summary?.losses || 0), 0);
  return {
    audience: "master",
    member: { name: "Master report", email: "", mobile: "" },
    strategy: {
      name: "Master report",
      product: "T2S",
      symbol: "ALL",
      kind: "desk",
      summary: "Trade 2 Smart master report · admin and selected users in one PDF",
    },
    summary: {
      from: window.from,
      to: window.to,
      months: window.months,
      range: window.range === "custom" ? `${window.from} to ${window.to}` : `last ${window.months} month(s)`,
      holdStyle: "live",
      timeframe: "1d",
      pnl,
      trades,
      wins,
      losses,
      winRate: trades ? Math.round((wins / trades) * 100) : 0,
      maxDrawdown: 0,
      avgProfit: trades ? pnl / trades : 0,
      avgWin: 0,
      avgLoss: 0,
      returnDd: 0,
      rewardRisk: 0,
      expectancy: 0,
      requiredMargin: 0,
      avgMargin: 0,
      rom: 0,
      accounts: sections.length,
    },
    trades: sections.flatMap((row) => row.trades || []),
    legs: sections.flatMap((row) => row.trades || []),
    sections,
    generatedAt: new Date().toISOString(),
  };
}
