import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionKeyIST } from "./niftyVwap/VwapSignalEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIFTY_ID = 13;
export const ROLLING_MAX_DAYS = 366;
export const ROLLING_CHUNK_DAYS = 30;
export const ROLLING_1M_CHUNK_DAYS = 5;
export const ROLLING_WINGS = 10;
export const ROLLING_BACKTEST_DEADLINE_MS = 480_000;
export const NSE_OPTION_INDEXES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];

const ROLLING_CONTRACTS = {
  NIFTY: { symbol: "NIFTY", securityId: 13, exchangeSegment: "NSE_FNO", instrument: "OPTIDX" },
  BANKNIFTY: { symbol: "BANKNIFTY", securityId: 25, exchangeSegment: "NSE_FNO", instrument: "OPTIDX" },
  FINNIFTY: { symbol: "FINNIFTY", securityId: 27, exchangeSegment: "NSE_FNO", instrument: "OPTIDX" },
  MIDCPNIFTY: { symbol: "MIDCPNIFTY", securityId: 442, exchangeSegment: "NSE_FNO", instrument: "OPTIDX" },
  SENSEX: { symbol: "SENSEX", securityId: 51, exchangeSegment: "BSE_FNO", instrument: "OPTIDX" },
};

export function rollingContract(symbol = "NIFTY") {
  const root = String(symbol || "NIFTY").toUpperCase();
  return ROLLING_CONTRACTS[root] || null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function rollingInterval(value) {
  const n = Number(value);
  return n === 1 || n === 5 ? n : 15;
}

export function rollingOptionDir(interval = 15) {
  const root = process.env.T2S_NIFTY_ROLLING_DIR || path.join(__dirname, "data", "nifty-rolling-options");
  const tf = rollingInterval(interval);
  return tf === 15 ? root : `${root}-${tf}m`;
}

function symbolDir(symbol = "NIFTY", interval = 15) {
  return path.join(rollingOptionDir(interval), String(symbol || "NIFTY").toUpperCase());
}

function dayFile(symbol, ymd, interval = 15) {
  return path.join(symbolDir(symbol, interval), `${ymd}.json`);
}

function cacheKey(symbol, ymd, interval = 15) {
  return `${rollingInterval(interval)}|${symbol}|${ymd}`;
}

const memory = new Map();

export function resetRollingOptionCache() {
  memory.clear();
}

export function wipeRollingOptions(interval) {
  resetRollingOptionCache();
  const dirs = interval == null ? [15, 1, 5].map((tf) => rollingOptionDir(tf)) : [rollingOptionDir(interval)];
  for (const dir of [...new Set(dirs)]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* missing is fine */
    }
  }
}

