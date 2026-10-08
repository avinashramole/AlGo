import { isBacktestBusy } from "./backtestJob.js";
import {
  ONE_MINUTE_CHUNK_DAYS,
  ONE_MINUTE_HISTORY_SYMBOLS,
  ensureIndexHistory,
  historySymbol,
  oneMinuteCoverage,
  shiftYmd,
} from "./indexHistory.js";

export function ymdIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value || "2026"}-${
    parts.find((part) => part.type === "month")?.value || "01"
  }-${parts.find((part) => part.type === "day")?.value || "01"}`;
}

export function oneMinuteSyncWindow({ years = 1, from, to } = {}) {
  const end = isYmd(to) ? String(to).slice(0, 10) : ymdIST();
  const span = Math.max(1, Math.min(10, Number(years) || 1));
  const start = isYmd(from) ? String(from).slice(0, 10) : shiftYmd(end, -(span * 365 - 1));
  return { from: start <= end ? start : end, to: end, years: span };
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function emptyJob() {
  return {
    running: false,
    paused: false,
    symbol: "",
    from: "",
    to: "",
    years: 1,
    written: 0,
    calls: 0,
    symbolsDone: 0,
    error: "",
    startedAt: "",
    finishedAt: "",
  };
}

const job = emptyJob();
let inflight = null;

export function oneMinuteSyncJob() {
  return { ...job };
}

export async function oneMinuteSyncStatus({ years = 1, from, to, symbols } = {}) {
  const window = oneMinuteSyncWindow({ years, from, to });
  const roots = (Array.isArray(symbols) && symbols.length ? symbols : ONE_MINUTE_HISTORY_SYMBOLS).map((row) =>
    historySymbol(row),
  );
  const rows = [];
  for (const symbol of roots) {
    rows.push(await oneMinuteCoverage(symbol, window.from, window.to));
  }
  return {
    ...window,
    chunkDays: ONE_MINUTE_CHUNK_DAYS,
    job: oneMinuteSyncJob(),
    symbols: rows,
    storedDays: rows.reduce((sum, row) => sum + Number(row.stored || 0), 0),
    missingDays: rows.reduce((sum, row) => sum + Number(row.missing || 0), 0),
    fineEnough: rows.every((row) => row.fineEnough),
  };
}

export async function syncOneMinuteIndexHistory({
  years = 1,
  from,
  to,
  symbols,
  fetchRange,
  pauseIf = isBacktestBusy,
} = {}) {
  const window = oneMinuteSyncWindow({ years, from, to });
  const roots = (Array.isArray(symbols) && symbols.length ? symbols : ONE_MINUTE_HISTORY_SYMBOLS).map((row) =>
    historySymbol(row),
  );
  Object.assign(job, emptyJob(), {
    running: true,
    from: window.from,
    to: window.to,
    years: window.years,
    startedAt: new Date().toISOString(),
  });
  try {
    for (const symbol of roots) {
      if (typeof pauseIf === "function" && pauseIf()) {
        job.paused = true;
        job.error = "paused-backtest-busy";
        break;
      }
      job.symbol = symbol;
      const packed = await ensureIndexHistory({
        symbol,
        from: window.from,
        to: window.to,
        timeframe: "1m",
        overwrite: false,
        fetchRange:
          typeof fetchRange === "function"
            ? async (args) => {
                job.calls += 1;
                return fetchRange({ ...args, timeframe: "1m" });
              }
            : undefined,
      });
      job.written += (packed.written || []).length;
      job.symbolsDone += 1;
    }
  } catch (error) {
    job.error = error?.message || String(error || "1m-sync-failed");
  } finally {
    job.running = false;
    job.finishedAt = new Date().toISOString();
    inflight = null;
  }
  return oneMinuteSyncStatus({ years: window.years, from: window.from, to: window.to, symbols: roots });
}

export function startOneMinuteIndexSync(opts = {}) {
  if (job.running && inflight) return oneMinuteSyncJob();
  inflight = syncOneMinuteIndexHistory(opts).catch((error) => {
    job.running = false;
    job.error = error?.message || String(error || "1m-sync-failed");
    job.finishedAt = new Date().toISOString();
    inflight = null;
  });
  return oneMinuteSyncJob();
}
