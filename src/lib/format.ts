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

export function formatInr(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(value), 2)}`;
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

/** VWAP vs LTP (base): above LTP is green, below LTP is red. */
export function vwapTone(vwap: number, base: number) {
  const v = Number(vwap);
  const b = Number(base);
  if (!Number.isFinite(v) || !Number.isFinite(b) || b <= 0) return "text-slate-400";
  if (v > b) return "text-up";
  if (v < b) return "text-down";
  return "text-slate-400";
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