export function shiftYmd(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function wingLabels(wings = ROLLING_WINGS) {
  const out = ["ATM"];
  const n = Math.max(1, Math.min(10, Number(wings) || ROLLING_WINGS));
  for (let i = 1; i <= n; i += 1) {
    out.push(`ATM+${i}`, `ATM-${i}`);
  }
  return out;
}

export function chunkDateRange(from, to, size = ROLLING_CHUNK_DAYS) {
  if (!isYmd(from) || !isYmd(to) || from > to) return [];
  const chunks = [];
  let cursor = from;
  while (cursor <= to) {
    const end = shiftYmd(cursor, size - 1);
    const last = end < to ? end : to;
    chunks.push({ from: cursor, to: last, toExclusive: shiftYmd(last, 1) });
    cursor = shiftYmd(last, 1);
  }
  return chunks;
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

export function hasRollingDay(symbol, ymd, interval = 15) {
  if (memory.has(cacheKey(symbol, ymd, interval))) return true;
  try {
    return fs.existsSync(dayFile(symbol, ymd, interval));
  } catch {
    return false;
  }
}

export function loadRollingDay(symbol, ymd, interval = 15) {
  const key = cacheKey(symbol, ymd, interval);
  if (memory.has(key)) return memory.get(key);
  try {
    const row = JSON.parse(fs.readFileSync(dayFile(symbol, ymd, interval), "utf8"));
    if (!row || row.ymd !== ymd) return null;
    memory.set(key, row);
    return row;
  } catch {
    return null;
  }
}

export function writeRollingDay(symbol, ymd, payload, interval = 15) {
  const tf = rollingInterval(interval);
  const next = {
    symbol: String(symbol || "NIFTY").toUpperCase(),
    ymd,
    interval: tf,
    source: payload.source || "dhan-rolling",
    empty: Boolean(payload.empty),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    weekly: payload.weekly || { slots: [] },
    monthly: payload.monthly || { slots: [] },
  };
  fs.mkdirSync(symbolDir(next.symbol, tf), { recursive: true });
  fs.writeFileSync(dayFile(next.symbol, ymd, tf), `${JSON.stringify(next)}\n`);
  memory.set(cacheKey(next.symbol, ymd, tf), next);
  return next;
}

export function isWeekendYmd(ymd) {
  if (!isYmd(ymd)) return false;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(
    new Date(`${ymd}T12:00:00+05:30`),
  );
  return weekday === "Sat" || weekday === "Sun";
}

export function rollingDayStatus(symbol, ymd, interval = 15) {
  const day = loadRollingDay(symbol, ymd, interval);
  if (!day) return "missing";
  if (day.empty) return "empty";
  const weekly = day.weekly?.slots?.length || 0;
  const monthly = day.monthly?.slots?.length || 0;
  if (weekly && monthly) return "complete";
  return "partial";
}

export function needsRollingFetch(symbol, ymd, interval = 15) {
  if (isWeekendYmd(ymd)) return false;
  const status = rollingDayStatus(symbol, ymd, interval);
  return status === "missing" || status === "partial" || status === "empty";
}

export function dropEmptyRollingDays(symbol = "NIFTY", interval = 15) {
  const root = String(symbol || "NIFTY").toUpperCase();
  const tf = rollingInterval(interval);
  let dropped = 0;
  let names = [];
  try {
    names = fs.readdirSync(symbolDir(root, tf)).filter((name) => name.endsWith(".json"));
  } catch {
    names = [];
  }
  for (const name of names) {
    const ymd = name.replace(/\.json$/, "");
    if (rollingDayStatus(root, ymd, tf) !== "empty") continue;
    try {
      fs.rmSync(dayFile(root, ymd, tf), { force: true });
    } catch {
      /* missing is fine */
    }
    memory.delete(cacheKey(root, ymd, tf));
    dropped += 1;
  }
  return dropped;
}

export function preloadRollingDays(symbol, ymds = [], interval = 15) {
  let loaded = 0;
  for (const ymd of ymds) {
    if (loadRollingDay(symbol, ymd, interval)) loaded += 1;
  }
  return loaded;
}

export function rollingCoverage(symbol, from, to, interval = 15) {
  const weekdays = listYmds(from, to).filter((ymd) => !isWeekendYmd(ymd));
  if (!weekdays.length) return "synth";
  let stored = 0;
  for (const ymd of weekdays) {
    const status = rollingDayStatus(symbol, ymd, interval);
    if (status === "complete") stored += 1;
  }
  if (!stored) return "synth";
  if (stored >= weekdays.length) return "stored";
  return "mixed";
}

export function completeRollingDays(symbol, from, to, interval = 15) {
  return listYmds(from, to).filter((ymd) => !isWeekendYmd(ymd) && rollingDayStatus(symbol, ymd, interval) === "complete").length;
}

export function parseRollingPayload(payload, option = "CE") {
  const side = option === "PE" || option === "PUT" ? "pe" : "ce";
  const alt = side === "pe" ? ["pe", "PE", "put", "PUT"] : ["ce", "CE", "call", "CALL"];
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  let pack = null;
  for (const key of alt) {
    if (data?.[key] && typeof data[key] === "object") {
      pack = data[key];
      break;
    }
  }
  pack = pack || payload?.[side] || payload?.data || payload;
  if (!pack || typeof pack !== "object") return [];
  const times = Array.isArray(pack.timestamp)
    ? pack.timestamp
    : Array.isArray(pack.timestamps)
      ? pack.timestamps
      : Array.isArray(pack.time)
        ? pack.time
        : [];
  const closes = Array.isArray(pack.close) ? pack.close : Array.isArray(pack.ltp) ? pack.ltp : [];
  const highs = Array.isArray(pack.high) ? pack.high : [];
  const lows = Array.isArray(pack.low) ? pack.low : [];
  const strikes = Array.isArray(pack.strike)
    ? pack.strike
    : Array.isArray(pack.strikePrice)
      ? pack.strikePrice
      : [];
  const spots = Array.isArray(pack.spot) ? pack.spot : Array.isArray(pack.spotPrice) ? pack.spotPrice : [];
  const bars = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = Number(times[i]) > 1e12 ? Number(times[i]) : Number(times[i]) * 1000;
    const c = Number(closes[i]);
    const strike = Number(strikes[i]);
    if (!(t > 0) || !(c > 0) || !(strike > 0)) continue;
    bars.push({
      t,
      c,
      h: Number(highs[i] || c),
      l: Number(lows[i] || c),
      strike,
      spot: Number(spots[i] || 0),
      option: option === "PE" || option === "PUT" ? "PE" : "CE",
    });
  }
  return bars;
}

function minutesIst(time) {
  const wall = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  })
    .formatToParts(new Date(time))
    .filter((part) => part.type !== "literal");
  const hour = Number(wall.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(wall.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function keepSessionBar(time) {
  const minutes = minutesIst(time);
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

function nearestSlot(slots, time) {
  let best = null;
  for (const slot of slots || []) {
    const t = Number(slot.t);
    if (!(t > 0)) continue;
    if (t <= Number(time) + 90_000 && (!best || t >= Number(best.t))) best = slot;
  }
  return best || (slots || [])[0] || null;
}

export function rollingChainAt({ symbol = "NIFTY", ymd, time, kind = "weekly" } = {}) {
  const day = loadRollingDay(symbol, ymd);
  if (!day) return null;
  const pack = kind === "monthly" ? day.monthly : day.weekly;
  const slot = nearestSlot(pack?.slots, time);
  if (!slot?.rows?.length) return null;
  return slot.rows
    .map((row) => ({
      strike: Number(row.s),
      callLtp: Number(row.ce || 0),
      putLtp: Number(row.pe || 0),
      callHigh: Number(row.ceH || row.ce || 0),
      callLow: Number(row.ceL || row.ce || 0),
      putHigh: Number(row.peH || row.pe || 0),
      putLow: Number(row.peL || row.pe || 0),
    }))
    .filter((row) => row.strike > 0 && (row.callLtp > 0 || row.putLtp > 0));
}

export function rollingPremiumAt({ symbol = "NIFTY", ymd, time, strike, option, kind = "weekly" } = {}) {
  const rows = rollingChainAt({ symbol, ymd, time, kind });
  if (!rows) return null;
  const row = rows.find((item) => Number(item.strike) === Number(strike));
  if (!row) return null;
  const px = option === "PE" ? row.putLtp : row.callLtp;
  return px > 0 ? px : null;
}

export function rollingPath({ symbol = "NIFTY", ymd, strike, option, kind = "weekly" } = {}) {
  const day = loadRollingDay(symbol, ymd);
  if (!day) return [];
  const pack = kind === "monthly" ? day.monthly : day.weekly;
  const out = [];
  for (const slot of pack?.slots || []) {
    const row = (slot.rows || []).find((item) => Number(item.s) === Number(strike));
    if (!row) continue;
    const close = option === "PE" ? Number(row.pe || 0) : Number(row.ce || 0);
    const low = option === "PE" ? Number(row.peL || row.pe || 0) : Number(row.ceL || row.ce || 0);
    if (!(close > 0)) continue;
    out.push({ t: Number(slot.t), close, low: low > 0 ? low : close });
  }
  return out;
}

function mergeBarsIntoDays(series) {
  const days = new Map();
  for (const bar of series) {
    if (!keepSessionBar(bar.t)) continue;
    const ymd = sessionKeyIST(bar.t);
    if (!isYmd(ymd)) continue;
    if (!days.has(ymd)) days.set(ymd, new Map());
    const slots = days.get(ymd);
    const key = String(bar.t);
    const slot = slots.get(key) || { t: bar.t, spot: bar.spot || 0, rows: new Map() };
    const row = slot.rows.get(bar.strike) || { s: bar.strike };
    if (bar.option === "PE") {
      row.pe = bar.c;
      row.peH = bar.h;
      row.peL = bar.l;
    } else {
      row.ce = bar.c;
      row.ceH = bar.h;
      row.ceL = bar.l;
    }
    if (bar.spot > 0) slot.spot = bar.spot;
    slot.rows.set(bar.strike, row);
    slots.set(key, slot);
  }
  const out = new Map();
  for (const [ymd, slots] of days) {
    out.set(ymd, {
      slots: [...slots.values()]
        .sort((a, b) => a.t - b.t)
        .map((slot) => ({
          t: slot.t,
          spot: slot.spot,
          rows: [...slot.rows.values()].filter((row) => row.s > 0 && (row.ce > 0 || row.pe > 0)),
        }))
        .filter((slot) => slot.rows.length),
    });
  }
  return out;
}

async function sleep(ms) {
  if (!(ms > 0)) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function persistFetchedDays(root, weeklyBars, monthlyBars, overwrite = false, interval = 15) {
  const weeklyDays = mergeBarsIntoDays(weeklyBars);
  const monthlyDays = mergeBarsIntoDays(monthlyBars);
  const ymds = new Set([...weeklyDays.keys(), ...monthlyDays.keys()]);
  const wrote = [];
  for (const ymd of ymds) {
    const existing = loadRollingDay(root, ymd, interval);
    if (!overwrite && existing && rollingDayStatus(root, ymd, interval) === "complete") continue;
    const weekly = weeklyDays.get(ymd)?.slots?.length ? weeklyDays.get(ymd) : existing?.weekly || { slots: [] };
    const monthly = monthlyDays.get(ymd)?.slots?.length ? monthlyDays.get(ymd) : existing?.monthly || { slots: [] };
    if (!weekly.slots.length && !monthly.slots.length) continue;
    writeRollingDay(root, ymd, { weekly, monthly, empty: false, source: "dhan-rolling" }, interval);
    wrote.push(ymd);
  }
  return wrote;
}

export async function downloadRollingOptionRange({
  symbol = "NIFTY",
  from,
  to,
  overwrite = false,
  fetchRolling,
  delayMs = 40,
  wings = ROLLING_WINGS,
  interval = 15,
  maxDays = ROLLING_MAX_DAYS,
  deadlineMs = 150_000,
  securityId,
  exchangeSegment,
  instrument,
} = {}) {
  const root = String(symbol || "NIFTY").toUpperCase();
  const contract = rollingContract(root);
  const id = Number(securityId || contract?.securityId || NIFTY_ID);
  const segment = String(exchangeSegment || contract?.exchangeSegment || "NSE_FNO");
  const inst = String(instrument || contract?.instrument || "OPTIDX");
  if (!isYmd(from) || !isYmd(to) || typeof fetchRolling !== "function") {
    return { symbol: root, from, to, days: 0, calls: 0, skipped: 0, truncated: false, reused: false, source: "none" };
  }
  const tf = rollingInterval(interval);
  const chunkDays = tf <= 5 ? ROLLING_1M_CHUNK_DAYS : ROLLING_CHUNK_DAYS;
  const all = listYmds(from, to);
  const wanted = all.length > maxDays ? all.slice(-maxDays) : all;
  const start = wanted[0];
  const end = wanted[wanted.length - 1];
  const missing = overwrite ? wanted.filter((ymd) => !isWeekendYmd(ymd)) : wanted.filter((ymd) => needsRollingFetch(root, ymd, tf));
  const reusedDays = wanted.filter((ymd) => !isWeekendYmd(ymd) && !needsRollingFetch(root, ymd, tf)).length;
  if (!missing.length) {
    return {
      symbol: root,
      from: start,
      to: end,
      days: 0,
      calls: 0,
      skipped: 0,
      truncated: false,
      reused: true,
      reusedDays,
      source: "stored",
    };
  }
  const started = Date.now();
  let calls = 0;
  let skipped = 0;
  let stubs = 0;
  let truncated = false;
  const wrote = new Set();
  const labels = wingLabels(wings);
  let lastError = "";
  for (const chunk of chunkDateRange(start, end, chunkDays)) {
    const need = listYmds(chunk.from, chunk.to).filter((ymd) => (overwrite ? !isWeekendYmd(ymd) : needsRollingFetch(root, ymd, tf)));
    if (!need.length) continue;
    if (Date.now() - started > deadlineMs) {
      truncated = true;
      break;
    }
    const weeklyBars = [];
    const monthlyBars = [];
    let chunkDone = true;
    let okCalls = 0;
    expiryLoop: for (const expiryFlag of ["WEEK", "MONTH"]) {
      for (const option of ["CE", "PE"]) {
        for (const strike of labels) {
          if (Date.now() - started > deadlineMs) {
            truncated = true;
            chunkDone = false;
            break expiryLoop;
          }
          let payload = null;
          try {
            payload = await fetchRolling({
              expiryFlag,
              expiryCode: 1,
              strike,
              option,
              from: chunk.from,
              to: chunk.toExclusive,
              interval: tf,
              securityId: id,
              exchangeSegment: segment,
              instrument: inst,
            });
          } catch (error) {
            skipped += 1;
            lastError = error?.message || String(error || "rolling-option-failed");
          }
          calls += 1;
          if (payload) okCalls += 1;
          const bars = parseRollingPayload(payload, option);
          if (expiryFlag === "MONTH") monthlyBars.push(...bars);
          else weeklyBars.push(...bars);
          if (delayMs > 0) await sleep(delayMs);
        }
      }
      for (const ymd of persistFetchedDays(root, weeklyBars, monthlyBars, overwrite, tf)) wrote.add(ymd);
    }
    if (chunkDone && okCalls > 0) {
      for (const ymd of need) {
        if (!needsRollingFetch(root, ymd, tf)) continue;
        if (loadRollingDay(root, ymd, tf)) continue;
        writeRollingDay(
          root,
          ymd,
          {
            empty: true,
            weekly: { slots: [] },
            monthly: { slots: [] },
            source: "dhan-rolling-empty",
          },
          tf,
        );
        stubs += 1;
      }
    }
  }
  return {
    symbol: root,
    from: start,
    to: end,
    days: wrote.size,
    calls,
    skipped,
    stubs,
    reusedDays,
    truncated,
    reused: calls === 0,
    source: wrote.size ? "dhan-rolling" : reusedDays ? "stored" : "none",
    securityId: id,
    interval: tf,
    lastError,
  };
}
