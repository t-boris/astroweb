import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { Sparkles, X, Calendar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toAppLanguage } from "@/lib/language";
import { getCheckoutAnalytics, trackEvent } from "@/lib/analytics";
import {
  calculateDirectCheckoutQuote,
  currentCalendarMonthPeriod,
  currentCalendarYearPeriod,
  formatCalendarPeriodTitle,
  formatDateRange,
  formatUsdCents,
  threeMonthPeriod,
  type DirectCheckoutQuote,
  type DirectServiceId,
} from "@/lib/directServices";
import {
  createDirectCheckout,
  getDirectCheckoutQuote,
  type DirectPartnerInput,
  type PeriodHoroscopeItem,
} from "@/api/directCheckout";

export interface DirectCheckoutDialogProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  profileName?: string;
  service: DirectServiceId;
  /** Optimistic star balance shown while the live server quote loads. */
  initialStars: number;
  relocationLat?: number | null;
  relocationLng?: number | null;
  /** Required when service === "situation". */
  question?: string;
  /** Required when service === "relationship". */
  partner?: DirectPartnerInput;
  /** Called immediately when stars cover 100% (or an existing paid order needs fulfillment/retry). */
  onOrderReadyToFulfill: (orderId: string) => void;
  /** Called if the server reports this calendar-period horoscope is already saved. */
  onExistingHoroscope?: (horoscope: PeriodHoroscopeItem) => void;
}

