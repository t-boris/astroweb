import type { SpendFeature } from "./wallet";

/**
 * Direct-purchase service catalog, proportional star redemption, and date-range
 * helpers (REQ-001..REQ-005, DEC-001..DEC-010).
 *
 * Single source of truth on the server: prices, full-redemption thresholds, and
 * calendar periods are always computed server-side (never trusted from clients).
 */

export type DirectServiceId =
  | "monthly_horoscope"
  | "yearly_horoscope"
  | "situation"
  | "relationship";

export type PeriodHoroscopeType = "month" | "year";

export interface DirectServiceSpec {
  id: DirectServiceId;
  /** Approved base price in USD cents. */
  basePriceCents: number;
  /** Number of stars that covers 100% of this service (DEC-004, DEC-006). */
  fullStarCost: number;
  /** "period" = one saved horoscope per (profile, calendar period); "forecast" = per-request 3-month forecast. */
  kind: "period" | "forecast";
  periodType?: PeriodHoroscopeType;
  /** Feature label written to the `starSpends` ledger. */
  spendFeature: SpendFeature;
  /** Profile tab where the user sees the result. */
  targetTab: "transits" | "oracle" | "compatibility";
}

const PERIOD_HOROSCOPE_PRICE = { basePriceCents: 399, fullStarCost: 4 };

export const DIRECT_SERVICES: Record<DirectServiceId, DirectServiceSpec> = {
  monthly_horoscope: {
    id: "monthly_horoscope",
    ...PERIOD_HOROSCOPE_PRICE,
    kind: "period",
    periodType: "month",
    spendFeature: "monthly_horoscope",
    targetTab: "transits",
  },
  yearly_horoscope: {
    id: "yearly_horoscope",
    ...PERIOD_HOROSCOPE_PRICE,
    kind: "period",
    periodType: "year",
    spendFeature: "yearly_horoscope",
    targetTab: "transits",
  },
  situation: {
    id: "situation",
    basePriceCents: 199,
    fullStarCost: 1,
    kind: "forecast",
    spendFeature: "oracle",
    targetTab: "oracle",
  },
  relationship: {
    id: "relationship",
    basePriceCents: 399,
    fullStarCost: 2,
    kind: "forecast",
    spendFeature: "relationship",
    targetTab: "compatibility",
  },
};

export function isDirectServiceId(value: unknown): value is DirectServiceId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DIRECT_SERVICES, value);
}

export function getDirectService(value: unknown): DirectServiceSpec | null {
  return isDirectServiceId(value) ? DIRECT_SERVICES[value] : null;
}

export type DirectPaymentPath = "usd_only" | "mixed" | "stars_only";

export interface DirectCheckoutQuote {
  service: DirectServiceId;
  basePriceCents: number;
  fullStarCost: number;
  availableStars: number;
  appliedStars: number;
  surplusStars: number;
  starDiscountCents: number;
  payableCents: number;
  paymentPath: DirectPaymentPath;
}

/**
 * Compute proportional automatic star redemption (DEC-003, DEC-004, DEC-006, DEC-010, REQ-005):
 *  - With 0 stars: full USD base price is payable.
 *  - With 0 < stars < fullStarCost: payable = round(basePrice * (1 - appliedStars / fullStarCost))
 *    in whole cents; starDiscount = basePrice - payable.
 *  - With stars >= fullStarCost: payable = 0, appliedStars = fullStarCost, surplus preserved.
 */
