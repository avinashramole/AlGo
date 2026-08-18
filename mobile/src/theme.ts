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
