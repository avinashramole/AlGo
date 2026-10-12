export type BookTab = "positions" | "orders" | "reports" | "paper";

export function tabFromParams(value: string | null, allowPaper = true): BookTab {
  if (value === "orders") return "orders";
  if (value === "reports") return "reports";
  if (value === "paper" && allowPaper) return "paper";
  return "positions";
}
