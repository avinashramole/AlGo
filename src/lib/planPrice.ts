import type { CatalogStrategy, PlanTerm } from "../api/client";

export type { PlanTerm };

export const PLAN_TERMS: PlanTerm[] = ["monthly", "quarterly", "yearly"];
export const TERM_MONTHS: Record<PlanTerm, number> = { monthly: 1, quarterly: 3, yearly: 12 };
export const DEFAULT_PLAN_PRICES: Record<PlanTerm, number> = { monthly: 2999, quarterly: 6999, yearly: 11999 };

export function planFee(row: Pick<CatalogStrategy, "enrollFee" | "terms">, term: PlanTerm) {
  const priced = Number(row.terms?.[term]);
  if (Number.isFinite(priced) && priced > 0) return Math.round(priced);
  const monthly = Number(row.enrollFee) > 0 ? Math.round(Number(row.enrollFee)) : DEFAULT_PLAN_PRICES.monthly;
  if (term === "monthly") return monthly;
  return Math.round(monthly * (DEFAULT_PLAN_PRICES[term] / DEFAULT_PLAN_PRICES.monthly));
}

export function planOffer(row: Pick<CatalogStrategy, "enrollFee" | "terms">, term: PlanTerm) {
  const months = TERM_MONTHS[term];
  const monthly = planFee(row, "monthly");
  const price = planFee(row, term);
  const full = monthly * months;
  const save = Math.max(0, full - price);
  return { price, full, save, months, perMonth: Math.round(price / months) };
}

export function bestPlanSave(row: Pick<CatalogStrategy, "enrollFee" | "terms">) {
  return planOffer(row, "yearly").save;
}
