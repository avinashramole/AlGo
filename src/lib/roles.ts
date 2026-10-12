import type { AuthUser } from "../api/client";

export type DeskRole = "admin" | "user";

export function isAdminUser(user?: Pick<AuthUser, "role"> | null) {
  return user?.role === "admin";
}

export const adminNav = [
  { to: "/", label: "Home" },
  { to: "/algo", label: "Algos" },
  { to: "/reports", label: "Position & Orders" },
  { to: "/options", label: "Option Chain" },
  { to: "/brokers", label: "Brokers" },
  { to: "/analytics", label: "Analytics" },
  { to: "/users", label: "User & IP Manager" },
  { to: "/chat", label: "Messages" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
] as const;

export const userNav = [
  { to: "/", label: "Home" },
  { to: "/plans", label: "Algos" },
  { to: "/reports", label: "Position & Orders" },
  { to: "/notifications", label: "Alerts" },
  { to: "/profile", label: "Profile" },
] as const;

export function navForUser(user?: Pick<AuthUser, "role"> | null) {
  return isAdminUser(user) ? adminNav : userNav;
}

const extraTitles = [
  { to: "/notifications", label: "Notifications" },
  { to: "/support", label: "Support" },
  { to: "/subscriptions", label: "My plan" },
  { to: "/markets", label: "Option Chain" },
  { to: "/signals", label: "Algos" },
  { to: "/orders", label: "Position & Orders" },
  { to: "/positions", label: "Position & Orders" },
  { to: "/portfolio", label: "Position & Orders" },
  { to: "/settings/ips", label: "User & IP Manager" },
] as const;

function normalizePath(path: string) {
  const clean = (path.split("?")[0] || "/").replace(/\/+$/, "");
  return clean || "/";
}

export function pageTitleForPath(path: string, user?: Pick<AuthUser, "role"> | null) {
  const clean = normalizePath(path);
  const ranked = [...navForUser(user), ...extraTitles].sort((a, b) => b.to.length - a.to.length);
  for (const item of ranked) {
    if (item.to === "/") {
      if (clean === "/") return item.label;
      continue;
    }
    if (clean === item.to || clean.startsWith(`${item.to}/`)) return item.label;
  }
  return "Trade 2 Smart";
}

export function isAllowedPath(user: Pick<AuthUser, "role"> | null | undefined, path: string) {
  const clean = normalizePath(path);
  if (isAdminUser(user)) return true;
  if (clean === "/subscriptions" || clean.startsWith("/subscriptions/")) return true;
  if (clean === "/support" || clean.startsWith("/support/")) return true;
  if (clean === "/orders" || clean === "/positions" || clean === "/portfolio") return true;
  return userNav.some((item) => (item.to === "/" ? clean === "/" : clean === item.to || clean.startsWith(`${item.to}/`)));
}
