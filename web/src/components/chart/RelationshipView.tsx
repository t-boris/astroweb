import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, ChevronDown, ChevronUp, RefreshCw, Trash2 } from "lucide-react";
import { toAppLanguage } from "@/lib/language";
import { trackEvent, trackOnce } from "@/lib/analytics";
import PlaceSearch from "@/components/PlaceSearch";
import { HelpBubble } from "@/components/HelpBubble";
import { DirectCheckoutDialog } from "@/components/DirectCheckoutDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AiReading } from "@/components/AiReading";
import { deleteProfileContentItem } from "@/api/profileContent";
import {
  cancelDirectCheckout,
  fulfillDirectOrder,
  listProfileHoroscopes,
  type RecoverableDirectOrder,
} from "@/api/directCheckout";
import {
  calculateDirectCheckoutQuote,
  formatDateRange,
  formatUsdCents,
  threeMonthPeriod,
} from "@/lib/directServices";
import { auth } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";
import { ensureSignedIn, loadProfileContent, type CompatItem } from "@/lib/contentSync";
import { cleanAiArtifacts, readLocalContent, writeLocalContent } from "@/lib/localContent";

interface RelationshipViewProps {
  profileId: string;
  profileName?: string;
  ownerDeviceId: string;
  relocationLat?: number | null;
  relocationLng?: number | null;
  tokens?: number;
  compatibilityIncluded?: boolean;
  onUnlocked?: () => void;
  onPurchasePremium?: () => void;
  pendingDirectOrderId?: string | null;
  pendingCheckoutStatus?: "success" | "cancel" | null;
  onClearPendingOrder?: () => void;
}

type CompatEntry = CompatItem;

const entryKey = (e: CompatEntry) => e.id ?? `${e.generatedAt}-${e.partnerName}`;

