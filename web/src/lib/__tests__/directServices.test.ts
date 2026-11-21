import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ functions: {} }));

import {
  DIRECT_SERVICES,
  calculateDirectCheckoutQuote,
  currentCalendarMonthPeriod,
  currentCalendarYearPeriod,
  formatUsdCents,
  threeMonthPeriod,
} from "@/lib/directServices";
import {
  annualPriceUsd,
  monthlyPriceUsd,
  showAnnualFreeMonthsLabel,
} from "@/api/astrologer";

describe("directServices client catalog and proportional star redemption (REQ-003, REQ-005, DEC-010)", () => {
  it("matches approved USD base prices and full star thresholds", () => {
    expect(DIRECT_SERVICES.monthly_horoscope).toEqual({
      id: "monthly_horoscope",
      basePriceCents: 399,
      fullStarCost: 4,
      kind: "period",
      periodType: "month",
    });
    expect(DIRECT_SERVICES.yearly_horoscope).toEqual({
      id: "yearly_horoscope",
      basePriceCents: 399,
      fullStarCost: 4,
      kind: "period",
      periodType: "year",
    });
    expect(DIRECT_SERVICES.situation).toEqual({
      id: "situation",
      basePriceCents: 199,
      fullStarCost: 1,
      kind: "forecast",
    });
    expect(DIRECT_SERVICES.relationship).toEqual({
      id: "relationship",
      basePriceCents: 399,
      fullStarCost: 2,
      kind: "forecast",
    });
  });

  it("charges full USD base price when balance is 0 stars", () => {
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 0)).toMatchObject({
      appliedStars: 0,
      starDiscountCents: 0,
      payableCents: 399,
      surplusStars: 0,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 0)).toMatchObject({
      appliedStars: 0,
      starDiscountCents: 0,
      payableCents: 399,
      surplusStars: 0,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("situation", 0)).toMatchObject({
      appliedStars: 0,
      starDiscountCents: 0,
      payableCents: 199,
      surplusStars: 0,
      paymentPath: "usd_only",
    });
    expect(calculateDirectCheckoutQuote("relationship", 0)).toMatchObject({
      appliedStars: 0,
      starDiscountCents: 0,
      payableCents: 399,
      surplusStars: 0,
      paymentPath: "usd_only",
    });
  });

  it("applies exact proportional rounding for partial star balances", () => {
    // Monthly with 2 of 4 stars -> $2.00 payable.
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 2)).toMatchObject({
      appliedStars: 2,
      starDiscountCents: 199,
      payableCents: 200,
      surplusStars: 0,
      paymentPath: "mixed",
    });

    // Yearly with 3 of 4 stars -> $1.00 payable.
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 3)).toMatchObject({
      appliedStars: 3,
      starDiscountCents: 299,
      payableCents: 100,
      surplusStars: 0,
      paymentPath: "mixed",
    });

    // 1 star on relationship ($3.99 / 2★) -> half rounded to nearest cent = $2.00
    expect(calculateDirectCheckoutQuote("relationship", 1)).toMatchObject({
      appliedStars: 1,
      starDiscountCents: 199,
      payableCents: 200,
      surplusStars: 0,
      paymentPath: "mixed",
    });
  });

  it("charges $0.00 and preserves surplus stars when balance meets or exceeds full redemption", () => {
    expect(calculateDirectCheckoutQuote("situation", 4)).toMatchObject({
      appliedStars: 1,
      starDiscountCents: 199,
      payableCents: 0,
      surplusStars: 3,
      paymentPath: "stars_only",
    });
    expect(calculateDirectCheckoutQuote("monthly_horoscope", 4)).toMatchObject({
      appliedStars: 4,
      starDiscountCents: 399,
      payableCents: 0,
      surplusStars: 0,
      paymentPath: "stars_only",
    });
    expect(calculateDirectCheckoutQuote("yearly_horoscope", 9)).toMatchObject({
      appliedStars: 4,
      starDiscountCents: 399,
      payableCents: 0,
      surplusStars: 5,
      paymentPath: "stars_only",
    });
  });

  it("formats USD cents cleanly", () => {
    expect(formatUsdCents(0)).toBe("$0.00");
    expect(formatUsdCents(199)).toBe("$1.99");
    expect(formatUsdCents(200)).toBe("$2.00");
    expect(formatUsdCents(1999)).toBe("$19.99");
  });

  it("computes calendar month, calendar year, and rolling 3-month date ranges", () => {
    expect(currentCalendarMonthPeriod("2026-02-15")).toEqual({
      periodKey: "2026-02",
      periodStart: "2026-02-01",
      periodEnd: "2026-02-28",
    });
    expect(currentCalendarMonthPeriod("2024-02-10")).toEqual({
      periodKey: "2024-02",
      periodStart: "2024-02-01",
      periodEnd: "2024-02-29",
    });
    expect(currentCalendarYearPeriod("2026-11-19")).toEqual({
      periodKey: "2026",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    expect(threeMonthPeriod("2026-11-30")).toEqual({
      periodStart: "2026-11-30",
      periodEnd: "2027-02-28",
    });
  });
});

describe("Daily horoscope subscription pricing (REQ-004, DEC-005)", () => {
  it("prices daily subscription at $30.00/mo and $179.82/yr without free-month labels", () => {
    expect(monthlyPriceUsd("daily")).toBe(30);
    expect(annualPriceUsd("daily")).toBe(179.82);
    expect(showAnnualFreeMonthsLabel("daily")).toBe(false);
  });

  it("preserves existing cadences and free-month label behavior for non-daily cadences", () => {
    expect(monthlyPriceUsd("every_2_days")).toBe(9.99);
    expect(annualPriceUsd("every_2_days")).toBe(89.91);
    expect(showAnnualFreeMonthsLabel("every_2_days")).toBe(true);

    expect(monthlyPriceUsd("weekly")).toBe(2.66);
    expect(annualPriceUsd("weekly")).toBe(23.94);
    expect(showAnnualFreeMonthsLabel("weekly")).toBe(true);
  });
});