function previewPeriod(service: DirectServiceId) {
  if (service === "monthly_horoscope") return currentCalendarMonthPeriod();
  if (service === "yearly_horoscope") return currentCalendarYearPeriod();
  const r = threeMonthPeriod();
  return { periodKey: null, ...r };
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Single direct-checkout confirmation modal for all four one-time offers
 * (REQ-003, REQ-005, DEC-001..DEC-010).
 *
 * Uses native `<dialog>` with `showModal()` (per modern-web-guidance `dialog`):
 * native top-layer, inert background, Esc dismissal, and focus restoration.
 */
export function DirectCheckoutDialog(props: DirectCheckoutDialogProps) {
  if (!props.open) return null;
  return <DirectCheckoutDialogOpen {...props} />;
}

function DirectCheckoutDialogOpen({
  open,
  onClose,
  profileId,
  profileName,
  service,
  initialStars,
  relocationLat,
  relocationLng,
  question,
  partner,
  onOrderReadyToFulfill,
  onExistingHoroscope,
}: DirectCheckoutDialogProps) {
  const { t, i18n } = useTranslation();
  const language = toAppLanguage(i18n.resolvedLanguage);
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const idemKeyRef = useRef<string>(makeIdempotencyKey());
  const pressedOutsideRef = useRef(false);

  const [quote, setQuote] = useState<DirectCheckoutQuote>(() =>
    calculateDirectCheckoutQuote(service, initialStars),
  );
  const [period, setPeriod] = useState(() => previewPeriod(service));
  const [existingHoroscope, setExistingHoroscope] = useState<PeriodHoroscopeItem | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null);

  // Open/close native <dialog> in sync with mount lifecycle.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
    };
  }, [open]);

  // Fetch authoritative live quote from the server when mounted.
  useEffect(() => {
    let cancelled = false;
    getDirectCheckoutQuote(profileId, service)
      .then((res) => {
        if (cancelled) return;
        setQuote(res.quote);
        setPeriod({
          periodKey: res.period.periodKey,
          periodStart: res.period.periodStart,
          periodEnd: res.period.periodEnd,
        });
        setExistingHoroscope(res.existingHoroscope);
      })
      .catch(() => {
        // Keep optimistic quote preview; server still re-verifies on confirm.
      })
      .finally(() => {
        if (!cancelled) setLoadingQuote(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId, service]);

  // Fallback light-dismiss where `closedby="any"` is unsupported (Safari).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const onDown = (e: PointerEvent) => {
      pressedOutsideRef.current = outside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (!submitting && pressedOutsideRef.current && outside(e)) {
        dialog.close();
      }
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, [submitting]);

  function handleNativeClose() {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = "";
    if (!submitting) onClose();
  }

  function handleNativeCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    if (submitting) {
      e.preventDefault();
    }
  }

  async function handleConfirm() {
    if (submitting || loadingQuote) return;
    setSubmitting(true);
    setError(null);
    setQuoteNotice(null);

    try {
      const analytics = await getCheckoutAnalytics();
      trackEvent("begin_checkout", {
        pack_id: service,
        value: quote.payableCents / 100,
        currency: "USD",
        items: [{ item_id: service }],
      });

      const res = await createDirectCheckout({
        profileId,
        service,
        language,
        relocationLat: relocationLat ?? null,
        relocationLng: relocationLng ?? null,
        ...(service === "situation" ? { question } : {}),
        ...(service === "relationship" ? { partner } : {}),
        confirmedPayableCents: quote.payableCents,
        confirmedAppliedStars: quote.appliedStars,
        idempotencyKey: idemKeyRef.current,
        analytics,
      });

      if (res.mode === "existing_horoscope") {
        setSubmitting(false);
        onClose();
        onExistingHoroscope?.(res.horoscope);
        return;
      }

      if (res.mode === "existing_order") {
        setSubmitting(false);
        onClose();
        onOrderReadyToFulfill(res.orderId);
        return;
      }

      if (res.mode === "stars_only") {
        window.dispatchEvent(new Event("astroweb:stars-changed"));
        setSubmitting(false);
        onClose();
        onOrderReadyToFulfill(res.orderId);
        return;
      }

      // Redirect to Stripe Checkout for remaining USD balance.
      window.location.assign(res.url);
    } catch (err) {
      if (err instanceof FirebaseError && err.message.includes("QUOTE_CHANGED")) {
        // Refresh the live server quote so the user confirms the exact updated amount.
        idemKeyRef.current = makeIdempotencyKey();
        try {
          const fresh = await getDirectCheckoutQuote(profileId, service);
          setQuote(fresh.quote);
          setPeriod({
            periodKey: fresh.period.periodKey,
            periodStart: fresh.period.periodStart,
            periodEnd: fresh.period.periodEnd,
          });
          setExistingHoroscope(fresh.existingHoroscope);
        } catch {
          /* ignore */
        }
        setQuoteNotice(
          t(
            "directCheckout.quoteChanged",
            "Расчёт стоимости обновился. Проверьте новую сумму и подтвердите снова.",
          ),
        );
      } else if (err instanceof FirebaseError && err.message.includes("CHECKOUT_IN_PROGRESS")) {
        setError(
          t(
            "directCheckout.inProgress",
            "Оплата для этого периода уже начата. Подождите секунду и попробуйте снова.",
          ),
        );
      } else {
        setError(t("directCheckout.failed", "Не удалось начать оформление. Попробуйте ещё раз."));
      }
      setSubmitting(false);
    }
  }

  const serviceName = t(`directCheckout.services.${service}.title`);
  const dateRangeLabel = formatDateRange(period.periodStart, period.periodEnd, language);
  const periodHeadline =
    service === "monthly_horoscope"
      ? formatCalendarPeriodTitle("month", period.periodStart, language)
      : service === "yearly_horoscope"
        ? formatCalendarPeriodTitle("year", period.periodStart, language)
        : null;

  const isAlreadyCompleted = existingHoroscope?.status === "completed";
  const isRecoverableOrder =
    existingHoroscope?.status === "paid_pending" || existingHoroscope?.status === "failed";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Progressive enhancement (modern-web-guidance `dialog`): light dismiss when idle.
      {...({ closedby: submitting ? "none" : "any" } as Record<string, string>)}
      onClose={handleNativeClose}
      onCancel={handleNativeCancel}
      className="ds-dialog m-auto w-[min(92vw,30rem)] max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#e8c969]/40 bg-[#0c1124] p-5 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.75)] sm:p-6"
      data-testid="direct-checkout-dialog"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-[#e8c969]">
            <Sparkles className="h-3.5 w-3.5" />
            {t("directCheckout.eyebrow", "Оформление прогноза")}
          </div>
          <h2 id={titleId} className="font-serif text-xl text-foreground sm:text-2xl">
            {serviceName}
            {periodHeadline ? ` · ${periodHeadline}` : ""}
          </h2>
          {profileName && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("directCheckout.forProfile", { name: profileName, defaultValue: `Профиль: ${profileName}` })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          disabled={submitting}
          aria-label={t("common.cancel")}
          className="rounded-lg border border-border/60 p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Covered dates */}
      <div className="mt-4 rounded-xl border border-border/50 bg-background/40 px-3.5 py-2.5 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1.5 font-medium text-[#8fb6ff]">
          <Calendar className="h-3.5 w-3.5" />
          {t("directCheckout.coveredDates", "Охватываемые даты")}: {dateRangeLabel}
        </div>
        {(service === "monthly_horoscope" || service === "yearly_horoscope") && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t(
              "directCheckout.periodNote",
              "Гороскоп охватывает весь календарный период, включая прошедшие дни, сохраняется для этого профиля и остаётся доступен после окончания периода без повторной оплаты.",
            )}
          </p>
        )}
      </div>

      {isAlreadyCompleted && existingHoroscope ? (
        <div className="mt-4 space-y-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm">
          <p className="text-green-300">
            {t(
              "directCheckout.alreadyOwned",
              "Этот гороскоп уже куплен и сохранён для данного профиля. Вы можете открыть его без оплаты и списания звёзд.",
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]"
              onClick={() => {
                onClose();
                onExistingHoroscope?.(existingHoroscope);
              }}
            >
              {t("horoscopes.openSaved", "Открыть сохранённый гороскоп")}
            </Button>
          </div>
        </div>
      ) : isRecoverableOrder && existingHoroscope ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[#e8c969]/40 bg-[#e8c969]/10 p-4 text-sm">
          <p className="text-foreground">
            {t(
              "directCheckout.alreadyPaidRecover",
              "Этот период уже оплачен. Повторная оплата не нужна — нажмите ниже, чтобы получить или повторить генерацию по исходному заказу.",
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]"
              onClick={() => {
                onClose();
                onOrderReadyToFulfill(existingHoroscope.orderId);
              }}
            >
              {t("directCheckout.retryPaidOrder", "Продолжить без доплаты")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Price breakdown with automatic star redemption */}
          <div className="mt-4 space-y-2 rounded-xl border border-border/60 bg-background/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("directCheckout.servicePrice", "Стоимость услуги")}</span>
              <span className="font-medium text-foreground" data-testid="checkout-base-price">
                {formatUsdCents(quote.basePriceCents)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {t("directCheckout.starsApplied", {
                  applied: quote.appliedStars,
                  full: quote.fullStarCost,
                  defaultValue: `Звёзды применены автоматически (✦${quote.appliedStars} из ✦${quote.fullStarCost})`,
                })}
              </span>
              <span
                className={quote.starDiscountCents > 0 ? "font-medium text-[#e8c969]" : "text-muted-foreground"}
                data-testid="checkout-star-discount"
              >
                {quote.starDiscountCents > 0 ? `−${formatUsdCents(quote.starDiscountCents)}` : "$0.00"}
              </span>
            </div>

            {quote.surplusStars > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("directCheckout.starsRemaining", "Останется звёзд после оформления")}</span>
                <span className="text-[#e8c969]">✦{quote.surplusStars}</span>
              </div>
            )}

            <div className="border-t border-border/50 pt-2.5 flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{t("directCheckout.totalPayable", "Итого к оплате")}</span>
              <span className="font-serif text-2xl font-bold text-[#e8c969]" data-testid="checkout-payable">
                {formatUsdCents(quote.payableCents)}
              </span>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none text-[#8fb6ff]" />
            <span>
              {quote.payableCents === 0
                ? t(
                    "directCheckout.starsOnlyHint",
                    "Доплата в долларах не требуется — услуга полностью покрывается вашими звёздами, а результат откроется сразу здесь.",
                  )
                : t(
                    "directCheckout.cancelSafeHint",
                    "После оплаты вы сразу перейдёте к результату. Если вы отмените оплату, ваши звёзды останутся на балансе.",
                  )}
            </span>
          </p>

          {quoteNotice && (
            <p className="mt-3 rounded-lg border border-[#e8c969]/40 bg-[#e8c969]/10 px-3 py-2 text-xs text-[#e8c969]">
              {quoteNotice}
            </p>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => dialogRef.current?.close()}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              autoFocus
              disabled={submitting || loadingQuote}
              onClick={handleConfirm}
              data-testid="direct-checkout-confirm"
              className="bg-[#e8c969] font-semibold text-[#1a1606] hover:bg-[#f2dd9a]"
            >
              {submitting
                ? t("directCheckout.processing", "Оформляем…")
                : loadingQuote
                  ? t("common.loading")
                  : quote.payableCents === 0
                    ? t("directCheckout.confirmStars", {
                        stars: quote.appliedStars,
                        defaultValue: `Получить за ✦${quote.appliedStars} ($0.00)`,
                      })
                    : t("directCheckout.confirmPay", {
                        amount: formatUsdCents(quote.payableCents),
                        defaultValue: `Оплатить ${formatUsdCents(quote.payableCents)}`,
                      })}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
