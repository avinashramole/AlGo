import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optionRoot } from "./frontFutures.js";
import {
  atmStrike,
  exchangeSegmentFor,
  getUnderlying,
  markAtmRows,
  normalizeExpiry,
  trimAroundAtm,
  weekdayNameIST,
} from "./optionChain.js";
import { isNiftyOptionEngineAlgo, optionEngineConfig } from "./niftyVwap/config.js";
import { sessionKeyIST } from "./niftyVwap/VwapSignalEngine.js";
import { isNiftyVwapHedgeAlgo, niftyVwapHedgeConfig } from "./niftyVwapHedge/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_SYMBOLS = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY"]);
const memory = new Map();
const idMemory = new Map();

export function optionHistoryDir() {
  return process.env.T2S_NIFTY_OPTION_HISTORY_DIR || path.join(__dirname, "data", "nifty-option-history");
}

export function resetOptionHistoryCache() {
  memory.clear();
  idMemory.clear();
}

export function wipeOptionHistory() {
  resetOptionHistoryCache();
  try {
    fs.rmSync(optionHistoryDir(), { recursive: true, force: true });
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
  return SNAPSHOT_SYMBOLS.has(root) ? root : root === "NIFTY" || !root ? "NIFTY" : root;
}

function symbolDir(symbol) {
  return path.join(optionHistoryDir(), historySymbol(symbol));
}

function dayFile(symbol, ymd) {
  return path.join(symbolDir(symbol), `${ymd}.json`);
}

function idFile(symbol) {
  return path.join(symbolDir(symbol), "ids.json");
}

function dayKey(symbol, ymd) {
  return `${historySymbol(symbol)}|${ymd}`;
}

function emptyDay(symbol, ymd) {
  return {
    symbol: historySymbol(symbol),
    ymd,
    source: "snapshot",
    updatedAt: new Date().toISOString(),
    slots: [],
    contracts: [],
  };
}

export function loadDay(symbol, ymd) {
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

export function writeDay(symbol, ymd, payload) {
  const root = historySymbol(symbol);
  const next = {
    symbol: root,
    ymd,
    source: payload.source || "snapshot",
    overwritten: Boolean(payload.overwritten),
    updatedAt: payload.updatedAt || new Date().toISOString(),
    slots: Array.isArray(payload.slots) ? payload.slots : [],
    contracts: Array.isArray(payload.contracts) ? payload.contracts : [],
  };
  fs.mkdirSync(symbolDir(root), { recursive: true });
  fs.writeFileSync(dayFile(root, ymd), `${JSON.stringify(next)}\n`);
  memory.set(dayKey(root, ymd), next);
  rememberIdsFromDay(next);
  return next;
}

function loadIdIndex(symbol) {
  const root = historySymbol(symbol);
  if (idMemory.has(root)) return idMemory.get(root);
  try {
    const row = JSON.parse(fs.readFileSync(idFile(root), "utf8"));
    const map = row && typeof row === "object" ? row : {};
    idMemory.set(root, map);
    return map;
  } catch {
    const map = {};
    idMemory.set(root, map);
    return map;
  }
}

function saveIdIndex(symbol, map) {
  const root = historySymbol(symbol);
  idMemory.set(root, map);
  fs.mkdirSync(symbolDir(root), { recursive: true });
  fs.writeFileSync(idFile(root), `${JSON.stringify(map)}\n`);
}

function idKey(symbol, expiry, strike, option) {
  return `${historySymbol(symbol)}|${normalizeExpiry(expiry)}|${Number(strike)}|${String(option || "").toUpperCase()}`;
}

function rememberIdsFromDay(day) {
  if (!day) return;
  const map = loadIdIndex(day.symbol);
  let dirty = false;
  for (const slot of day.slots || []) {
    for (const row of slot.rows || []) {
      if (row.ceId) {
        map[idKey(day.symbol, slot.expiry, row.s, "CE")] = String(row.ceId);
        dirty = true;
      }
      if (row.peId) {
        map[idKey(day.symbol, slot.expiry, row.s, "PE")] = String(row.peId);
        dirty = true;
      }
    }
  }
  for (const contract of day.contracts || []) {
    if (contract.securityId) {
      map[idKey(day.symbol, contract.expiry, contract.strike, contract.option)] = String(contract.securityId);
      dirty = true;
    }
  }
  if (dirty) saveIdIndex(day.symbol, map);
}

export function rememberedSecurityId({ symbol, expiry, strike, option } = {}) {
  const map = loadIdIndex(symbol);
  return String(map[idKey(symbol, expiry, strike, option)] || "");
}

export function listStoredDays(symbol) {
  try {
    return fs
      .readdirSync(symbolDir(symbol))
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.slice(0, 10))
      .sort();
  } catch {
    return [];
  }
}

function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month, 0, 6, 30)).getUTCDate();
  for (let day = lastDay; day >= 1; day -= 1) {
    const ymd = `${year}-${pad2(month)}-${pad2(day)}`;
    if (weekdayNameIST(ymd) === weekday) return ymd;
  }
  return "";
}

