import { isBacktestBusy } from "./backtestJob.js";
import {
  NSE_OPTION_INDEXES,
  completeRollingDays,
  downloadRollingOptionRange,
  rollingContract,
  rollingCoverage,
  rollingInterval,
  rollingOptionDir,
} from "./dhanRollingOption.js";

export const ROLLING_FILL_INTERVAL = 1;
export const ROLLING_FILL_YEARS = 1;
export const ROLLING_FILL_STEP_MS = 75_000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function ymdIST(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export function shiftYmdYears(ymd, years) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const next = new Date(Date.UTC(year - Number(years || 0), month - 1, day));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export function rollingFillWindow(now = new Date(), years = ROLLING_FILL_YEARS) {
  const to = ymdIST(now);
  return { from: shiftYmdYears(to, years), to, years };
}

const state = {
  running: false,
  enabled: false,
  interval: ROLLING_FILL_INTERVAL,
  from: "",
  to: "",
  symbol: "",
  last: null,
  error: "",
  startedAt: "",
  updatedAt: "",
};

let timer = null;

export function resetRollingFillState() {
  state.running = false;
  state.enabled = false;
  state.symbol = "";
  state.last = null;
  state.error = "";
  state.startedAt = "";
  state.updatedAt = "";
}

export function rollingFillStatus() {
  const window = state.from && state.to ? { from: state.from, to: state.to } : rollingFillWindow();
  const indexes = NSE_OPTION_INDEXES.map((symbol) => {
    const completeDays = completeRollingDays(symbol, window.from, window.to, state.interval);
    return {
      symbol,
      coverage: rollingCoverage(symbol, window.from, window.to, state.interval),
      completeDays,
      dir: rollingOptionDir(state.interval),
    };
  });
  const complete = indexes.every((row) => row.coverage === "stored");
  return {
    running: state.running,
    enabled: state.enabled,
    complete,
    interval: `${state.interval}m`,
    from: window.from,
    to: window.to,
    symbol: state.symbol,
    dir: rollingOptionDir(state.interval),
    indexes,
    last: state.last,
    error: state.error,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
  };
}

function nextIndexToFill(from, to, interval) {
  return NSE_OPTION_INDEXES.find((symbol) => rollingCoverage(symbol, from, to, interval) !== "stored") || "";
}

export async function stepRollingOptionFill({
  fetchRolling,
  isLive = () => true,
  now = new Date(),
  busy = isBacktestBusy,
  years = ROLLING_FILL_YEARS,
  interval = ROLLING_FILL_INTERVAL,
  deadlineMs = ROLLING_FILL_STEP_MS,
  delayMs = 40,
} = {}) {
  if (state.running) return rollingFillStatus();
  if (typeof busy === "function" && busy()) {
    state.error = "paused while a backtest is running";
    state.updatedAt = new Date().toISOString();
    return rollingFillStatus();
  }
  if (typeof isLive === "function" && !isLive()) {
    state.error = "Dhan not live";
    state.updatedAt = new Date().toISOString();
    return rollingFillStatus();
  }
  if (typeof fetchRolling !== "function") {
    state.error = "rolling fetch is missing";
    return rollingFillStatus();
  }
  const tf = rollingInterval(interval);
  const window = rollingFillWindow(now, years);
  const symbol = nextIndexToFill(window.from, window.to, tf);
  state.enabled = true;
  state.interval = tf;
  state.from = window.from;
  state.to = window.to;
  state.symbol = symbol;
  state.error = "";
  if (!symbol) {
    state.updatedAt = new Date().toISOString();
    return rollingFillStatus();
  }
  const contract = rollingContract(symbol);
  if (!contract) {
    state.error = `${symbol} is not a Dhan rolling index`;
    return rollingFillStatus();
  }
  state.running = true;
  state.startedAt = state.startedAt || new Date().toISOString();
  try {
    const last = await downloadRollingOptionRange({
      symbol,
      from: window.from,
      to: window.to,
      overwrite: false,
      fetchRolling,
      delayMs,
      interval: tf,
      maxDays: 366,
      deadlineMs,
      securityId: contract.securityId,
      exchangeSegment: contract.exchangeSegment,
      instrument: contract.instrument,
    });
    state.last = last;
    if (last.lastError) state.error = last.lastError;
  } catch (error) {
    state.error = error?.message || String(error || "rolling-fill-failed");
  } finally {
    state.running = false;
    state.updatedAt = new Date().toISOString();
    state.symbol = nextIndexToFill(window.from, window.to, tf);
  }
  return rollingFillStatus();
}

export function startRollingOptionFillScheduler({
  fetchRolling,
  isLive,
  everyMs = 20_000,
} = {}) {
  if (timer) return rollingFillStatus();
  state.enabled = true;
  const tick = () => {
    void stepRollingOptionFill({ fetchRolling, isLive }).catch((error) => {
      state.error = error?.message || String(error || "rolling-fill-failed");
      state.running = false;
    });
  };
  timer = setInterval(tick, Number(everyMs) || 20_000);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(tick, 2500);
  return rollingFillStatus();
}

export function stopRollingOptionFillScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  state.enabled = false;
  return rollingFillStatus();
}
