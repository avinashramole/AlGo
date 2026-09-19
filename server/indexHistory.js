import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionRoot } from "./frontFutures.js";
import { sessionKeyIST, aggregateSessionBars } from "./niftyVwap/VwapSignalEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifests = new Map();

function yieldLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

export function indexHistoryDir() {
  return process.env.T2S_INDEX_HISTORY_DIR || path.join(__dirname, "data", "index-history");
}

export function resetIndexHistoryCache() {
  manifests.clear();
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

function manifestFile(symbol) {
  return path.join(symbolDir(symbol), "manifest.json");
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
  try {
    const row = JSON.parse(fs.readFileSync(dayFile(symbol, ymd), "utf8"));
    if (!row || row.ymd !== ymd) return null;
    return row;
  } catch {
    return null;
  }
}

function saveManifest(symbol, row) {
  const root = historySymbol(symbol);
  manifests.set(root, row);
  try {
    fs.mkdirSync(symbolDir(root), { recursive: true });
    fs.writeFileSync(manifestFile(root), `${JSON.stringify(row)}\n`);
  } catch {
    /* next backtest rebuilds */
  }
}

function rememberDay(symbol, ymd, tf, n) {
  const root = historySymbol(symbol);
  const row = manifests.get(root) || { days: {} };
  row.days = row.days || {};
  row.days[ymd] = { tf: normalizeTimeframe(tf), n: Number(n) || 0 };
  saveManifest(root, row);
}

async function ensureManifest(symbol) {
  const root = historySymbol(symbol);
  if (manifests.has(root)) return manifests.get(root);
  try {
    const row = JSON.parse(fs.readFileSync(manifestFile(root), "utf8"));
    if (row && row.days && typeof row.days === "object") {
      manifests.set(root, row);
      return row;
    }
  } catch {
    /* rebuild from files */
  }
  const days = {};
  let names = [];
  try {
    names = fs.readdirSync(symbolDir(root));
  } catch {
    const empty = { days: {} };
    manifests.set(root, empty);
    return empty;
  }
  let n = 0;
  for (const name of names) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const ymd = name.slice(0, 10);
    const day = loadIndexDay(root, ymd);
    if (!day?.bars?.length) continue;
    days[ymd] = { tf: normalizeTimeframe(day.tf || inferBarTimeframe(day.bars)), n: day.bars.length };
    n += 1;
    if (n % 15 === 0) await yieldLoop();
  }
  const row = { days };
  saveManifest(root, row);
  return row;
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
  rememberDay(root, ymd, next.tf, next.bars.length);
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

export async function loadIndexBars(symbol, from, to) {
  const out = [];
  let n = 0;
  for (const ymd of listYmds(from, to)) {
    const day = loadIndexDay(symbol, ymd);
    if (!day?.bars?.length) continue;
    out.push(...compactBars(day.bars));
    n += 1;
    if (n % 20 === 0) await yieldLoop();
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

export async function storedIndexCoverage(symbol, from, to, timeframe = "5m") {
  const wanted = tfMinutes(timeframe);
  const days = tradingYmds(from, to);
  if (!days.length) return { stored: [], missing: [], fineEnough: true };
  const man = await ensureManifest(symbol);
  const stored = [];
  const missing = [];
  for (const ymd of days) {
    const meta = man.days?.[ymd];
    if (meta && Number(meta.n) > 0 && tfMinutes(meta.tf) <= wanted) stored.push(ymd);
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

async function fetchWindow(fetchRange, { symbol, from, to, timeframe }) {
  try {
    return compactBars(
      await fetchRange({
        symbol,
        from,
        to,
        timeframe,
      }),
    );
  } catch {
    return [];
  }
}

async function fetchAndStoreChunks(fetchRange, { symbol, from, to, timeframe, overwrite }) {
  if (typeof fetchRange !== "function") return [];
  const days = Math.max(1, listYmds(from, to).length);
  const windows = days > 45 ? chunkRange(from, to, 30) : [{ from, to }];
  const written = [];
  const parallel = 3;
  for (let i = 0; i < windows.length; i += parallel) {
    const batch = windows.slice(i, i + parallel);
    const packs = await Promise.all(
      batch.map((window) =>
        fetchWindow(fetchRange, {
          symbol,
          from: window.from,
          to: window.to,
          timeframe,
        }),
      ),
    );
    for (const rows of packs) {
      if (rows.length) written.push(...saveIndexBars(symbol, rows, { overwrite }));
    }
    await yieldLoop();
  }
  return [...new Set(written)];
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
  const coverage = await storedIndexCoverage(root, from, to, tf);
  if (!overwrite && coverage.fineEnough) {
    return {
      candles: aggregateIndexBars(await loadIndexBars(root, from, to), tf),
      source: "stored",
      reused: true,
      written: [],
      missing: [],
    };
  }
  const fetchFrom = overwrite || !coverage.stored.length ? from : coverage.missing[0] || from;
  const written = await fetchAndStoreChunks(fetchRange, {
    symbol: root,
    from: fetchFrom,
    to,
    timeframe: tf,
    overwrite,
  });
  const candles = aggregateIndexBars(await loadIndexBars(root, from, to), tf);
  const after = await storedIndexCoverage(root, from, to, tf);
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