export function calculateDirectCheckoutQuote(
  serviceId: DirectServiceId,
  rawAvailableStars: number,
): DirectCheckoutQuote {
  const spec = DIRECT_SERVICES[serviceId];
  const availableStars = Math.max(0, Number.isFinite(rawAvailableStars) ? Math.floor(rawAvailableStars) : 0);
  const appliedStars = Math.min(availableStars, spec.fullStarCost);
  const surplusStars = availableStars - appliedStars;

  if (appliedStars >= spec.fullStarCost) {
    return {
      service: serviceId,
      basePriceCents: spec.basePriceCents,
      fullStarCost: spec.fullStarCost,
      availableStars,
      appliedStars,
      surplusStars,
      starDiscountCents: spec.basePriceCents,
      payableCents: 0,
      paymentPath: "stars_only",
    };
  }

  if (appliedStars === 0) {
    return {
      service: serviceId,
      basePriceCents: spec.basePriceCents,
      fullStarCost: spec.fullStarCost,
      availableStars,
      appliedStars: 0,
      surplusStars: availableStars,
      starDiscountCents: 0,
      payableCents: spec.basePriceCents,
      paymentPath: "usd_only",
    };
  }

  // Exact integer numerator before division avoids floating-point drift on (1 - a/b).
  const payableCents = Math.round(
    (spec.basePriceCents * (spec.fullStarCost - appliedStars)) / spec.fullStarCost,
  );
  const starDiscountCents = spec.basePriceCents - payableCents;

  return {
    service: serviceId,
    basePriceCents: spec.basePriceCents,
    fullStarCost: spec.fullStarCost,
    availableStars,
    appliedStars,
    surplusStars,
    starDiscountCents,
    payableCents,
    paymentPath: "mixed",
  };
}

// ---- Calendar & rolling date periods ----------------------------------------

export interface ServicePeriod {
  periodType: PeriodHoroscopeType | null;
  /** Stable calendar period id ("YYYY-MM" or "YYYY") for period horoscopes; null for rolling forecasts. */
  periodKey: string | null;
  /** Inclusive start date, YYYY-MM-DD (UTC). */
  periodStart: string;
  /** Inclusive end date, YYYY-MM-DD (UTC). */
  periodEnd: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function todayUtcIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function daysInMonthUtc(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

/**
 * Rolling three-month window starting from `startIso` (DEC-002).
 * Adds 3 calendar months and clamps to the target month's last day
 * (e.g. 2026-11-30 -> 2027-02-28).
 */
export function threeMonthPeriod(startIso: string): { periodStart: string; periodEnd: string } {
  const { year, month, day } = parseIsoDate(startIso);
  const totalMonths = year * 12 + (month - 1) + 3;
  const endYear = Math.floor(totalMonths / 12);
  const endMonth = (totalMonths % 12) + 1;
  const endDay = Math.min(day, daysInMonthUtc(endYear, endMonth));
  return {
    periodStart: startIso,
    periodEnd: `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`,
  };
}

/** Current calendar month (full month, including elapsed days; REQ-003). */
export function currentCalendarMonthPeriod(todayIso: string): ServicePeriod & { periodType: "month"; periodKey: string } {
  const { year, month } = parseIsoDate(todayIso);
  const lastDay = daysInMonthUtc(year, month);
  const ym = `${year}-${pad2(month)}`;
  return {
    periodType: "month",
    periodKey: ym,
    periodStart: `${ym}-01`,
    periodEnd: `${ym}-${pad2(lastDay)}`,
  };
}

/** Current calendar year (full year, including elapsed days; REQ-003). */
export function currentCalendarYearPeriod(todayIso: string): ServicePeriod & { periodType: "year"; periodKey: string } {
  const { year } = parseIsoDate(todayIso);
  const y = String(year);
  return {
    periodType: "year",
    periodKey: y,
    periodStart: `${y}-01-01`,
    periodEnd: `${y}-12-31`,
  };
}

export function periodForService(serviceId: DirectServiceId, todayIso: string = todayUtcIso()): ServicePeriod {
  if (serviceId === "monthly_horoscope") return currentCalendarMonthPeriod(todayIso);
  if (serviceId === "yearly_horoscope") return currentCalendarYearPeriod(todayIso);
  const rolling = threeMonthPeriod(todayIso);
  return { periodType: null, periodKey: null, ...rolling };
}

/** Human-readable date range label in Russian or English for prompts and Stripe descriptions. */
export function formatDateRangeLabel(periodStart: string, periodEnd: string, language: "en" | "ru"): string {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const start = fmt.format(new Date(`${periodStart}T12:00:00Z`));
  const end = fmt.format(new Date(`${periodEnd}T12:00:00Z`));
  return `${start} — ${end}`;
}

export function formatCalendarPeriodLabel(
  periodType: PeriodHoroscopeType,
  periodStart: string,
  language: "en" | "ru",
): string {
  const { year, month } = parseIsoDate(periodStart);
  if (periodType === "year") {
    return language === "ru" ? `${year} год` : `${year}`;
  }
  const locale = language === "ru" ? "ru-RU" : "en-US";
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 15)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}
