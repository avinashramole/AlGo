import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionKeyIST } from "./niftyVwap/VwapSignalEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIFTY_ID = 13;
export const ROLLING_MAX_DAYS = 366;
export const ROLLING_CHUNK_DAYS = 30;
export const ROLLING_WINGS = 10;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function isYmd(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function rollingOptionDir() {
  return process.env.T2S_NIFTY_ROLLING_DIR || path.join(__dirname, "data", "nifty-rolling-options");
}

function symbolDir(symbol = "NIFTY") {
  return path.join(rollingOptionDir(), String(symbol || "NIFTY").toUpperCase());
}

function dayFile(symbol, ymd) {
  return path.join(symbolDir(symbol), `${ymd}.json`);
}

const memory = new Map();

export function resetRollingOptionCache() {
  memory.clear();
}

export function wipeRollingOptions() {
  resetRollingOptionCache();
  try {
    fs.rmSync(rollingOptionDir(), { recursive: true, force: true });
  } catch {
    /* missing is fine */
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

export function hasRollingDay(symbol, ymd) {
  if (memory.has(`${symbol}|${ymd}`)) return true;
  try {
    return fs.existsSync(dayFile(symbol, ymd));
  } catch {
    return false;
  }
}

export function loadRollingDay(symbol, ymd) {
  const key = `${symbol}|${ymd}`;
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

export function writeRollingDay(symbol, ymd, payload) {
  const next = {
    symbol: String(symbol || "NIFTY").toUpperCase(),
    ymd,
    source: payload.source || "dhan-rolling",
    updatedAt: payload.updatedAt || new Date().toISOString(),
    weekly: payload.weekly || { slots: [] },
    monthly: payload.monthly || { slots: [] },
  };
  fs.mkdirSync(symbolDir(next.symbol), { recursive: true });
  fs.writeFileSync(dayFile(next.symbol, ymd), `${JSON.stringify(next)}\n`);
  memory.set(`${next.symbol}|${ymd}`, next);
  return next;
}

export function rollingCoverage(symbol, from, to) {
  const days = listYmds(from, to);
  if (!days.length) return "synth";
  let stored = 0;
  for (const ymd of days) {
    if (hasRollingDay(symbol, ymd)) stored += 1;
  }
  if (!stored) return "synth";
  if (stored >= days.length) return "stored";
  return "mixed";
}

export function parseRollingPayload(payload, option = "CE") {
  const side = option === "PE" || option === "PUT" ? "pe" : "ce";
  const pack = payload?.data?.[side] || payload?.[side] || payload?.data || payload;
  if (!pack || typeof pack !== "object") return [];
  const times = Array.isArray(pack.timestamp) ? pack.timestamp : [];
  const closes = Array.isArray(pack.close) ? pack.close : [];
  const highs = Array.isArray(pack.high) ? pack.high : [];
  const lows = Array.isArray(pack.low) ? pack.low : [];
  const strikes = Array.isArray(pack.strike) ? pack.strike : [];
  const spots = Array.isArray(pack.spot) ? pack.spot : [];
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

export async function downloadRollingOptionRange({
  symbol = "NIFTY",
  from,
  to,
  overwrite = false,
  fetchRolling,
  delayMs = 80,
  wings = ROLLING_WINGS,
  interval = 15,
  maxDays = ROLLING_MAX_DAYS,
  deadlineMs = 420_000,
} = {}) {
  const root = String(symbol || "NIFTY").toUpperCase();
  if (!isYmd(from) || !isYmd(to) || typeof fetchRolling !== "function") {
    return { symbol: root, from, to, days: 0, calls: 0, skipped: 0, truncated: false, source: "none" };
  }
  const all = listYmds(from, to);
  const wanted = all.length > maxDays ? all.slice(-maxDays) : all;
  const start = wanted[0];
  const end = wanted[wanted.length - 1];
  const missing = overwrite ? wanted : wanted.filter((ymd) => !hasRollingDay(root, ymd));
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
      source: "stored",
    };
  }
  const fetchFrom = missing[0];
  const fetchTo = missing[missing.length - 1];
  const started = Date.now();
  let calls = 0;
  let skipped = 0;
  let written = 0;
  let truncated = false;
  const labels = wingLabels(wings);
  for (const chunk of chunkDateRange(fetchFrom, fetchTo)) {
    if (Date.now() - started > deadlineMs) {
      truncated = true;
      break;
    }
    const weeklyBars = [];
    const monthlyBars = [];
    for (const expiryFlag of ["WEEK", "MONTH"]) {
      for (const option of ["CE", "PE"]) {
        for (const strike of labels) {
          if (Date.now() - started > deadlineMs) {
            truncated = true;
            break;
          }
          let payload = null;
          try {
            payload = await fetchRolling({
              expiryFlag,
              expiryCode: 0,
              strike,
              option,
              from: chunk.from,
              to: chunk.toExclusive,
              interval,
              securityId: NIFTY_ID,
            });
          } catch {
            skipped += 1;
          }
          calls += 1;
          const bars = parseRollingPayload(payload, option);
          if (expiryFlag === "MONTH") monthlyBars.push(...bars);
          else weeklyBars.push(...bars);
          if (delayMs > 0) await sleep(delayMs);
        }
      }
    }
    const weeklyDays = mergeBarsIntoDays(weeklyBars);
    const monthlyDays = mergeBarsIntoDays(monthlyBars);
    const ymds = new Set([...weeklyDays.keys(), ...monthlyDays.keys()]);
    for (const ymd of ymds) {
      if (!overwrite && hasRollingDay(root, ymd)) continue;
      const weekly = weeklyDays.get(ymd) || { slots: [] };
      const monthly = monthlyDays.get(ymd) || { slots: [] };
      if (!weekly.slots.length && !monthly.slots.length) continue;
      writeRollingDay(root, ymd, { weekly, monthly, source: "dhan-rolling" });
      written += 1;
    }
  }
  return {
    symbol: root,
    from: start,
    to: end,
    days: written,
    calls,
    skipped,
    truncated,
    source: written ? "dhan-rolling" : "none",
  };
}
