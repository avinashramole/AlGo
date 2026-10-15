export const DESK_TIMEFRAME_PRESETS = ["5m", "15m", "30m", "1H"];
export const MIN_CUSTOM_BAR_MINUTES = 1;
export const MAX_CUSTOM_BAR_MINUTES = 60;

const NAMED = {
  "1m": 1,
  "2m": 2,
  "3m": 3,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "60m": 60,
  "1H": 60,
  "1h": 60,
  "1hr": 60,
  "1HR": 60,
};

export function parseBarMinutes(timeframe, fallback = 5) {
  const raw = String(timeframe || "").trim();
  if (NAMED[raw]) return NAMED[raw];
  const match = raw.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/i) || raw.match(/^(\d+)$/);
  const n = match ? Number(match[1]) : NaN;
  if (Number.isFinite(n) && n >= MIN_CUSTOM_BAR_MINUTES && n <= MAX_CUSTOM_BAR_MINUTES) return Math.round(n);
  return fallback;
}

export function resolveDeskTimeframe(timeframe, fallback = "5m") {
  const minutes = parseBarMinutes(timeframe, 0);
  if (!minutes) return fallback;
  if (minutes === 5) return "5m";
  if (minutes === 15) return "15m";
  if (minutes === 30) return "30m";
  if (minutes === 60) return "1H";
  return `${minutes}m`;
}

export function isDeskTimeframe(timeframe) {
  return parseBarMinutes(timeframe, 0) >= MIN_CUSTOM_BAR_MINUTES;
}
