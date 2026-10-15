export const TOKEN_RENEW_HOUR_IST = 8;
export const BOOK_CLEAR_HOUR_IST = 1;
export const BOOK_CLEAR_MINUTE_IST = 1;
export const BOOK_CLEAR_LABEL = "01:01 AM IST";

function kolkataParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
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

function clampHour(hour) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return TOKEN_RENEW_HOUR_IST;
  return Math.max(0, Math.min(23, Math.trunc(value)));
}

function clampMinute(minute) {
  const value = Number(minute);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(59, Math.trunc(value)));
}

function istClockAt(from, hour, minute = 0) {
  const parts = kolkataParts(new Date(from));
  return Date.parse(
    `${parts.year}-${parts.month}-${parts.day}T${String(clampHour(hour)).padStart(2, "0")}:${String(clampMinute(minute)).padStart(2, "0")}:00+05:30`,
  );
}

export function nextDailyRenewalAt(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST, minute = 0) {
  const today = istClockAt(from, hour, minute);
  if (!Number.isFinite(today)) return from + 24 * 60 * 60 * 1000;
  if (from < today) return today;
  return today + 24 * 60 * 60 * 1000;
}

export function lastDailyResetAt(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST, minute = 0) {
  const today = istClockAt(from, hour, minute);
  if (!Number.isFinite(today)) return from;
  return from >= today ? today : today - 24 * 60 * 60 * 1000;
}

export function lastBookClearAt(from = Date.now()) {
  return lastDailyResetAt(from, BOOK_CLEAR_HOUR_IST, BOOK_CLEAR_MINUTE_IST);
}

export function nextBookClearAt(from = Date.now()) {
  return nextDailyRenewalAt(from, BOOK_CLEAR_HOUR_IST, BOOK_CLEAR_MINUTE_IST);
}

export function msUntilBookClear(from = Date.now()) {
  return Math.max(5_000, nextBookClearAt(from) - from);
}

export function msUntilDailyRenewal(from = Date.now(), hour = TOKEN_RENEW_HOUR_IST, minute = 0) {
  return Math.max(5_000, nextDailyRenewalAt(from, hour, minute) - from);
}

export function tradeLogRowMs(row = {}) {
  const ms = Date.parse(String(row?.createdAt || row?.closedAt || row?.openedAt || ""));
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function isFreshTradeLogRow(row = {}, from = Date.now()) {
  const ms = tradeLogRowMs(row);
  if (!ms) return true;
  return ms >= lastBookClearAt(from);
}
