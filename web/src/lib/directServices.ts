/**
 * Client mirror of functions/src/services/directServices.ts: catalog,
 * proportional star redemption preview, and covered-date formatting
 * (REQ-001..REQ-005, DEC-001..DEC-010).
 *
 * The server always recomputes authoritative prices, redemption amounts, and
 * calendar dates; this module powers instant UI previews and unit tests.
 */

export type DirectServiceId =
  | "monthly_horoscope"
  | "yearly_horoscope"
  | "situation"
  | "relationship";

export type PeriodHoroscopeType = "month" | "year";
export type DirectPaymentPath = "usd_only" | "mixed" | "stars_only";

export interface DirectServiceMeta {
  id: DirectServiceId;
  basePriceCents: number;
  fullStarCost: number;
  kind: "period" | "forecast";
  periodType?: PeriodHoroscopeType;
}

export const DIRECT_SERVICES: Record<DirectServiceId, DirectServiceMeta> = {
  monthly_horoscope: {
    id: "monthly_horoscope",
    basePriceCents: 499,
    fullStarCost: 5,
    kind: "period",
    periodType: "month",
  },
  yearly_horoscope: {
    id: "yearly_horoscope",
    basePriceCents: 1999,
    fullStarCost: 20,
    kind: "period",
    periodType: "year",
  },
  situation: {
    id: "situation",
    basePriceCents: 199,
    fullStarCost: 1,
    kind: "forecast",
  },
  relationship: {
    id: "relationship",
    basePriceCents: 399,
    fullStarCost: 2,
    kind: "forecast",
  },
};

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

  const payableCents = Math.round(
    (spec.basePriceCents * (spec.fullStarCost - appliedStars)) / spec.fullStarCost,
  );
  return {
    service: serviceId,
    basePriceCents: spec.basePriceCents,
    fullStarCost: spec.fullStarCost,
    availableStars,
    appliedStars,
    surplusStars,
    starDiscountCents: spec.basePriceCents - payableCents,
    payableCents,
    paymentPath: "mixed",
  };
}

export function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function todayUtcIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { year: 2026, month: 1, day: 1 };
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function daysInMonthUtc(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function threeMonthPeriod(startIso: string = todayUtcIso()): { periodStart: string; periodEnd: string } {
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

export function currentCalendarMonthPeriod(todayIso: string = todayUtcIso()): {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
} {
  const { year, month } = parseIsoDate(todayIso);
  const ym = `${year}-${pad2(month)}`;
  return {
    periodKey: ym,
    periodStart: `${ym}-01`,
    periodEnd: `${ym}-${pad2(daysInMonthUtc(year, month))}`,
  };
}

export function currentCalendarYearPeriod(todayIso: string = todayUtcIso()): {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
} {
  const { year } = parseIsoDate(todayIso);
  const y = String(year);
  return {
    periodKey: y,
    periodStart: `${y}-01-01`,
    periodEnd: `${y}-12-31`,
  };
}

export function formatDateRange(periodStart: string, periodEnd: string, language: "en" | "ru"): string {
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

export function formatSingleDate(iso: string, language: "en" | "ru"): string {
  const locale = language === "ru" ? "ru-RU" : "en-US";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function formatCalendarPeriodTitle(
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
