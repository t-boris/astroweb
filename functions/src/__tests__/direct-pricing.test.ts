import { describe, expect, it } from "vitest";
import {
  calculateDirectCheckoutQuote,
  currentCalendarMonthPeriod,
  currentCalendarYearPeriod,
  DIRECT_SERVICES,
  periodForService,
  threeMonthPeriod,
} from "../services/directServices";
import { monthlyPriceCents, priceCents, stripeInterval } from "../services/pricing";

describe("daily horoscope subscription pricing (REQ-004, DEC-005)", () => {
  it("charges $30.00 monthly and $179.82 annually for new daily subscribers", () => {
    expect(monthlyPriceCents("daily")).toBe(3000);
    expect(priceCents("daily", "monthly")).toBe(3000);
    expect(priceCents("daily", "annual")).toBe(17982);
    expect(stripeInterval("monthly")).toBe("month");
    expect(stripeInterval("annual")).toBe("year");
  });

  it("leaves non-daily cadence pricing unchanged", () => {
    expect(monthlyPriceCents("every_2_days")).toBe(999);
    expect(priceCents("every_2_days", "annual")).toBe(8991);
    expect(monthlyPriceCents("weekly")).toBe(266);
    expect(priceCents("weekly", "annual")).toBe(2394);
  });
});

describe("direct checkout proportional star redemption (REQ-003, REQ-005, DEC-003, DEC-004, DEC-006, DEC-010)", () => {
  it("uses the approved catalog prices and star thresholds", () => {
    expect(DIRECT_SERVICES.monthly_horoscope).toMatchObject({ basePriceCents: 499, fullStarCost: 5 });
    expect(DIRECT_SERVICES.yearly_horoscope).toMatchObject({ basePriceCents: 1999, fullStarCost: 20 });
    expect(DIRECT_SERVICES.situation).toMatchObject({ basePriceCents: 199, fullStarCost: 1 });
    expect(DIRECT_SERVICES.relationship).toMatchObject({ basePriceCents: 399, fullStarCost: 2 });
  });

  it("charges full USD base price when the user has 0 stars", () => {
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 0)).toMatchObject({
      appliedStars: 0,
      starDiscountCents: 0,
      payableCents: 499,
      surplusStars: 0,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 0)).toMatchObject({
      appliedStars: 0,
      payableCents: 1999,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("situation", 0)).toMatchObject({
      appliedStars: 0,
      payableCents: 199,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("relationship", 0)).toMatchObject({
      appliedStars: 0,
      payableCents: 399,
      paymentPath: "usd_only",
    });
  });

  it("applies partial stars proportionally with cent rounding (REQ-005 AC #6 and #7)", () => {
    // Monthly ($4.99, 5★) with 2 stars -> $2.99 payable
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 2)).toMatchObject({
      appliedStars: 2,
      starDiscountCents: 200,
      payableCents: 299,
      surplusStars: 0,
      paymentPath: "mixed",
    });

    // Yearly ($19.99, 20★) with 5 stars -> $14.99 payable
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 5)).toMatchObject({
      appliedStars: 5,
      starDiscountCents: 500,
      payableCents: 1499,
      surplusStars: 0,
      paymentPath: "mixed",
    });

    // Relationship ($3.99, 2★) with 1 star -> half of $3.99 rounded to nearest cent = $2.00
    expect(calculateDirectCheckoutQuote("relationship", 1)).toMatchObject({
      appliedStars: 1,
      starDiscountCents: 199,
      payableCents: 200,
      surplusStars: 0,
      paymentPath: "mixed",
    });
  });

  it("charges $0, deducts exact required stars, and preserves surplus when balance >= threshold", () => {
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 8)).toMatchObject({
      appliedStars: 5,
      starDiscountCents: 499,
      payableCents: 0,
      surplusStars: 3,
      paymentPath: "stars_only",
    });
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 20)).toMatchObject({
      appliedStars: 20,
      starDiscountCents: 1999,
      payableCents: 0,
      surplusStars: 0,
      paymentPath: "stars_only",
    });
    expect(calculateDirectCheckoutQuote("situation", 4)).toMatchObject({
      appliedStars: 1,
      starDiscountCents: 199,
      payableCents: 0,
      surplusStars: 3,
      paymentPath: "stars_only",
    });
    expect(calculateDirectCheckoutQuote("relationship", 5)).toMatchObject({
      appliedStars: 2,
      starDiscountCents: 399,
      payableCents: 0,
      surplusStars: 3,
      paymentPath: "stars_only",
    });
  });

  it("keeps every partial-redemption USD charge at or above Stripe's $0.50 minimum", () => {
    for (const [id, spec] of Object.entries(DIRECT_SERVICES)) {
      for (let stars = 0; stars < spec.fullStarCost; stars += 1) {
        const quote = calculateDirectCheckoutQuote(id as keyof typeof DIRECT_SERVICES, stars);
        expect(quote.payableCents, `${id} with ${stars} stars`).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe("forecast and horoscope date periods (REQ-001, REQ-002, REQ-003, DEC-002)", () => {
  it("computes rolling 3-month periods with month-end clamping", () => {
    expect(threeMonthPeriod("2026-11-19")).toEqual({ periodStart: "2026-11-19", periodEnd: "2027-02-19" });
    expect(threeMonthPeriod("2026-11-30")).toEqual({ periodStart: "2026-11-30", periodEnd: "2027-02-28" });
    expect(threeMonthPeriod("2027-11-30")).toEqual({ periodStart: "2027-11-30", periodEnd: "2028-02-29" });
  });

  it("computes full current calendar month and current calendar year including elapsed days", () => {
    expect(currentCalendarMonthPeriod("2026-11-19")).toEqual({
      periodType: "month",
      periodKey: "2026-11",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
    });
    expect(currentCalendarMonthPeriod("2028-02-10")).toEqual({
      periodType: "month",
      periodKey: "2028-02",
      periodStart: "2028-02-01",
      periodEnd: "2028-02-29",
    });
    expect(currentCalendarYearPeriod("2026-11-19")).toEqual({
      periodType: "year",
      periodKey: "2026",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
  });

  it("resolves the right period shape per direct service", () => {
    expect(periodForService("monthly_horoscope", "2026-11-19")).toMatchObject({ periodKey: "2026-11" });
    expect(periodForService("yearly_horoscope", "2026-11-19")).toMatchObject({ periodKey: "2026" });
    expect(periodForService("situation", "2026-11-19")).toEqual({
      periodType: null,
      periodKey: null,
      periodStart: "2026-11-19",
      periodEnd: "2027-02-19",
    });
  });
});
