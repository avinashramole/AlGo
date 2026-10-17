import type { CatalogStrategy, PlanTerm } from "../api/client";

export type { PlanTerm };

export const PLAN_TERMS: PlanTerm[] = ["monthly", "quarterly", "yearly"];
export const TERM_MONTHS: Record<PlanTerm, number> = { monthly: 1, quarterly: 3, yearly: 12 };
export const DEFAULT_PLAN_PRICES: Record<PlanTerm, number> = { monthly: 2999, quarterly: 6999, yearly: 11999 };

/** Snap a rupee price to the nearest x999 (5999, 13999, …). Values under 999 stay as-is. */
export function charmPrice(value: number) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v) || v < 1) return 0;
  if (v < 999) return v;
  const down = Math.max(999, Math.floor((v + 1) / 1000) * 1000 - 1);
  const up = down + 1000;
  return v - down <= up - v ? down : up;
}

export function planFee(row: Pick<CatalogStrategy, "enrollFee" | "terms">, term: PlanTerm) {
  const priced = Number(row.terms?.[term]);
  if (Number.isFinite(priced) && priced > 0) return charmPrice(priced);
  const monthly = Number(row.enrollFee) > 0 ? Math.round(Number(row.enrollFee)) : DEFAULT_PLAN_PRICES.monthly;
  if (term === "monthly") return charmPrice(monthly);
  return charmPrice(monthly * (DEFAULT_PLAN_PRICES[term] / DEFAULT_PLAN_PRICES.monthly));
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
