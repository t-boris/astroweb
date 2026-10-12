import { reportsPerMonth } from "./astrologer";

/**
 * Subscription pricing, anchored on the "every 2 days" cadence at $9.99/mo.
 * Other cadences scale proportionally with letter frequency (reports/month), so
 * a more frequent astrologer costs more and a rarer one costs less. The annual
 * plan is 9 months for 12 ("3 months free").
 */
const ANCHOR_MONTHLY_CENTS = 999;
const ANCHOR_REPORTS = reportsPerMonth("every_2_days"); // 15

export function monthlyPriceCents(cadence: string): number {
  return Math.round((ANCHOR_MONTHLY_CENTS * reportsPerMonth(cadence)) / ANCHOR_REPORTS);
}

export function priceCents(cadence: string, period: "monthly" | "annual"): number {
  const monthly = monthlyPriceCents(cadence);
  return period === "annual" ? monthly * 9 : monthly;
}

export function stripeInterval(period: "monthly" | "annual"): "month" | "year" {
  return period === "annual" ? "year" : "month";
}
