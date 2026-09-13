import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isNiftyVwapHedgeAlgo } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HEDGE_DAILY_LIVE_HOUR_IST = 9;
export const HEDGE_DAILY_LIVE_MINUTE_IST = 30;
export const HEDGE_DAILY_LIVE_LABEL = "09:30 IST";

function hedgeDailyLiveFile() {
  return process.env.T2S_HEDGE_DAILY_LIVE_FILE || path.join(__dirname, "..", "data", "hedge-daily-live.json");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function istParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function istYmd(date = new Date()) {
  const parts = istParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftYmd(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function isNseSessionDay(date = new Date()) {
  const weekday = istParts(date).weekday;
  return weekday !== "Sat" && weekday !== "Sun";
}

export function hedgeDailyLiveAtYmd(ymd) {
  return Date.parse(
    `${ymd}T${pad2(HEDGE_DAILY_LIVE_HOUR_IST)}:${pad2(HEDGE_DAILY_LIVE_MINUTE_IST)}:00+05:30`,
  );
}

export function isHedgeDailyLiveWindow(date = new Date()) {
  const at = date instanceof Date ? date : new Date(date);
  if (!isNseSessionDay(at)) return false;
  const parts = istParts(at);
  return Number(parts.hour) === HEDGE_DAILY_LIVE_HOUR_IST && Number(parts.minute) === HEDGE_DAILY_LIVE_MINUTE_IST;
}

export function shouldArmHedgeDailyLive({ now = new Date(), lastArmedYmd = "" } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  if (!isHedgeDailyLiveWindow(at)) return false;
  return istYmd(at) !== String(lastArmedYmd || "");
}

export function nextHedgeDailyLiveAt(from = Date.now()) {
  const start = Number(from);
  let ymd = istYmd(new Date(start));
  for (let i = 0; i < 8; i += 1) {
    const at = hedgeDailyLiveAtYmd(ymd);
    if (Number.isFinite(at) && at > start && isNseSessionDay(new Date(at))) return at;
    ymd = shiftYmd(ymd, 1);
  }
  return start + 24 * 60 * 60 * 1000;
}

export function loadHedgeDailyLiveArmedYmd() {
  try {
    const row = JSON.parse(fs.readFileSync(hedgeDailyLiveFile(), "utf8"));
    return String(row?.lastArmedYmd || "");
  } catch {
    return "";
  }
}

export function saveHedgeDailyLiveArmedYmd(ymd) {
  const next = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return "";
  fs.mkdirSync(path.dirname(hedgeDailyLiveFile()), { recursive: true });
  fs.writeFileSync(hedgeDailyLiveFile(), `${JSON.stringify({ lastArmedYmd: next }, null, 2)}\n`);
  return next;
}

export function applyHedgeDailyLive(algos = [], { now = new Date(), feedLive = false, lastArmedYmd = "" } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  if (!isHedgeDailyLiveWindow(at)) {
    return { algos, armedIds: [], lastArmedYmd, reason: "not-window" };
  }
  if (!feedLive) {
    return { algos, armedIds: [], lastArmedYmd, reason: "dhan-not-live" };
  }
  const ymd = istYmd(at);
  if (lastArmedYmd === ymd) {
    return { algos, armedIds: [], lastArmedYmd, reason: "already-armed" };
  }
  const armedIds = [];
  const next = (algos || []).map((algo) => {
    if (!isNiftyVwapHedgeAlgo(algo) || algo.runMode !== "live" || algo.enabled) return algo;
    armedIds.push(algo.id);
    return {
      ...algo,
      enabled: true,
      status: "LIVE",
      lastLiveAt: 0,
      lastLiveSide: "",
      lastSignal: "WAIT",
    };
  });
  return {
    algos: next,
    armedIds,
    lastArmedYmd: ymd,
    reason: armedIds.length ? "armed" : "already-live",
  };
}

export function startHedgeDailyLiveScheduler({
  getNow = () => Date.now(),
  arm,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let timer = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    const now = Number(getNow());
    const next = nextHedgeDailyLiveAt(now);
    timer = setTimeoutFn(onFire, Math.max(250, next - now));
  };

  const onFire = async () => {
    if (stopped) return;
    let result;
    try {
      result = typeof arm === "function" ? await arm(new Date(getNow())) : null;
    } catch (error) {
      console.log(`NIFTY 15m VWAP hedge 09:30 LIVE arm failed: ${error.message || error}`);
    }
    if (!stopped && result?.reason === "dhan-not-live" && isHedgeDailyLiveWindow(new Date(getNow()))) {
      timer = setTimeoutFn(onFire, 5_000);
      return;
    }
    scheduleNext();
  };

  scheduleNext();
  const next = nextHedgeDailyLiveAt(getNow());
  console.log(
    `NIFTY 15m VWAP hedge daily LIVE is set: ${HEDGE_DAILY_LIVE_LABEL} on session days · next ${new Date(next).toISOString()} · restart does not start LIVE`,
  );
  return () => {
    stopped = true;
    if (timer != null) clearTimeoutFn(timer);
  };
}
