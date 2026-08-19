export function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPct(value: number, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatChange(value: number, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

export function formatMobile(value?: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return String(value || "").trim() || "Not added";
}

export function formatInr(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(value), 2)}`;
}

export function formatIstClock(date = new Date()) {
  const clock = date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${clock.toUpperCase()} IST`;
}

export function isNseSessionOpen(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  return !weekend && minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
}

export function fundsCaption(broker: { id?: string; virtual?: boolean; liveFeed?: boolean; funds: number }) {
  const amount = `₹${formatNumber(broker.funds, 0)}`;
  if (broker.virtual || broker.id === "paper") return `${amount} virtual`;
  if (broker.liveFeed) return `${amount} actual`;
  return amount;
}

export function liveBookCopy(live?: boolean) {
  return live
    ? "LIVE feed · Dhan actual + Paper virtual fills. No simulated book or simulated balance."
    : "Demo book until Dhan is LIVE. Paper trading uses the live feed only.";
}

export function formatIst(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatOi(value: number) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  return Math.round(n).toLocaleString("en-IN");
}

/** Option chain VWAP: LTP below VWAP is red, LTP above VWAP is green. */
export function vwapTone(vwap: number, base: number) {
  const v = Number(vwap);
  const b = Number(base);
  if (!Number.isFinite(v) || !Number.isFinite(b) || b <= 0) return "text-slate-400";
  if (b < v) return "text-down";
  if (b > v) return "text-up";
  return "text-slate-400";
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
