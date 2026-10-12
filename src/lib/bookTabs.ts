export type BookTab = "positions" | "orders" | "reports";

export function tabFromParams(value: string | null): BookTab {
  if (value === "orders") return "orders";
  if (value === "reports") return "reports";
  return "positions";
}