export function optionExpiryForSession(ymd, symbol = "NIFTY") {
  const und = getUnderlying(symbol);
  const date = normalizeExpiry(ymd);
  if (!isYmd(date)) return "";
  if (und.weekly) {
    for (let i = 0; i < 14; i += 1) {
      const probe = shiftYmd(date, i);
      if (weekdayNameIST(probe) === und.expiryWeekday) return probe;
    }
    return "";
  }
  const [year, month] = date.split("-").map(Number);
  const thisMonth = lastWeekdayOfMonth(year, month, und.expiryWeekday);
  if (thisMonth && thisMonth >= date) return thisMonth;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return lastWeekdayOfMonth(nextYear, nextMonth, und.expiryWeekday);
}

export function slotEpoch(ms, minutes = 5) {
  const at = Number(ms) || Date.now();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const total = Number(parts.hour) * 60 + Number(parts.minute);
  const bucket = Math.floor(total / minutes) * minutes;
  const hour = pad2(Math.floor(bucket / 60));
  const minute = pad2(bucket % 60);
  return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${hour}:${minute}:00+05:30`);
}

function compactRow(row) {
  const out = { s: Number(row.strike || row.s || 0) };
  const ce = Number(row.callLtp ?? row.ce ?? 0);
  const pe = Number(row.putLtp ?? row.pe ?? 0);
  if (ce > 0) out.ce = ce;
  if (pe > 0) out.pe = pe;
  const ceOi = Number(row.callOi ?? row.ceOi ?? 0);
  const peOi = Number(row.putOi ?? row.peOi ?? 0);
  if (ceOi > 0) out.ceOi = ceOi;
  if (peOi > 0) out.peOi = peOi;
  const ceIv = Number(row.callIv ?? row.ceIv ?? 0);
  const peIv = Number(row.putIv ?? row.peIv ?? 0);
  if (ceIv > 0) out.ceIv = ceIv;
  if (peIv > 0) out.peIv = peIv;
  const ceId = row.callId ?? row.ceId;
  const peId = row.putId ?? row.peId;
  if (ceId) out.ceId = Number(ceId) || String(ceId);
  if (peId) out.peId = Number(peId) || String(peId);
  return out;
}

export function upsertSnapshotSlot(symbol, slot) {
  const ymd = sessionKeyIST(slot.at);
  const day = loadDay(symbol, ymd) || emptyDay(symbol, ymd);
  const nextSlot = {
    at: Number(slot.at),
    expiry: normalizeExpiry(slot.expiry),
    spot: Number(slot.spot) || 0,
    rows: Array.isArray(slot.rows) ? slot.rows.map(compactRow).filter((row) => row.s > 0) : [],
  };
  const idx = (day.slots || []).findIndex((row) => Number(row.at) === nextSlot.at);
  if (idx >= 0) day.slots[idx] = nextSlot;
  else day.slots.push(nextSlot);
  day.slots.sort((a, b) => Number(a.at) - Number(b.at));
  day.source = "snapshot";
  day.overwritten = false;
  day.updatedAt = new Date().toISOString();
  return writeDay(symbol, ymd, day);
}

export function recordLiveChainSnapshot({ symbol, expiry, spot, rows, at = Date.now() } = {}) {
  const root = historySymbol(symbol);
  if (!SNAPSHOT_SYMBOLS.has(root)) return null;
  if (!Array.isArray(rows) || !rows.length) return null;
  const und = getUnderlying(root);
  const marked = markAtmRows(
    rows.map((row) => ({ ...row, strike: Number(row.strike) })),
    Number(spot) || 0,
    und.step,
  );
  const trimmed = trimAroundAtm(marked, 12);
  if (!trimmed.length) return null;
  return upsertSnapshotSlot(root, {
    at: slotEpoch(at, 5),
    expiry,
    spot,
    rows: trimmed,
  });
}

function nearestAtOrBefore(rows, time, key = "at") {
  let best = null;
  for (const row of rows || []) {
    const t = Number(row[key] ?? row.t ?? row.time);
    if (!Number.isFinite(t)) continue;
    if (t <= time + 60_000 && (!best || t >= Number(best[key] ?? best.t ?? best.time))) best = row;
  }
  return best;
}

export function optionLtpAt({ symbol, time, strike, side, expiry } = {}) {
  const when = Number(time);
  const px = Number(strike);
  if (!Number.isFinite(when) || !px) return null;
  const ymd = sessionKeyIST(when);
  const day = loadDay(symbol, ymd);
  if (!day) return null;
  const opt = side === "PE" || side === "PUT" || side === "P" ? "PE" : "CE";
  const wantExpiry = normalizeExpiry(expiry);
  const contracts = (day.contracts || []).filter(
    (row) =>
      Number(row.strike) === px &&
      String(row.option || "").toUpperCase() === opt &&
      (!wantExpiry || normalizeExpiry(row.expiry) === wantExpiry),
  );
  for (const contract of contracts) {
    const bar = nearestAtOrBefore(contract.bars || [], when, "t");
    const close = Number(bar?.c ?? bar?.close ?? 0);
    if (close > 0) return close;
  }
  const slot = nearestAtOrBefore(day.slots || [], when, "at") || (day.slots || [])[0];
  const row = (slot?.rows || []).find((item) => Number(item.s) === px);
  const ltp = opt === "PE" ? Number(row?.pe || 0) : Number(row?.ce || 0);
  return ltp > 0 ? ltp : null;
}

export function hasStoredOptionDay(symbol, ymd) {
  const day = loadDay(symbol, ymd);
  if (!day) return false;
  const hasSlots = (day.slots || []).some((slot) => (slot.rows || []).some((row) => row.ce > 0 || row.pe > 0));
  const hasBars = (day.contracts || []).some((row) => (row.bars || []).length);
  return hasSlots || hasBars;
}

export function optionHistoryCoverage(symbol, from, to) {
  const days = listYmds(from, to);
  if (!days.length) return "synth";
  let stored = 0;
  for (const ymd of days) {
    if (hasStoredOptionDay(symbol, ymd)) stored += 1;
  }
  if (!stored) return "synth";
  if (stored >= days.length) return "stored";
  return "mixed";
}

export function optionBacktestWindow(algo, window) {
  const hedge = isNiftyVwapHedgeAlgo(algo);
  const nifty = isNiftyOptionEngineAlgo(algo) || hedge;
  const root = historySymbol(algo?.symbol || "NIFTY");
  if (!nifty) return { from: window.from, to: window.to, option: false, symbol: root };
  const cfg = hedge ? niftyVwapHedgeConfig(algo) : optionEngineConfig(algo);
  const maxDays = cfg?.barMinutes >= 15 ? 60 : 25;
  const from = window.days > maxDays ? shiftYmd(window.to, -(maxDays - 1)) : window.from;
  return {
    from,
    to: window.to,
    option: true,
    symbol: cfg.symbol || root,
    timeframe: cfg.timeframe,
  };
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

function uniqueSessionDays(from, to, candles = []) {
  const fromDays = listYmds(from, to);
  const fromBars = [...new Set((candles || []).map((bar) => sessionKeyIST(bar.time)).filter(isYmd))];
  const set = new Set(fromBars.length ? fromBars.filter((ymd) => ymd >= from && ymd <= to) : fromDays);
  return [...set].sort();
}

function spotForDay(candles, ymd) {
  const rows = (candles || []).filter((bar) => sessionKeyIST(bar.time) === ymd);
  if (!rows.length) return 0;
  const mid = rows[Math.floor(rows.length / 2)];
  return Number(mid.close || mid.open || 0);
}

function slotsFromContracts(contracts, candles, ymd) {
  const times = new Set();
  for (const contract of contracts) {
    for (const bar of contract.bars || []) times.add(Number(bar.t));
  }
  const spots = (candles || []).filter((bar) => sessionKeyIST(bar.time) === ymd);
  return [...times]
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b)
    .map((time) => {
      const spotBar = nearestAtOrBefore(spots, time, "time");
      const byStrike = new Map();
      let expiry = "";
      for (const contract of contracts) {
        const bar = nearestAtOrBefore(contract.bars || [], time, "t");
        if (!bar) continue;
        const strike = Number(contract.strike);
        const row = byStrike.get(strike) || { s: strike };
        if (contract.option === "PE") row.pe = Number(bar.c);
        else row.ce = Number(bar.c);
        if (contract.securityId) {
          if (contract.option === "PE") row.peId = Number(contract.securityId) || String(contract.securityId);
          else row.ceId = Number(contract.securityId) || String(contract.securityId);
        }
        expiry = expiry || contract.expiry;
        byStrike.set(strike, row);
      }
      return {
        at: time,
        expiry,
        spot: Number(spotBar?.close || 0),
        rows: [...byStrike.values()].sort((a, b) => a.s - b.s),
      };
    })
    .filter((slot) => slot.rows.length);
}

async function resolveContractId(contract, lookupId) {
  const remembered = rememberedSecurityId(contract);
  if (remembered) return remembered;
  if (typeof lookupId !== "function") return "";
  try {
    return String(
      (await lookupId({
        symbol: contract.symbol,
        expiry: contract.expiry,
        strike: contract.strike,
        option: contract.option,
      })) || "",
    ).trim();
  } catch {
    return "";
  }
}

function compactBars(bars = []) {
  return (bars || [])
    .map((bar) => ({
      t: Number(bar.time ?? bar.t),
      o: Number(bar.open ?? bar.o),
      h: Number(bar.high ?? bar.h),
      l: Number(bar.low ?? bar.l),
      c: Number(bar.close ?? bar.c),
      v: Number(bar.volume ?? bar.v ?? 0),
    }))
    .filter((bar) => Number.isFinite(bar.t) && Number(bar.c) > 0)
    .sort((a, b) => a.t - b.t);
}

export async function downloadOptionHistoryRange({
  symbol,
  from,
  to,
  candles = [],
  overwrite = true,
  fetchBars,
  lookupId,
  wings = 2,
  delayMs = 0,
} = {}) {
  const root = historySymbol(symbol);
  if (!SNAPSHOT_SYMBOLS.has(root)) {
    return { symbol: root, from, to, overwritten: [], days: 0, contracts: 0 };
  }
  if (!isYmd(from) || !isYmd(to) || typeof fetchBars !== "function") {
    return { symbol: root, from, to, overwritten: [], days: 0, contracts: 0 };
  }
  const und = getUnderlying(root);
  const allDays = uniqueSessionDays(from, to, candles);
  const days =
    overwrite === false ? allDays.filter((ymd) => !hasStoredOptionDay(root, ymd)) : allDays;
  if (!days.length) {
    return {
      symbol: root,
      from,
      to,
      overwritten: [],
      days: 0,
      contracts: 0,
      source: "stored",
      reused: true,
    };
  }
  const wanted = new Map();
  for (const ymd of days) {
    const spot = spotForDay(candles, ymd);
    const atm = atmStrike(spot || 0, und.step);
    if (!atm) continue;
    const expiry = optionExpiryForSession(ymd, root);
    if (!expiry) continue;
    for (let i = -wings; i <= wings; i += 1) {
      const strike = atm + i * und.step;
      for (const option of ["CE", "PE"]) {
        const key = `${expiry}|${strike}|${option}`;
        if (!wanted.has(key)) {
          wanted.set(key, { symbol: root, expiry, strike, option });
        }
      }
    }
  }

  const fetched = [];
  for (const contract of wanted.values()) {
    const securityId = await resolveContractId(contract, lookupId);
    if (!securityId) continue;
    let bars = [];
    try {
      bars = compactBars(
        await fetchBars({
          securityId,
          exchangeSegment: exchangeSegmentFor(root),
          instrument: "OPTIDX",
          from,
          to,
          timeframe: "5m",
          oi: true,
        }),
      );
    } catch {
      bars = [];
    }
    fetched.push({ ...contract, securityId, bars });
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const overwritten = [];
  for (const ymd of days) {
    const dayContracts = fetched
      .map((contract) => ({
        securityId: contract.securityId,
        strike: contract.strike,
        option: contract.option,
        expiry: contract.expiry,
        bars: (contract.bars || []).filter((bar) => sessionKeyIST(bar.t) === ymd),
      }))
      .filter((contract) => contract.bars.length);
    if (!dayContracts.length) continue;
    writeDay(root, ymd, {
      source: "dhan-download",
      overwritten: overwrite !== false,
      slots: slotsFromContracts(dayContracts, candles, ymd),
      contracts: dayContracts,
    });
    overwritten.push(ymd);
  }

  return {
    symbol: root,
    from,
    to,
    overwritten,
    days: overwritten.length,
    contracts: fetched.length,
    source: "dhan-download",
  };
}