export function RelationshipView({
  profileId,
  profileName,
  ownerDeviceId,
  relocationLat,
  relocationLng,
  tokens = 0,
  onUnlocked,
  pendingDirectOrderId,
  pendingCheckoutStatus,
  onClearPendingOrder,
}: RelationshipViewProps) {
  const { t, i18n } = useTranslation();
  const language = toAppLanguage(i18n.resolvedLanguage);
  const quote = calculateDirectCheckoutQuote("relationship", tokens);
  const previewWindow = threeMonthPeriod();

  // Funnel: paywall_viewed when the user would need USD (fewer than 2 stars).
  useEffect(() => {
    if (quote.payableCents > 0) trackOnce(profileId, "paywall_viewed", { feature: "compatibility" });
  }, [quote.payableCents, profileId]);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recoverableOrders, setRecoverableOrders] = useState<RecoverableDirectOrder[]>([]);
  const [history, setHistory] = useState<CompatEntry[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { user, ready: authReady } = useAuthUser();
  const needsSignIn = authReady && !user;
  const [contentSource, setContentSource] = useState<"server" | "local">("local");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [contentTick, setContentTick] = useState(0);

  useEffect(() => {
    const onSignedIn = () => setContentTick((n) => n + 1);
    window.addEventListener("astroweb:signed-in", onSignedIn);
    return () => window.removeEventListener("astroweb:signed-in", onSignedIn);
  }, []);

  const loadRecoverable = useCallback(async () => {
    if (!auth.currentUser) {
      setRecoverableOrders([]);
      return;
    }
    try {
      const res = await listProfileHoroscopes(profileId, ownerDeviceId);
      setRecoverableOrders(res.recoverableOrders.filter((o) => o.service === "relationship"));
    } catch {
      /* ignore */
    }
  }, [profileId, ownerDeviceId]);

  useEffect(() => {
    let cancelled = false;
    setLoadedFor(null);
    setHistory([]);
    void loadProfileContent(profileId, ownerDeviceId, language).then((content) => {
      if (cancelled) return;
      setContentSource(content.source);
      setHistory((prev) => {
        const ids = new Set(content.compatibilityReadings.map(entryKey));
        return [...prev.filter((e) => !ids.has(entryKey(e))), ...content.compatibilityReadings];
      });
      setLoadedFor(profileId);
    });
    void loadRecoverable();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, ownerDeviceId, contentTick, user?.uid]);

  useEffect(() => {
    if (contentSource !== "local" || loadedFor !== profileId) return;
    const current = readLocalContent(localStorage, profileId);
    writeLocalContent(localStorage, profileId, { ...current, compatibilityReadings: history });
  }, [contentSource, loadedFor, profileId, history]);

  const runFulfill = useCallback(
    async (orderId: string) => {
      setLoading(true);
      setError(null);
      setCancelNotice(false);
      trackEvent("ai_reading_requested", { kind: "compatibility" });
      try {
        const res = await fulfillDirectOrder(orderId);
        if (res.status === "completed" && res.text) {
          const entry: CompatEntry = {
            ...(res.resultId ? { id: res.resultId } : {}),
            partnerName: res.meta?.partnerName || name.trim() || t("ai.relationshipAnswerTitle"),
            partnerBirthDate: res.meta?.partnerBirthDate || birthDate,
            partnerBirthPlace: res.meta?.partnerBirthPlace || birthPlace,
            answer: cleanAiArtifacts(res.text),
            partnerTimezone: res.meta?.partnerTimezone ?? null,
            generatedAt: res.meta?.generatedAt ?? new Date().toISOString(),
            periodStart: res.periodStart,
            periodEnd: res.periodEnd,
          };
          setHistory((prev) => [entry, ...prev.filter((e) => entryKey(e) !== entryKey(entry))]);
          onUnlocked?.();
          window.dispatchEvent(new Event("astroweb:stars-changed"));
          await loadRecoverable();
        } else {
          await loadRecoverable();
          setError(
            t(
              "directCheckout.stillProcessing",
              "Платёж обрабатывается. Нажмите «Повторить», чтобы получить прогноз без повторной оплаты.",
            ),
          );
        }
      } catch {
        await loadRecoverable();
        setError(
          t(
            "directCheckout.generationFailedRecoverable",
            "Не удалось сформировать прогноз. Ваша оплата сохранена — нажмите «Повторить генерацию» ниже без повторной оплаты и списания звёзд.",
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [birthDate, birthPlace, loadRecoverable, name, onUnlocked, t],
  );

  useEffect(() => {
    if (!pendingDirectOrderId || !pendingCheckoutStatus) return;
    if (pendingCheckoutStatus === "cancel") {
      setCancelNotice(true);
      void cancelDirectCheckout(pendingDirectOrderId)
        .catch(() => {})
        .finally(() => onClearPendingOrder?.());
      return;
    }
    if (pendingCheckoutStatus === "success") {
      onClearPendingOrder?.();
      void runFulfill(pendingDirectOrderId);
    }
  }, [pendingDirectOrderId, pendingCheckoutStatus, onClearPendingOrder, runFulfill]);

  function deleteReading(entry: CompatEntry) {
    const key = entryKey(entry);
    setHistory((prev) => prev.filter((e) => entryKey(e) !== key));
    if (entry.id && contentSource === "server") {
      void deleteProfileContentItem(profileId, ownerDeviceId, "compatibility", entry.id).catch(() =>
        setContentTick((n) => n + 1),
      );
    }
  }

  function handlePlaceSelect(place: { name: string; lat: number; lng: number }) {
    setBirthPlace(place.name);
    setLat(place.lat);
    setLng(place.lng);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.birthPlace;
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("profile.validation.nameRequired");
    if (!birthDate) next.birthDate = t("profile.validation.birthDateRequired");
    if (!timeUnknown && !birthTime) next.birthTime = t("profile.validation.birthTimeRequired");
    if (!birthPlace || lat === null || lng === null) next.birthPlace = t("profile.validation.birthPlaceRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleOpenCheckout() {
    if (!validate()) return;
    setError(null);
    setCancelNotice(false);
    // Sign-in popup must open synchronously from the click (REQ-005 AC #16).
    if (!auth.currentUser) {
      if (!(await ensureSignedIn(ownerDeviceId))) return;
      onUnlocked?.();
    }
    setCheckoutOpen(true);
  }

  const generateLabel = loading
    ? t("ai.relationshipGenerating")
    : needsSignIn
      ? t("signInGate.compatibility")
      : quote.payableCents === 0
        ? `${t("ai.relationshipGenerate")} · ✦${quote.appliedStars} ($0.00)`
        : `${t("ai.relationshipGenerate")} · ${formatUsdCents(quote.payableCents)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <HelpBubble helpKey="compatibility.title">
            <h3 className="font-serif text-xl text-[#8fb6ff]">{t("ai.relationshipTitle")}</h3>
          </HelpBubble>
          <p className="text-sm text-muted-foreground">{t("ai.relationshipDescription")}</p>
          <p className="inline-flex items-center gap-1.5 text-xs text-[#8fb6ff]">
            <Calendar className="h-3.5 w-3.5" />
            {t("directCheckout.forecastWindow3m", {
              range: formatDateRange(previewWindow.periodStart, previewWindow.periodEnd, language),
              defaultValue: `Прогноз развития на 3 месяца: ${formatDateRange(previewWindow.periodStart, previewWindow.periodEnd, language)}`,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 px-3.5 py-2 text-right text-xs">
          <div className="font-serif text-lg font-bold text-foreground">
            {formatUsdCents(quote.basePriceCents)}
          </div>
          <div className="text-[#e8c969]">
            {t("horoscopes.orStars", { count: quote.fullStarCost, defaultValue: `или ✦${quote.fullStarCost}` })}
          </div>
        </div>
      </div>

      {/* Recovery banner for any paid but failed/pending relationship forecast */}
      {recoverableOrders.length > 0 && (
        <div
          className="space-y-2 rounded-xl border border-[#e8c969]/40 bg-[#e8c969]/10 p-4"
          data-testid="relationship-recovery-banner"
        >
          {recoverableOrders.map((ord) => (
            <div key={ord.orderId} className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-foreground">
                <p className="font-medium text-[#e8c969]">
                  {t("directCheckout.paidOrderReady", "Оплаченный прогноз на отношения")}
                  {ord.partnerName ? ` · ${ord.partnerName}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {formatDateRange(ord.periodStart, ord.periodEnd, language)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => void runFulfill(ord.orderId)}
                className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                {t("horoscopes.retryGeneration", "Повторить генерацию (уже оплачено)")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {cancelNotice && (
        <div className="rounded-xl border border-border/60 bg-background/50 px-4 py-3 text-sm text-muted-foreground">
          {t(
            "directCheckout.canceledNotice",
            "Оплата отменена. Деньги не списаны, а все ваши звёзды остались на балансе.",
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="relationship-name">{t("ai.partnerNameLabel")}</Label>
          <Input
            id="relationship-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profile.form.namePlaceholder")}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="relationship-date">{t("ai.partnerBirthDateLabel")}</Label>
          <Input
            id="relationship-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <HelpBubble helpKey="compatibility.timeUnknown" actionable label={t("ai.partnerTimeUnknown")}>
            <Switch
              id="relationship-time-unknown"
              checked={timeUnknown}
              onCheckedChange={(checked) => {
                setTimeUnknown(checked);
                if (checked) setBirthTime("");
              }}
            />
          </HelpBubble>
          <Label htmlFor="relationship-time-unknown">{t("ai.partnerTimeUnknown")}</Label>
        </div>

        {!timeUnknown && (
          <div className="space-y-2 md:max-w-xs">
            <div>
              <HelpBubble helpKey="compatibility.birthTime" actionable label={t("ai.partnerBirthTimeLabel")}>
                <Label htmlFor="relationship-time">{t("ai.partnerBirthTimeLabel")}</Label>
              </HelpBubble>
            </div>
            <Input
              id="relationship-time"
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
            />
            {errors.birthTime && <p className="text-sm text-destructive">{errors.birthTime}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <HelpBubble helpKey="compatibility.birthPlace">
          <Label>{t("ai.partnerBirthPlaceLabel")}</Label>
        </HelpBubble>
        <PlaceSearch onSelect={handlePlaceSelect} initialValue={birthPlace || undefined} />
        {errors.birthPlace && <p className="text-sm text-destructive">{errors.birthPlace}</p>}
        {lat !== null && lng !== null && (
          <HelpBubble helpKey="profile.coordinates">
            <p className="text-xs text-muted-foreground">
              {t("ai.partnerCoordinatesLabel")}: {lat.toFixed(4)}, {lng.toFixed(4)}
            </p>
          </HelpBubble>
        )}
      </div>

      {tokens > 0 && (
        <p className="text-xs text-[#e8c969]">
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
        </p>
      )}

      <div className="flex items-center gap-3">
        <HelpBubble helpKey="compatibility.generate" actionable label={generateLabel}>
          <Button
            type="button"
            onClick={() => void handleOpenCheckout()}
            disabled={loading}
            className="bg-[#e8c969] font-semibold text-[#1a1606] hover:bg-[#f2dd9a]"
            data-testid="relationship-generate"
          >
            {generateLabel}
          </Button>
        </HelpBubble>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {history.length > 0 && (
        <div className="space-y-3">
          {history.map((entry, index) => {
            const key = entryKey(entry);
            const isCollapsed = collapsed[key] ?? false;
            const toggleLabel = isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation");
            const timezoneLine = (
              <p className="text-xs text-muted-foreground">
                {t("ai.relationshipPartnerTimezone", { timezone: entry.partnerTimezone })}
              </p>
            );
            return (
              <div key={key} className="rounded-md border bg-background/60 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("ai.relationshipAnswerTitle")}
                    </p>
                    <p className="font-serif text-sm text-[#8fb6ff]">
                      {entry.partnerName}
                      {entry.partnerBirthDate ? ` · ${entry.partnerBirthDate}` : ""}
                    </p>
                    {entry.periodStart && entry.periodEnd && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#e8c969]">
                        <Calendar className="h-3 w-3" />
                        {t("directCheckout.coveredDates", "Охватываемые даты")}:{" "}
                        {formatDateRange(entry.periodStart, entry.periodEnd, language)}
                      </p>
                    )}
                    {entry.partnerTimezone &&
                      (index === 0 ? (
                        <HelpBubble helpKey="compatibility.timezone">{timezoneLine}</HelpBubble>
                      ) : (
                        timezoneLine
                      ))}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <HelpBubble helpKey="compatibility.toggle" actionable label={toggleLabel}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={toggleLabel}
                        onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed }))}
                      >
                        {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                      </Button>
                    </HelpBubble>
                    <HelpBubble helpKey="compatibility.delete" actionable label={t("common.delete", "Delete")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.delete", "Delete")}
                        onClick={() => deleteReading(entry)}
                      >
                        <Trash2 />
                      </Button>
                    </HelpBubble>
                  </div>
                </div>
                {!isCollapsed && <AiReading text={entry.answer} />}
              </div>
            );
          })}
        </div>
      )}

      {lat !== null && lng !== null && (
        <DirectCheckoutDialog
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          profileId={profileId}
          profileName={profileName}
          service="relationship"
          initialStars={tokens}
          relocationLat={relocationLat}
          relocationLng={relocationLng}
          partner={{
            name: name.trim(),
            birthDate,
            birthTime: timeUnknown ? null : birthTime,
            timeUnknown,
            birthPlace,
            lat,
            lng,
          }}
          onOrderReadyToFulfill={(orderId) => {
            void runFulfill(orderId);
          }}
        />
      )}
    </div>
  );
}
