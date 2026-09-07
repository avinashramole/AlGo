import type { AuthUser } from "../api/client";

export type DeskRole = "admin" | "user";

export function isAdminUser(user?: Pick<AuthUser, "role"> | null) {
  return user?.role === "admin";
}

export const adminNav = [
  { to: "/", label: "Home" },
  { to: "/markets", label: "Markets" },
  { to: "/options", label: "Chain" },
  { to: "/signals", label: "Signals" },
  { to: "/algo", label: "Algo" },
  { to: "/orders", label: "Orders" },
  { to: "/positions", label: "Positions" },
  { to: "/reports", label: "Reports" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/brokers", label: "Brokers" },
  { to: "/analytics", label: "Analytics" },
  { to: "/users", label: "Users" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
] as const;

export const userNav = [
  { to: "/", label: "Home" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/profile", label: "Profile" },
] as const;

export function navForUser(user?: Pick<AuthUser, "role"> | null) {
  return isAdminUser(user) ? adminNav : userNav;
}

export function isAllowedPath(user: Pick<AuthUser, "role"> | null | undefined, path: string) {
  const clean = path.split("?")[0] || "/";
  if (isAdminUser(user)) return true;
  return userNav.some((item) => (item.to === "/" ? clean === "/" : clean === item.to || clean.startsWith(`${item.to}/`)));
}
