import type { AuthUser } from "../api/client";

export type DeskRole = "admin" | "user";

export function isAdminUser(user?: Pick<AuthUser, "role"> | null) {
  return user?.role === "admin";
}

export const USER_DESK_CLASS = "t2s-user-desk";

export function isUserDesk(user?: Pick<AuthUser, "role"> | null) {
  return Boolean(user) && !isAdminUser(user);
}

export function markUserDeskDocument(user?: Pick<AuthUser, "role"> | null) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(USER_DESK_CLASS, isUserDesk(user));
}

export const adminNav = [
  { to: "/", label: "Home" },
  { to: "/algo", label: "Algos" },
  { to: "/algo-test", label: "Algo Test" },
  { to: "/reports", label: "Position & Orders" },
  { to: "/master-report", label: "Master report" },
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
  { to: "/positions", label: "Position" },
  { to: "/orders", label: "Orders" },
  { to: "/broker", label: "Broker" },
  { to: "/profile#login-password", label: "Password" },
  { to: "/settings", label: "Settings" },
  { to: "/support", label: "Support" },
] as const;

export function navForUser(user?: Pick<AuthUser, "role"> | null) {
  return isAdminUser(user) ? adminNav : userNav;
}

const extraTitles = [
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
  { to: "/notifications", label: "Notifications" },
  { to: "/support", label: "Support" },
  { to: "/subscriptions", label: "My plan" },
  { to: "/markets", label: "Option Chain" },
  { to: "/signals", label: "Algos" },
  { to: "/algo-test", label: "Algo Test" },
  { to: "/orders", label: "Orders" },
  { to: "/positions", label: "Position" },
  { to: "/portfolio", label: "Position" },
  { to: "/reports", label: "Position" },
  { to: "/master-report", label: "Master report" },
  { to: "/tape", label: "Market tape" },
  { to: "/broker", label: "Add broker" },
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
  if (clean === "/profile" || clean.startsWith("/profile/")) return true;
  if (clean === "/settings" || clean.startsWith("/settings/")) return true;
  if (clean === "/support" || clean.startsWith("/support/")) return true;
  if (clean === "/notifications" || clean.startsWith("/notifications/")) return true;
  if (clean === "/orders" || clean === "/positions" || clean === "/portfolio" || clean === "/reports") return true;
  if (clean === "/tape" || clean === "/broker") return true;
  return userNav.some((item) => (item.to === "/" ? clean === "/" : clean === item.to || clean.startsWith(`${item.to}/`)));
}
