import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionRoot } from "./frontFutures.js";
import { sessionKeyIST, aggregateSessionBars } from "./niftyVwap/VwapSignalEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memory = new Map();

export function indexHistoryDir() {
  return process.env.T2S_INDEX_HISTORY_DIR || path.join(__dirname, "data", "index-history");
}

export function resetIndexHistoryCache() {
  memory.clear();
}

export function wipeIndexHistory() {
  resetIndexHistoryCache();
  try {
    fs.rmSync(indexHistoryDir(), { recursive: true, force: true });
  } catch {
    /* missing folder is fine */
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function shiftYmd(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function historySymbol(symbol) {
  const root = optionRoot(symbol);
  if (root === "CRUDEOIL") return "CRUDEOIL";
  if (root === "BANKNIFTY" || root === "FINNIFTY" || root === "SENSEX") return root;
  return root || "NIFTY";
}

export function tfMinutes(tf) {
  const raw = String(tf || "5m");
  if (raw === "1m") return 1;
  if (raw === "15m") return 15;
  if (raw === "1H" || raw === "1h") return 60;
  if (raw === "1D" || raw === "1d" || raw === "day") return 390;
  return 5;
}

export function normalizeTimeframe(tf) {
  const mins = tfMinutes(tf);
  if (mins <= 1) return "1m";
  if (mins <= 5) return "5m";
  if (mins <= 15) return "15m";
  if (mins <= 60) return "1H";
  return "1D";
}

function listYmds(from, to) {
  if (!isYmd(from) || !isYmd(to) || from > to) return [];
  const days = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = shiftYmd(cur, 1);
  }
  return days;
}

function isWeekend(ymd) {
  const weekday = new Date(`${ymd}T12:00:00+05:30`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function tradingYmds(from, to) {
  return listYmds(from, to).filter((ymd) => !isWeekend(ymd));
}

function symbolDir(symbol) {
  return path.join(indexHistoryDir(), historySymbol(symbol));
}

function dayFile(symbol, ymd) {
  return path.join(symbolDir(symbol), `${ymd}.json`);
}

function dayKey(symbol, ymd) {
  return `${historySymbol(symbol)}|${ymd}`;
}

function compactBars(rows = []) {
  return (rows || [])
    .map((bar) => ({
      time: Number(bar.time ?? bar.t),
      open: Number(bar.open ?? bar.o),
      high: Number(bar.high ?? bar.h),
      low: Number(bar.low ?? bar.l),
      close: Number(bar.close ?? bar.c),
      volume: Number(bar.volume ?? bar.v ?? 0),
    }))
    .filter((bar) => Number.isFinite(bar.time) && Number(bar.close) > 0)
    .sort((a, b) => a.time - b.time);
}

export function inferBarTimeframe(candles = []) {
  const rows = compactBars(candles);
  if (rows.length < 2) return "1D";
  const deltas = [];
  for (let i = 1; i < Math.min(rows.length, 80); i += 1) {
    const delta = rows[i].time - rows[i - 1].time;
    if (delta > 0) deltas.push(delta);
  }
  if (!deltas.length) return "1D";
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  if (median <= 90_000) return "1m";
  if (median <= 8 * 60_000) return "5m";
  if (median <= 20 * 60_000) return "15m";
  if (median <= 2 * 60 * 60_000) return "1H";
  return "1D";
}

export function loadIndexDay(symbol, ymd) {
  const key = dayKey(symbol, ymd);
  if (memory.has(key)) return memory.get(key);
  try {
    const row = JSON.parse(fs.readFileSync(dayFile(symbol, ymd), "utf8"));
    if (!row || row.ymd !== ymd) return null;
    memory.set(key, row);
    return row;
  } catch {
    return null;
  }
}

export function writeIndexDay(symbol, ymd, payload) {
  const root = historySymbol(symbol);
  const next = {
    symbol: root,
    ymd,
    tf: normalizeTimeframe(payload.tf || inferBarTimeframe(payload.bars)),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    bars: compactBars(payload.bars),
  };
  fs.mkdirSync(symbolDir(root), { recursive: true });
  fs.writeFileSync(dayFile(root, ymd), `${JSON.stringify(next)}\n`);
  memory.set(dayKey(root, ymd), next);
  return next;
}

export function saveIndexBars(symbol, candles = [], { overwrite = false } = {}) {
  const byDay = new Map();
  for (const bar of compactBars(candles)) {
    const ymd = sessionKeyIST(bar.time);
    if (!isYmd(ymd)) continue;
    if (!byDay.has(ymd)) byDay.set(ymd, []);
    byDay.get(ymd).push(bar);
  }
  const written = [];
  for (const [ymd, bars] of byDay) {
    const incomingTf = inferBarTimeframe(bars);
    const existing = loadIndexDay(symbol, ymd);
    const existingMins = existing ? tfMinutes(existing.tf) : Infinity;
    const incomingMins = tfMinutes(incomingTf);
    const keepExisting = existing?.bars?.length && !overwrite && incomingMins > existingMins;
    if (keepExisting) continue;
    writeIndexDay(symbol, ymd, { tf: incomingTf, bars });
    written.push(ymd);
  }
  return written;
}

export function loadIndexBars(symbol, from, to) {
  const out = [];
  for (const ymd of listYmds(from, to)) {
    const day = loadIndexDay(symbol, ymd);
    if (!day?.bars?.length) continue;
    out.push(...compactBars(day.bars));
  }
  return out.sort((a, b) => a.time - b.time);
}

export function aggregateIndexBars(candles = [], timeframe = "5m") {
  const tf = normalizeTimeframe(timeframe);
  const rows = compactBars(candles);
  if (!rows.length) return [];
  if (tf === "1D") {
    const days = new Map();
    for (const bar of rows) {
      const ymd = sessionKeyIST(bar.time);
      const prev = days.get(ymd);
      if (!prev) {
        days.set(ymd, { ...bar, time: Date.parse(`${ymd}T15:30:00+05:30`) });
      } else {
        prev.high = Math.max(prev.high, bar.high);
        prev.low = Math.min(prev.low, bar.low);
        prev.close = bar.close;
        prev.volume += Number(bar.volume || 0);
      }
    }
    return [...days.values()].sort((a, b) => a.time - b.time);
  }
  if (tf === inferBarTimeframe(rows)) return rows;
  const last = rows[rows.length - 1];
  const now = Number(last.time) + tfMinutes(tf) * 60_000 + 1;
  return aggregateSessionBars(rows, tfMinutes(tf), now);
}

export function storedIndexCoverage(symbol, from, to, timeframe = "5m") {
  const wanted = tfMinutes(timeframe);
  const days = tradingYmds(from, to);
  if (!days.length) return { stored: [], missing: [], fineEnough: true };
  const stored = [];
  const missing = [];
  for (const ymd of days) {
    const day = loadIndexDay(symbol, ymd);
    if (day?.bars?.length && tfMinutes(day.tf) <= wanted) stored.push(ymd);
    else missing.push(ymd);
  }
  return { stored, missing, fineEnough: missing.length === 0 };
}

function chunkRange(from, to, size = 30) {
  const chunks = [];
  let cur = from;
  while (cur <= to) {
    const end = shiftYmd(cur, size - 1);
    chunks.push({ from: cur, to: end < to ? end : to });
    cur = shiftYmd(end, 1);
  }
  return chunks;
}

async function fetchChunked(fetchRange, { symbol, from, to, timeframe }) {
  if (typeof fetchRange !== "function") return [];
  const days = Math.max(1, listYmds(from, to).length);
  const windows = days > 45 ? chunkRange(from, to, 30) : [{ from, to }];
  const out = [];
  for (const window of windows) {
    try {
      const rows = await fetchRange({
        symbol,
        from: window.from,
        to: window.to,
        timeframe,
      });
      out.push(...compactBars(rows));
    } catch {
      /* keep what we have */
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  return compactBars(out);
}

export async function ensureIndexHistory({
  symbol,
  from,
  to,
  timeframe = "5m",
  fetchRange,
  overwrite = false,
} = {}) {
  const root = historySymbol(symbol);
  const tf = normalizeTimeframe(timeframe);
  const coverage = storedIndexCoverage(root, from, to, tf);
  if (!overwrite && coverage.fineEnough) {
    return {
      candles: aggregateIndexBars(loadIndexBars(root, from, to), tf),
      source: "stored",
      reused: true,
      written: [],
      missing: [],
    };
  }
  const fetchFrom = overwrite || !coverage.stored.length ? from : coverage.missing[0] || from;
  const fetched = await fetchChunked(fetchRange, {
    symbol: root,
    from: fetchFrom,
    to,
    timeframe: tf,
  });
  const written = fetched.length ? saveIndexBars(root, fetched, { overwrite }) : [];
  const candles = aggregateIndexBars(loadIndexBars(root, from, to), tf);
  const after = storedIndexCoverage(root, from, to, tf);
  return {
    candles,
    source: candles.length ? (written.length ? "dhan" : "stored") : "",
    reused: !written.length && candles.length > 0,
    written,
    missing: after.missing,
  };
}

export function recordLiveIndexHistory(symbol, candles = []) {
  if (!Array.isArray(candles) || !candles.length) return [];
  return saveIndexBars(symbol, candles, { overwrite: false });
}
