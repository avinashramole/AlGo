export const colors = {
  bg: "#f3f5f8",
  card: "#ffffff",
  border: "#e7ebf2",
  text: "#111827",
  muted: "#6b7280",
  brand: "#2f54eb",
  brandDark: "#1d39c4",
  up: "#12b76a",
  down: "#f04438",
  amber: "#d97706",
};

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

export function formatInr(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${formatNumber(Math.abs(value), 2)}`;
}

export function formatMobile(value?: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return String(value || "").trim() || "Not added";
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

/** Option chain VWAP: LTP below VWAP is red, LTP above VWAP is green. */
export function vwapColor(vwap: number, base: number) {
  const v = Number(vwap);
  const b = Number(base);
  if (!Number.isFinite(v) || !Number.isFinite(b) || b <= 0) return colors.muted;
  if (b < v) return colors.down;
  if (b > v) return colors.up;
  return colors.muted;
}
