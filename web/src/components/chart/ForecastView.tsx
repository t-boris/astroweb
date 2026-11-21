import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, CheckCircle2, RefreshCw, Sparkles, ArrowRight, History } from "lucide-react";
import { toAppLanguage } from "@/lib/language";
import { getForecast } from "@/api/forecast";
import {
  cancelDirectCheckout,
  fulfillDirectOrder,
  listProfileHoroscopes,
  type PeriodHoroscopeItem,
  type RecoverableDirectOrder,
} from "@/api/directCheckout";
import {
  calculateDirectCheckoutQuote,
  currentCalendarMonthPeriod,
  currentCalendarYearPeriod,
  formatCalendarPeriodTitle,
  formatDateRange,
  formatSingleDate,
  formatUsdCents,
  todayUtcIso,
  type DirectServiceId,
} from "@/lib/directServices";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";
import { ensureSignedIn } from "@/lib/contentSync";
import { trackEvent, trackOnce } from "@/lib/analytics";
import { AiReading } from "@/components/AiReading";
import { HelpBubble } from "@/components/HelpBubble";
import { DirectCheckoutDialog } from "@/components/DirectCheckoutDialog";
import { Button } from "@/components/ui/button";

export interface ForecastViewProps {
  profileId: string;
  profileName?: string;
  ownerDeviceId: string;
  tokens?: number;
  relocationLat?: number | null;
  relocationLng?: number | null;
  onBalanceChanged?: () => void;
  onOpenDailySubscription?: () => void;
  pendingDirectOrderId?: string | null;
  pendingCheckoutStatus?: "success" | "cancel" | null;
  onClearPendingOrder?: () => void;
}

type ActivePeriodTab = "day" | "month" | "year";

