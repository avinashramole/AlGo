import type { AuthUser } from "../api/client";

export type DeskRole = "admin" | "user";

export function isAdminUser(user?: Pick<AuthUser, "role"> | null) {
  return user?.role === "admin";
}

export const adminNav = [
  { to: "/", label: "Home" },
  { to: "/options", label: "Option Chain" },
  { to: "/signals", label: "Signals" },
  { to: "/algo", label: "Algo" },
  { to: "/orders", label: "Orders" },
  { to: "/positions", label: "Positions" },
  { to: "/reports", label: "Reports" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/brokers", label: "Brokers" },
  { to: "/analytics", label: "Analytics" },
  { to: "/users", label: "Users" },
  { to: "/settings/ips", label: "IP management" },
  { to: "/chat", label: "Messages" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
] as const;

export const userNav = [
  { to: "/", label: "Home" },
  { to: "/plans", label: "My plan" },
  { to: "/profile", label: "Profile" },
] as const;

export function navForUser(user?: Pick<AuthUser, "role"> | null) {
  return isAdminUser(user) ? adminNav : userNav;
}

const extraTitles = [
  { to: "/notifications", label: "Notifications" },
  { to: "/subscriptions", label: "My plan" },
  { to: "/markets", label: "Option Chain" },
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
  return userNav.some((item) => (item.to === "/" ? clean === "/" : clean === item.to || clean.startsWith(`${item.to}/`)));
}
