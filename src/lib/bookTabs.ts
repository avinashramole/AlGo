export type BookTab = "positions" | "orders" | "reports" | "master" | "paper";

export function tabFromParams(value: string | null, allowPaper = true): BookTab {
  if (value === "orders") return "orders";
  if (value === "reports") return "reports";
  if (value === "master") return "master";
  if (value === "paper" && allowPaper) return "paper";
  return "positions";
}