export function ForecastView({
  profileId,
  profileName,
  ownerDeviceId,
  tokens = 0,
  relocationLat,
  relocationLng,
  onBalanceChanged,
  onOpenDailySubscription,
  pendingDirectOrderId,
  pendingCheckoutStatus,
  onClearPendingOrder,
}: ForecastViewProps) {
  const { t, i18n } = useTranslation();
  const language = toAppLanguage(i18n.resolvedLanguage);
  const { user } = useAuthUser();

  const [selectedPeriod, setSelectedPeriod] = useState<ActivePeriodTab>("day");
  const [text, setText] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => currentCalendarMonthPeriod());
  const [currentYear, setCurrentYear] = useState(() => currentCalendarYearPeriod());
  const [horoscopes, setHoroscopes] = useState<PeriodHoroscopeItem[]>([]);
  const [recoverableOrders, setRecoverableOrders] = useState<RecoverableDirectOrder[]>([]);
  const [loadingPeriodData, setLoadingPeriodData] = useState(false);

  const [checkoutService, setCheckoutService] = useState<DirectServiceId | null>(null);
  const [fulfillingOrderId, setFulfillingOrderId] = useState<string | null>(null);
  const [fulfillError, setFulfillError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState(false);
  const [openedPastKey, setOpenedPastKey] = useState<string | null>(null);

  // Free horoscope for today (reuses existing getForecast + local day cache; REQ-003 AC #2).
  useEffect(() => {
    let cancelled = false;
    const today = todayUtcIso();
    const cacheKey = `astroweb:forecast:v2:${profileId}:${language}:${today}`;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { text: string; date: string };
        setText(cached.text);
        setDate(cached.date);
        setLoading(false);
        return () => {
          cancelled = true;
        };
      }
    } catch {
      /* ignore corrupt cache */
    }

    setLoading(true);
    setError(null);
    getForecast({ profileId, ownerDeviceId, language })
      .then((r) => {
        if (cancelled) return;
        setText(r.text);
        setDate(r.date);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ text: r.text, date: r.date }));
        } catch {
          /* non-fatal */
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, ownerDeviceId, language]);

  const reloadHoroscopes = useCallback(async () => {
    setLoadingPeriodData(true);
    try {
      const res = await listProfileHoroscopes(profileId, ownerDeviceId);
      setCurrentMonth(res.currentMonth);
      setCurrentYear(res.currentYear);
      setHoroscopes(res.horoscopes);
      setRecoverableOrders(
        res.recoverableOrders.filter(
          (o) => o.service === "monthly_horoscope" || o.service === "yearly_horoscope",
        ),
      );
    } catch {
      /* keep local date defaults */
    } finally {
      setLoadingPeriodData(false);
    }
  }, [profileId, ownerDeviceId]);

  useEffect(() => {
    void reloadHoroscopes();
  }, [reloadHoroscopes, user?.uid]);

  useEffect(() => {
    const onSignedIn = () => void reloadHoroscopes();
    window.addEventListener("astroweb:signed-in", onSignedIn);
    return () => window.removeEventListener("astroweb:signed-in", onSignedIn);
  }, [reloadHoroscopes]);

  const runFulfill = useCallback(
    async (orderId: string) => {
      setFulfillingOrderId(orderId);
      setFulfillError(null);
      setCancelNotice(false);
      try {
        const res = await fulfillDirectOrder(orderId);
        if (res.service === "monthly_horoscope") setSelectedPeriod("month");
        if (res.service === "yearly_horoscope") setSelectedPeriod("year");
        if (res.status === "completed") {
          trackEvent("ai_reading_requested", {
            kind: res.service === "yearly_horoscope" ? "yearly_horoscope" : "monthly_horoscope",
          });
          await reloadHoroscopes();
          onBalanceChanged?.();
          window.dispatchEvent(new Event("astroweb:stars-changed"));
        } else if (res.status === "awaiting_payment" || res.status === "pending") {
          await reloadHoroscopes();
          setFulfillError(
            t(
              res.status === "pending" ? "directCheckout.generationInProgress" : "directCheckout.stillProcessing",
              res.status === "pending"
                ? "Прогноз формируется. Подождите немного и нажмите «Повторить». Повторная оплата не нужна."
                : "Платёж обрабатывается. Нажмите «Повторить», чтобы получить готовый гороскоп без повторной оплаты.",
            ),
          );
        }
      } catch {
        await reloadHoroscopes();
        setFulfillError(
          t(
            "directCheckout.generationFailedRecoverable",
            "Не удалось сформировать гороскоп. Ваша оплата сохранена — нажмите «Повторить генерацию», повторная оплата и списание звёзд не требуются.",
          ),
        );
      } finally {
        setFulfillingOrderId(null);
      }
    },
    [onBalanceChanged, reloadHoroscopes, t],
  );

  // Handle return from Stripe Checkout on the Horoscopes tab.
  useEffect(() => {
    if (!pendingDirectOrderId || !pendingCheckoutStatus) return;
    if (pendingCheckoutStatus === "cancel") {
      setCancelNotice(true);
      void cancelDirectCheckout(pendingDirectOrderId)
        .catch(() => {})
        .finally(() => {
          void reloadHoroscopes();
          onClearPendingOrder?.();
        });
      return;
    }
    if (pendingCheckoutStatus === "success") {
      onClearPendingOrder?.();
      void runFulfill(pendingDirectOrderId);
    }
  }, [pendingDirectOrderId, pendingCheckoutStatus, onClearPendingOrder, reloadHoroscopes, runFulfill]);

  const currentMonthItem = horoscopes.find((h) => h.periodKey === currentMonth.periodKey) ?? null;
  const currentYearItem = horoscopes.find((h) => h.periodKey === currentYear.periodKey) ?? null;
  const pastHoroscopes = horoscopes.filter(
    (h) =>
      h.status === "completed" &&
      h.periodKey !== currentMonth.periodKey &&
      h.periodKey !== currentYear.periodKey,
  );

  // Funnel: paywall_viewed when viewing an unpurchased monthly/yearly period.
  useEffect(() => {
    if (selectedPeriod === "month" && currentMonthItem?.status !== "completed") {
      trackOnce(profileId, "paywall_viewed", { feature: "monthly_horoscope" });
    }
    if (selectedPeriod === "year" && currentYearItem?.status !== "completed") {
      trackOnce(profileId, "paywall_viewed", { feature: "yearly_horoscope" });
    }
  }, [selectedPeriod, currentMonthItem?.status, currentYearItem?.status, profileId]);

  async function handleStartPurchase(service: "monthly_horoscope" | "yearly_horoscope") {
    setFulfillError(null);
    setCancelNotice(false);
    // Paid actions require sign-in; open Google popup directly inside the click handler.
    if (!auth.currentUser) {
      const ok = await ensureSignedIn(ownerDeviceId);
      if (!ok) return;
      onBalanceChanged?.();
      await reloadHoroscopes();
    }
    setCheckoutService(service);
  }

  function renderPeriodOfferCard(
    periodType: "month" | "year",
    service: "monthly_horoscope" | "yearly_horoscope",
    periodInfo: { periodKey: string; periodStart: string; periodEnd: string },
    saved: PeriodHoroscopeItem | null,
  ) {
    const quote = calculateDirectCheckoutQuote(service, tokens);
    const title = t(periodType === "month" ? "horoscopes.monthTitle" : "horoscopes.yearTitle");
    const periodName = formatCalendarPeriodTitle(periodType, periodInfo.periodStart, language);
    const dateRange = formatDateRange(periodInfo.periodStart, periodInfo.periodEnd, language);
    const isGenerating =
      fulfillingOrderId !== null && (saved?.orderId === fulfillingOrderId || fulfillingOrderId !== null);

    // 1. Already purchased and completed: open immediately without checkout/charge/stars (DEC-007).
    if (saved?.status === "completed" && saved.text) {
      return (
        <div
          className="ds-card space-y-4 p-4 sm:p-6"
          data-testid={`horoscope-result-${periodType}`}
          style={{ background: "linear-gradient(120deg, rgba(91,141,239,0.12), rgba(232,201,105,0.06))" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-2.5 py-0.5 text-[11px] font-medium text-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("horoscopes.savedBadge", "Сохранён — повторное открытие бесплатно")}
              </div>
              <h3 className="mt-2 font-serif text-xl text-[#8fb6ff]">
                {title} · {periodName}
              </h3>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-[#8fb6ff]" />
                {t("directCheckout.coveredDates", "Охватываемые даты")}: {dateRange}
              </p>
            </div>
          </div>
          <AiReading text={saved.text} />
        </div>
      );
    }

    // 2. Paid, pending or failed generation: block second purchase and allow free retry (REQ-003 AC #7-#8).
    const recoverable =
      recoverableOrders.find((o) => o.periodKey === periodInfo.periodKey) ??
      (saved && (saved.status === "paid_pending" || saved.status === "failed")
        ? { orderId: saved.orderId, lastError: saved.lastError }
        : null);

    if (recoverable) {
      return (
        <div
          className="ds-card space-y-3 border-[#e8c969]/40 p-5 sm:p-6"
          data-testid={`horoscope-recovery-${periodType}`}
        >
          <h3 className="font-serif text-xl text-[#e8c969]">
            {title} · {periodName}
          </h3>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 text-[#8fb6ff]" />
            {t("directCheckout.coveredDates", "Охватываемые даты")}: {dateRange}
          </p>
          <p className="text-sm text-foreground">
            {fulfillingOrderId === recoverable.orderId
              ? t("horoscopes.generatingPaid", "Готовим ваш персональный гороскоп… это займёт меньше минуты.")
              : t(
                  "horoscopes.paidRecoveryNote",
                  "Этот период уже оплачен. Повторная покупка не нужна — нажмите ниже, чтобы завершить генерацию по вашему заказу без доплаты и списания звёзд.",
                )}
          </p>
          <Button
            type="button"
            disabled={fulfillingOrderId === recoverable.orderId}
            onClick={() => void runFulfill(recoverable.orderId)}
            className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]"
            data-testid={`horoscope-retry-${periodType}`}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${fulfillingOrderId === recoverable.orderId ? "animate-spin" : ""}`} />
            {fulfillingOrderId === recoverable.orderId
              ? t("horoscopes.generatingButton", "Формируем гороскоп…")
              : t("horoscopes.retryGeneration", "Повторить генерацию (уже оплачено)")}
          </Button>
        </div>
      );
    }

    // 3. Not purchased yet: show dates, base price, automatic star preview, and direct-checkout CTA.
    return (
      <div
        className="ds-card space-y-4 border-[#e8c969]/30 p-5 sm:p-6"
        data-testid={`horoscope-offer-${periodType}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8c969]/40 bg-[#e8c969]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#e8c969]">
              <Sparkles className="h-3 w-3" />
              {t("horoscopes.oneTimeNoSub", "Разовая покупка · подписка не нужна")}
            </div>
            <h3 className="font-serif text-2xl text-foreground">
              {title} · {periodName}
            </h3>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8fb6ff]">
              <Calendar className="h-3.5 w-3.5" />
              {t("directCheckout.coveredDates", "Охватываемые даты")}: {dateRange}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                periodType === "month" ? "horoscopes.monthDesc" : "horoscopes.yearDesc",
              )}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("horoscopes.basePriceLabel", "Цена")}
            </div>
            <div className="font-serif text-2xl font-bold text-foreground">
              {formatUsdCents(quote.basePriceCents)}
            </div>
            <div className="text-xs text-[#e8c969]">
              {t("horoscopes.orStars", {
                count: quote.fullStarCost,
                defaultValue: `или ✦${quote.fullStarCost}`,
              })}
            </div>
          </div>
        </div>

        {/* Automatic star preview */}
        {tokens > 0 && (
          <div className="rounded-xl border border-[#e8c969]/30 bg-[#e8c969]/[0.07] px-3.5 py-2.5 text-xs text-foreground">
            {quote.payableCents === 0
              ? t("horoscopes.starsCoverFull", {
                  applied: quote.appliedStars,
                  surplus: quote.surplusStars,
                  defaultValue: `Ваших звёзд достаточно: спишется ✦${quote.appliedStars}, к оплате $0.00.`,
                })
              : t("horoscopes.starsCoverPartial", {
                  applied: quote.appliedStars,
                  discount: formatUsdCents(quote.starDiscountCents),
                  payable: formatUsdCents(quote.payableCents),
                  defaultValue: `Звёзды ✦${quote.appliedStars} применятся автоматически (−${formatUsdCents(quote.starDiscountCents)}), к оплате ${formatUsdCents(quote.payableCents)}.`,
                })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t(
            "horoscopes.elapsedIncludedNote",
            "Гороскоп охватывает весь выбранный календарный период целиком, включая уже прошедшие дни, и сохраняется для этого профиля навсегда.",
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={isGenerating || loadingPeriodData}
            onClick={() => void handleStartPurchase(service)}
            data-testid={`horoscope-buy-${periodType}`}
            className="bg-[#e8c969] font-semibold text-[#1a1606] hover:bg-[#f2dd9a]"
          >
            {quote.payableCents === 0 && user
              ? t("horoscopes.getWithStars", {
                  stars: quote.appliedStars,
                  defaultValue: `Получить за ✦${quote.appliedStars} ($0.00)`,
                })
              : t("horoscopes.buyCta", {
                  amount: formatUsdCents(quote.payableCents),
                  defaultValue: `Получить за ${formatUsdCents(quote.payableCents)}`,
                })}
          </Button>
        </div>
      </div>
    );
  }

  const monthQuote = calculateDirectCheckoutQuote("monthly_horoscope", tokens);
  const yearQuote = calculateDirectCheckoutQuote("yearly_horoscope", tokens);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.28em] text-[#8fb6ff]">
          ✦ {t("forecast.eyebrow", "Гороскопы")}
        </div>
        <HelpBubble helpKey="transits.title">
          <h2 className="font-serif text-2xl text-foreground">
            {t("forecast.title", "Персональные гороскопы")}
          </h2>
        </HelpBubble>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "forecast.subtitle",
            "Бесплатный гороскоп на сегодня и подробные персональные гороскопы на текущий месяц и год по вашей натальной карте.",
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="tablist" aria-label={t("forecast.title")}>
        <button
          type="button"
          role="tab"
          aria-selected={selectedPeriod === "day"}
          onClick={() => setSelectedPeriod("day")}
          data-testid="period-card-day"
          className={`rounded-2xl border p-4 text-left transition-all ${
            selectedPeriod === "day"
              ? "border-primary bg-primary/15 shadow-[0_0_24px_-10px_rgba(91,141,239,0.65)]"
              : "border-border/60 bg-background/40 hover:border-primary/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-base text-foreground">
              {t("horoscopes.dayTitle", "Гороскоп на день")}
            </span>
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              {t("horoscopes.freeBadge", "Бесплатно")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatSingleDate(date ?? todayUtcIso(), language)}
          </p>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedPeriod === "month"}
          onClick={() => setSelectedPeriod("month")}
          data-testid="period-card-month"
          className={`rounded-2xl border p-4 text-left transition-all ${
            selectedPeriod === "month"
              ? "border-[#e8c969] bg-[#e8c969]/12 shadow-[0_0_24px_-10px_rgba(232,201,105,0.55)]"
              : "border-border/60 bg-background/40 hover:border-[#e8c969]/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-base text-foreground">
              {t("horoscopes.monthTitle", "Гороскоп на месяц")}
            </span>
            {currentMonthItem?.status === "completed" ? (
              <span className="rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-300">
                {t("horoscopes.ownedShort", "Открыт")}
              </span>
            ) : (
              <span className="text-xs font-semibold text-[#e8c969]">
                {formatUsdCents(monthQuote.basePriceCents)} · ✦{monthQuote.fullStarCost}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateRange(currentMonth.periodStart, currentMonth.periodEnd, language)}
          </p>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={selectedPeriod === "year"}
          onClick={() => setSelectedPeriod("year")}
          data-testid="period-card-year"
          className={`rounded-2xl border p-4 text-left transition-all ${
            selectedPeriod === "year"
              ? "border-[#e8c969] bg-[#e8c969]/12 shadow-[0_0_24px_-10px_rgba(232,201,105,0.55)]"
              : "border-border/60 bg-background/40 hover:border-[#e8c969]/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-base text-foreground">
              {t("horoscopes.yearTitle", "Гороскоп на год")}
            </span>
            {currentYearItem?.status === "completed" ? (
              <span className="rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-300">
                {t("horoscopes.ownedShort", "Открыт")}
              </span>
            ) : (
              <span className="text-xs font-semibold text-[#e8c969]">
                {formatUsdCents(yearQuote.basePriceCents)} · ✦{yearQuote.fullStarCost}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateRange(currentYear.periodStart, currentYear.periodEnd, language)}
          </p>
        </button>
      </div>

      {cancelNotice && (
        <div
          className="rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground"
          data-testid="direct-checkout-cancel-notice"
        >
          {t(
            "directCheckout.canceledNotice",
            "Оплата отменена. Деньги не списаны, а все ваши звёзды остались на балансе.",
          )}
        </div>
      )}

      {fulfillingOrderId && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-[#8fb6ff]">
          {t("horoscopes.generatingPaid", "Готовим ваш персональный гороскоп… это займёт меньше минуты.")}
        </div>
      )}

      {fulfillError && <p className="text-sm text-destructive">{fulfillError}</p>}

      {/* Active Period Content */}
      {selectedPeriod === "day" && (
        <div className="space-y-4">
          {loading && (
            <p className="text-muted-foreground">{t("forecast.loading", "Читаем сегодняшнее небо…")}</p>
          )}
          {error && <p className="text-destructive">{t("errors.unknownError")}</p>}

          {!loading && !error && text && (
            <div
              className="ds-card space-y-3 p-4 sm:p-6"
              style={{ background: "linear-gradient(120deg, rgba(91,141,239,0.12), rgba(140,165,235,0.04))" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🌙</span>
                  <div>
                    <HelpBubble helpKey="transits.today">
                      <h3 className="font-serif text-xl text-[#8fb6ff]">
                        {t("forecast.todayTitle", "Гороскоп на сегодня")}
                      </h3>
                    </HelpBubble>
                    {date && (
                      <p className="text-xs text-muted-foreground">
                        {formatSingleDate(date, language)}
                      </p>
                    )}
                  </div>
                </div>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                  {t("horoscopes.freeBadge", "Бесплатно")}
                </span>
              </div>
              <AiReading text={text} />
            </div>
          )}

          {/* Clear distinction between free horoscope for today and recurring daily subscription (REQ-004 AC #1) */}
          <div className="rounded-2xl border border-[#e8c969]/25 bg-gradient-to-r from-[#5b8def]/10 to-[#e8c969]/[0.07] p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("horoscopes.dailySubBannerTitle", "Хотите подробные персональные письма каждый день?")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "horoscopes.dailySubBannerDesc",
                  "«Гороскоп на день» выше — бесплатный короткий прогноз на сегодня. Подписка «Ежедневный гороскоп» присылает глубокие письма личного астролога каждый день в приложение, на email и в push-уведомления.",
                )}
              </p>
            </div>
            {onOpenDailySubscription && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenDailySubscription}
                className="mt-3 shrink-0 border-[#e8c969]/50 text-[#e8c969] hover:bg-[#e8c969]/15 sm:mt-0"
              >
                {t("horoscopes.dailySubBannerCta", "Ежедневный гороскоп")}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {selectedPeriod === "month" &&
        renderPeriodOfferCard("month", "monthly_horoscope", currentMonth, currentMonthItem)}

      {selectedPeriod === "year" &&
        renderPeriodOfferCard("year", "yearly_horoscope", currentYear, currentYearItem)}

      {/* Saved past-period horoscopes archive (DEC-007, REQ-003 AC #6, REQ-005 AC #11) */}
      {pastHoroscopes.length > 0 && (
        <section className="space-y-3 border-t border-border/40 pt-5" data-testid="past-horoscopes-archive">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <History className="h-3.5 w-3.5 text-[#8fb6ff]" />
            {t("horoscopes.savedArchiveTitle", "Сохранённые гороскопы за прошлые периоды")}
          </div>
          <div className="space-y-3">
            {pastHoroscopes.map((item) => {
              const isOpen = openedPastKey === item.periodKey;
              const periodTitle = formatCalendarPeriodTitle(item.periodType, item.periodStart, language);
              const range = formatDateRange(item.periodStart, item.periodEnd, language);
              return (
                <div key={item.periodKey} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-serif text-base text-foreground">
                        {t(item.periodType === "month" ? "horoscopes.monthTitle" : "horoscopes.yearTitle")} ·{" "}
                        {periodTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">{range}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenedPastKey(isOpen ? null : item.periodKey)}
                    >
                      {isOpen
                        ? t("ai.collapseExplanation")
                        : t("horoscopes.openSaved", "Открыть сохранённый")}
                    </Button>
                  </div>
                  {isOpen && item.text && (
                    <div className="mt-4 border-t border-border/40 pt-4">
                      <AiReading text={item.text} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {checkoutService && (
        <DirectCheckoutDialog
          open={checkoutService !== null}
          onClose={() => setCheckoutService(null)}
          profileId={profileId}
          profileName={profileName}
          service={checkoutService}
          initialStars={tokens}
          relocationLat={relocationLat}
          relocationLng={relocationLng}
          onOrderReadyToFulfill={(orderId) => {
            void runFulfill(orderId);
          }}
          onExistingHoroscope={() => {
            void reloadHoroscopes();
          }}
        />
      )}
    </div>
  );
}
