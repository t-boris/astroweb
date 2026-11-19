import { reportsPerMonth } from "./astrologer";

/**
 * Subscription pricing.
 *
 * Daily horoscope subscription (DEC-005, REQ-004): USD 30.00/month or
 * USD 179.82/year for new buyers (annual price is independent of monthly).
 * Other cadences remain anchored on "every 2 days" at $9.99/mo with annual =
 * 9 months for 12 ("3 months free"). Existing Stripe subscriptions keep their
 * contracted renewal prices automatically.
 */
const ANCHOR_MONTHLY_CENTS = 999;
const ANCHOR_REPORTS = reportsPerMonth("every_2_days"); // 15
const DAILY_MONTHLY_CENTS = 3000;
const DAILY_ANNUAL_CENTS = 17982;

export function monthlyPriceCents(cadence: string): number {
  if (cadence === "daily") return DAILY_MONTHLY_CENTS;
  return Math.round((ANCHOR_MONTHLY_CENTS * reportsPerMonth(cadence)) / ANCHOR_REPORTS);
}

export function priceCents(cadence: string, period: "monthly" | "annual"): number {
  if (cadence === "daily") {
    return period === "annual" ? DAILY_ANNUAL_CENTS : DAILY_MONTHLY_CENTS;
  }
  const monthly = monthlyPriceCents(cadence);
  return period === "annual" ? monthly * 9 : monthly;
}

export function stripeInterval(period: "monthly" | "annual"): "month" | "year" {
  return period === "annual" ? "year" : "month";
}
