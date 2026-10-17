import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomicWrite.js";
import { istDayKey } from "./desk.js";
import { tradeLogRowMs } from "./istClock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_FILE = process.env.T2S_TRADE_ARCHIVE_FILE || path.join(__dirname, "data", "trade-archive.json");
export const ADMIN_ARCHIVE_ID = "admin";
const KEEP_MONTHS = 18;

let store = readStore();

function readStore() {
  try {
    if (!fs.existsSync(ARCHIVE_FILE)) return {};
    const row = JSON.parse(fs.readFileSync(ARCHIVE_FILE, "utf8"));
    return row && typeof row === "object" && !Array.isArray(row) ? row : {};
  } catch {
    return {};
  }
}

function persist() {
  writeFileAtomic(ARCHIVE_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function tradeId(row = {}) {
  return String(row.id || row.key || "").trim();
}

export function normalizeArchivedTrade(row = {}) {
  const id = tradeId(row);
  const closedAt = String(row.closedAt || row.exitAt || row.createdAt || "");
  return {
    id: id || `t${closedAt || Date.now()}`,
    symbol: String(row.symbol || ""),
    side: String(row.side || row.type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
    option: String(row.option || ""),
    strike: Number(row.strike || 0) || 0,
    qty: Number(row.qty || 0) || 0,
    entry: Number(row.entry || row.buyPrice || 0) || 0,
    exit: Number(row.exit || row.sellPrice || 0) || 0,
    pnl: Number(row.pnl || 0) || 0,
    margin: Number(row.margin || 0) || 0,
    rom: Number(row.rom || 0) || 0,
    strategy: String(row.strategy || ""),
    brokerId: String(row.brokerId || ""),
    product: String(row.product || ""),
    openedAt: String(row.openedAt || row.entryAt || ""),
    closedAt,
    entryAt: String(row.entryAt || row.openedAt || ""),
    exitAt: String(row.exitAt || row.closedAt || ""),
  };
}

function keepRecent(row, cutoffMs) {
  const ms = tradeLogRowMs(row);
  if (!ms) return true;
  return ms >= cutoffMs;
}

export function archiveTrades(userId, rows = []) {
  const id = String(userId || "").trim();
  if (!id || !Array.isArray(rows) || !rows.length) return 0;
  const bag = store[id] && typeof store[id] === "object" ? store[id] : { trades: [] };
  const byId = new Map((Array.isArray(bag.trades) ? bag.trades : []).map((row) => [tradeId(row), row]));
  let added = 0;
  for (const row of rows) {
    if (!row) continue;
    const next = normalizeArchivedTrade(row);
    if (!next.id) continue;
    const prev = byId.get(next.id);
    if (!prev) added += 1;
    byId.set(next.id, next);
  }
  const cutoff = Date.now() - KEEP_MONTHS * 31 * 24 * 60 * 60 * 1000;
  bag.trades = [...byId.values()].filter((row) => keepRecent(row, cutoff));
  store[id] = bag;
  persist();
  return added;
}

export function archivedTrades(userId, { from = "", to = "" } = {}) {
  const id = String(userId || "").trim();
  const bag = store[id] && typeof store[id] === "object" ? store[id] : { trades: [] };
  const rows = Array.isArray(bag.trades) ? bag.trades : [];
  return rows.filter((row) => tradeInWindow(row, from, to));
}

export function tradeInWindow(row, from = "", to = "") {
  if (!row) return false;
  const day = istDayKey(row.closedAt || row.exitAt || row.createdAt || "");
  if (from && day && day < String(from).slice(0, 10)) return false;
  if (to && day && day > String(to).slice(0, 10)) return false;
  return true;
}

export function mergeLiveAndArchived(userId, liveRows = [], window = {}) {
  archiveTrades(userId, liveRows);
  const from = String(window.from || "").slice(0, 10);
  const to = String(window.to || "").slice(0, 10);
  const byId = new Map();
  for (const row of archivedTrades(userId, { from, to })) {
    byId.set(tradeId(row) || `${row.symbol}-${row.closedAt}`, row);
  }
  for (const row of liveRows || []) {
    if (!tradeInWindow(row, from, to)) continue;
    const next = normalizeArchivedTrade(row);
    byId.set(next.id, next);
  }
  return [...byId.values()].sort((a, b) => String(b.closedAt || "").localeCompare(String(a.closedAt || "")));
}
