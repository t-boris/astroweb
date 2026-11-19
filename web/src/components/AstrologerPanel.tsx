import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Sparkles, Mail, Shuffle, Check, Calendar, MessageCircle, AlertTriangle, Gift, Bell } from "lucide-react";
import { generateLetterNow } from "@/api/letters";
import { getCheckoutAnalytics, trackEvent } from "@/lib/analytics";
import { ensureSignedIn } from "@/lib/contentSync";
import { useDeviceId } from "@/hooks/useDeviceId";
import {
  getAstrologerStatus,
  subscribeAstrologer,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  setSubscriptionChannels,
  monthlyPriceUsd,
  annualPriceUsd,
  showAnnualFreeMonthsLabel,
  type Cadence,
  type Subscription,
} from "@/api/astrologer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { HelpBubble } from "@/components/HelpBubble";

const RANDOM_NAMES = ["Vega", "Lyra", "Orion", "Selene", "Cassio", "Astra", "Sol"];

export interface AstrologerPanelProps {
  profileId: string;
  profileName?: string;
  onOpenFreeToday?: () => void;
}

export default function AstrologerPanel({ profileId, profileName, onOpenFreeToday }: AstrologerPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(Boolean(auth.currentUser));
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialErr, setTrialErr] = useState<string | null>(null);

  // Default to Daily Horoscope subscription (REQ-004, DEC-005).
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [email, setEmail] = useState(true);
  const [recipients, setRecipients] = useState("");
  const [name, setName] = useState(RANDOM_NAMES[0]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editEmails, setEditEmails] = useState<string | null>(null);
  const [savingEmails, setSavingEmails] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setSignedIn(Boolean(u));
        setUserEmail(u?.email ?? null);
      }),
    [],
  );

  const cadenceLabel = (c: string) =>
    t(
      `hub.cad${({ daily: "Daily", every_2_days: "Every2", every_5_days: "Every5", weekly: "Weekly", every_2_weeks: "Every2w" } as Record<string, string>)[c]}`,
    );

  const CADENCES: { value: Cadence; label: string; popular?: boolean }[] = [
    { value: "daily", label: t("hub.cadDaily"), popular: true },
    { value: "every_2_days", label: t("hub.cadEvery2") },
    { value: "weekly", label: t("hub.cadWeekly") },
  ];

  async function load() {
    if (!auth.currentUser) {
      setSub(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSub(await getAstrologerStatus(profileId));
      setError(null);
    } catch (e) {
      const msg = (e as Error).message || "";
      // Signed-out visitors still see the full Daily Horoscope subscription offer before paying.
      if (msg.includes("unauthenticated") || msg.includes("Sign in")) {
        setSub(null);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, signedIn]);

  async function hire() {
    setError(null);
    // Sign-in popup must open synchronously from the click.
    if (!auth.currentUser) {
      const ok = await ensureSignedIn(deviceId);
      if (!ok) return;
    }
    setBusy(true);
    try {
      trackEvent("astrologer_subscribe_start", { cadence, billing_period: period });
      const analytics = await getCheckoutAnalytics();
      const url = await subscribeAstrologer({
        profileId,
        cadence,
        billingPeriod: period,
        channels: { email },
        recipientEmails: recipients,
        astrologerName: name,
        analytics,
      });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function tryFreeLetter() {
    setTrialErr(null);
    if (!auth.currentUser) {
      const ok = await ensureSignedIn(deviceId);
      if (!ok) return;
    }
    setTrialBusy(true);
    trackEvent("ai_reading_requested", { kind: "letter" });
    try {
      await generateLetterNow(profileId);
      navigate(`/profile/${profileId}/letters`);
    } catch (e) {
      const msg = (e as Error).message || "";
      setTrialErr(
        msg.includes("unauthenticated") || msg.includes("Sign in")
          ? t("hub.signInRequired")
          : t("hub.tryFreeError", "Couldn't write the letter. Please try again."),
      );
      setTrialBusy(false);
    }
  }
  async function saveEmails() {
    if (editEmails === null) return;
    setSavingEmails(true);
    try {
      await setSubscriptionChannels({ profileId, channels: { email: true }, recipientEmails: editEmails });
      setEditEmails(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingEmails(false);
    }
  }
  async function act(fn: (id: string) => Promise<void>) {
    setBusy(true);
    try {
      await fn(profileId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (s: string) => t(`hub.status_${s}`, { defaultValue: s });
  const cadKey = (c: string) =>
    ({ daily: "Daily", every_2_days: "Every2", every_5_days: "Every5", weekly: "Weekly", every_2_weeks: "Every2w" } as Record<string, string>)[c];
  const monthly = monthlyPriceUsd(cadence);
  const annual = annualPriceUsd(cadence);
  const price = period === "annual" ? annual : monthly;
  const showFreeMonths = showAnnualFreeMonthsLabel(cadence);

  const quickLinks = (
    <div className="flex flex-wrap gap-2 pt-1">
      <HelpBubble helpKey="astrologer.openLetters" actionable label={t("hub.openLetters")}>
        <Button asChild size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
          <Link to={`/profile/${profileId}/letters`}>
            <MessageCircle className="mr-1.5 h-4 w-4" />
            {t("hub.openLetters")}
          </Link>
        </Button>
      </HelpBubble>
      <HelpBubble helpKey="astrologer.openNotes" actionable label={t("hub.openNotes")}>
        <Button asChild size="sm" variant="outline" className="border-border/60 text-muted-foreground hover:border-primary hover:text-foreground">
          <Link to={`/profile/${profileId}/notes`}>{t("hub.openNotes")}</Link>
        </Button>
      </HelpBubble>
    </div>
  );

  if (loading) return <p className="py-10 text-center text-muted-foreground">{t("common.loading")}</p>;

  // ---- Subscribed: status card ----------------------------------------------
  if (sub && sub.status !== "canceled") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-[#e8c969]/30 bg-gradient-to-b from-[#e8c969]/[0.06] to-transparent p-6 shadow-[0_0_40px_-12px_rgba(232,201,105,0.25)]">
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-[#e8c969]/10 ring-1 ring-[#e8c969]/40 text-2xl text-[#e8c969] shadow-[0_0_20px_rgba(232,201,105,0.25)]">
            ✦
          </div>
          <div>
            <p className="font-serif text-xl text-foreground">{sub.astrologerName}</p>
            <p className="text-sm text-muted-foreground">
              <HelpBubble helpKey="astrologer.status">
                <span className="text-[#8fb6ff]">{statusLabel(sub.status)}</span>
              </HelpBubble>{" "}
              · {t(`hub.cad${cadKey(sub.cadence)}`)} · {t(`hub.${sub.billingPeriod}`)}
              {profileName ? ` · ${profileName}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
          <HelpBubble helpKey="astrologer.schedule">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#8fb6ff]" />
              {t("hub.scheduleLine", { cadence: cadenceLabel(sub.cadence), defaultValue: "Letters: {{cadence}}, in the morning your local time" })}
            </span>
          </HelpBubble>
          <HelpBubble helpKey="astrologer.nextLetter">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#8fb6ff]" />
              {t("hub.nextLetter")}: {new Date(sub.nextLetterAt).toLocaleString()}
            </span>
          </HelpBubble>
          {sub.channels?.email &&
            (editEmails === null ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[#8fb6ff]" />
                {t("hub.emailTo", "Email to")}:{" "}
                {sub.recipientEmails && sub.recipientEmails.length > 0 ? sub.recipientEmails.join(", ") : userEmail ?? "—"}
                <HelpBubble helpKey="astrologer.editEmails" actionable label={t("hub.editEmails", "change")}>
                  <button
                    type="button"
                    className="text-[#8fb6ff] underline underline-offset-2 hover:text-[#dfeaff]"
                    onClick={() => setEditEmails((sub.recipientEmails ?? []).join(", "))}
                  >
                    {t("hub.editEmails", "change")}
                  </button>
                </HelpBubble>
              </span>
            ) : (
              <span className="flex flex-col gap-1.5">
                <Input
                  value={editEmails}
                  onChange={(e) => setEditEmails(e.target.value)}
                  placeholder={userEmail ?? t("hub.emailPlaceholder", "name@example.com")}
                  className="h-8"
                />
                <span className="inline-flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={savingEmails} onClick={saveEmails}>
                    {t("common.save", "Save")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={savingEmails} onClick={() => setEditEmails(null)}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t("hub.emailRecipientsHint", "Leave empty to use your account email. Separate several addresses with commas.")}
                </span>
              </span>
            ))}
          {sub.canceledAt && (
            <HelpBubble helpKey="astrologer.cancelsAt">
              <span className="rounded-full border border-[#e8c969]/40 bg-[#e8c969]/10 px-2.5 py-1 text-[#e8c969]">
                {t("hub.cancelsAt")} · {new Date(sub.currentPeriodEnd).toLocaleDateString()}
              </span>
            </HelpBubble>
          )}
        </div>
        {quickLinks}

        {confirmCancel ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="flex-1 text-sm text-foreground">
              {t("hub.cancelConfirm", "Cancel the subscription? Billing stops at period end; nothing is refunded for the current period.")}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive text-destructive"
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                void act(cancelSubscription);
              }}
            >
              {t("hub.cancelYes", "Yes, cancel")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>
              {t("hub.cancelNo", "Keep it")}
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
            {sub.status === "active" && (
              <HelpBubble helpKey="astrologer.pause" actionable label={t("hub.pause")}>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(pauseSubscription)}>
                  {t("hub.pause")}
                </Button>
              </HelpBubble>
            )}
            {sub.status === "paused" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(resumeSubscription)}>
                {t("hub.resume")}
              </Button>
            )}
            {!sub.canceledAt && (
              <HelpBubble helpKey="astrologer.cancel" actionable label={t("hub.cancel")}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmCancel(true)}
                >
                  {t("hub.cancel")}
                </Button>
              </HelpBubble>
            )}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">{t("hub.cancelNote")}</p>
      </div>
    );
  }

  // ---- Not subscribed: Daily Horoscope Subscription offer (REQ-004, DEC-005) ----
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#e8c969]/25 bg-gradient-to-b from-[#5b8def]/[0.05] via-transparent to-[#e8c969]/[0.04] p-6 shadow-[0_0_50px_-16px_rgba(91,141,239,0.35)]"
      data-testid="daily-subscription-offer"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b8def]/30 to-[#e8c969]/20 ring-1 ring-[#8fb6ff]/30 text-3xl text-[#dfeaff] shadow-[0_0_24px_rgba(91,141,239,0.35)]">
          ✦
        </div>
        <div>
          <HelpBubble helpKey="astrologer.title">
            <h2 className="font-serif text-2xl text-foreground">{t("hub.title")}</h2>
          </HelpBubble>
          <HelpBubble helpKey="astrologer.intro">
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("hub.intro")}</p>
          </HelpBubble>
        </div>
      </div>

      {/* Offer clarity: covered profile, included content, daily delivery & distinction from free horoscope (REQ-004 AC #1) */}
      <div className="mt-5 grid gap-2.5 rounded-xl border border-border/60 bg-background/45 p-4 text-xs text-muted-foreground">
        {profileName && (
          <p className="text-sm font-medium text-foreground" data-testid="daily-sub-profile">
            {t("hub.coveredProfile", { name: profileName, defaultValue: `Для профиля: ${profileName}` })}
          </p>
        )}
        <div className="grid gap-1.5 sm:grid-cols-2">
          <span className="inline-flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-[#8fb6ff]" />
            {t("hub.includedContent", "Персональные письма по вашей натальной карте, текущему небу и вашим заметкам")}
          </span>
          <span className="inline-flex items-start gap-1.5">
            <Bell className="mt-0.5 h-3.5 w-3.5 flex-none text-[#8fb6ff]" />
            {t("hub.includedDelivery", "Доставка в приложении, на email и через push-уведомления (если включены)")}
          </span>
        </div>
        <div className="border-t border-border/40 pt-2 text-[11px] leading-relaxed">
          <span>
            {t(
              "hub.distinctionFromFree",
              "Отличие от бесплатного «Гороскопа на день»: бесплатный прогноз — короткая заметка на сегодня, а подписка «Ежедневный гороскоп» каждый день присылает развёрнутые персональные письма личного астролога и начисляет +1 ✦ за каждое письмо.",
            )}
          </span>
          {onOpenFreeToday && (
            <>
              {" "}
              <button
                type="button"
                onClick={onOpenFreeToday}
                className="text-[#8fb6ff] underline underline-offset-2 hover:text-[#dfeaff]"
              >
                {t("hub.viewFreeTodayLink", "Открыть бесплатный «Гороскоп на день»")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Free trial letter */}
      <div className="mt-5 rounded-xl border border-[#8fb6ff]/30 bg-[#5b8def]/10 p-4">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 flex-none text-[#8fb6ff]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t("hub.tryFreeTitle", "Not sure? Your first letter is free")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("hub.tryFreeDesc", "Get a sample letter from your astrologer — no payment, no subscription.")}</p>
          </div>
        </div>
        {trialErr && <p className="mt-2 text-xs text-destructive">{trialErr}</p>}
        <HelpBubble helpKey="astrologer.freeLetter" actionable label={t("hub.tryFree", "Get a free letter")} wrapperClassName="flex">
          <Button
            onClick={tryFreeLetter}
            disabled={trialBusy}
            variant="outline"
            className="mt-3 w-full border-[#8fb6ff]/50 text-[#8fb6ff] hover:bg-[#8fb6ff]/10"
          >
            {trialBusy ? t("hub.tryFreeLoading", "Writing your letter…") : t("hub.tryFree", "Get a free letter")}
          </Button>
        </HelpBubble>
      </div>

      {/* Cadence */}
      <div className="mt-6 space-y-2">
        <HelpBubble helpKey="astrologer.cadence">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8fb6ff]">{t("hub.cadence")}</p>
        </HelpBubble>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CADENCES.map((c) => {
            const active = cadence === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCadence(c.value)}
                data-testid={`cadence-${c.value}`}
                className={`relative rounded-xl border p-3 text-left transition-all ${
                  active
                    ? "border-primary bg-primary/15 shadow-[0_0_20px_-8px_rgba(91,141,239,0.6)]"
                    : "border-border/50 hover:border-primary/60 hover:bg-primary/5"
                }`}
              >
                {c.popular && (
                  <span className="absolute -top-2 right-2 rounded-full bg-[#e8c969] px-2 py-0.5 text-[10px] font-semibold text-[#1a1606]">
                    ★ {t("hub.popular", "popular")}
                  </span>
                )}
                <span className={`block text-sm ${active ? "text-[#8fb6ff]" : "text-foreground"}`}>{c.label}</span>
                <span className="mt-0.5 block font-serif text-lg text-foreground">
                  ${monthlyPriceUsd(c.value).toFixed(2)}
                  <span className="text-xs font-sans text-muted-foreground">{t("hub.perMonth")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Billing interval — daily annual shows total annual price WITHOUT free-month labels (REQ-004 AC #2) */}
      <div className="mt-5 space-y-2">
        <HelpBubble helpKey="astrologer.period">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8fb6ff]">{t("hub.period")}</p>
        </HelpBubble>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            data-testid="billing-monthly"
            className={`rounded-xl border p-3 text-center transition-all ${
              period === "monthly" ? "border-primary bg-primary/15" : "border-border/50 hover:border-primary/60"
            }`}
          >
            <span className="block text-sm text-foreground">{t("hub.monthly")}</span>
            <span className="font-serif text-lg">${monthly.toFixed(2)}</span>
          </button>
          <button
            type="button"
            onClick={() => setPeriod("annual")}
            data-testid="billing-annual"
            className={`relative rounded-xl border p-3 text-center transition-all ${
              period === "annual" ? "border-[#e8c969] bg-[#e8c969]/10" : "border-border/50 hover:border-[#e8c969]/60"
            }`}
          >
            {showFreeMonths && (
              <span className="absolute -top-2 right-2 rounded-full bg-[#e8c969] px-2 py-0.5 text-[10px] font-semibold text-[#1a1606]">
                −3 {t("hub.month")}
              </span>
            )}
            <span className="block text-sm text-foreground">
              {showFreeMonths ? t("hub.annual") : t("hub.annualPlain", "Год")}
            </span>
            <span className="font-serif text-lg">${annual.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* Schedule clarity */}
      <HelpBubble helpKey="astrologer.schedule">
        <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-[#8fb6ff]" />
          {t("hub.scheduleHint", {
            cadence: cadenceLabel(cadence),
            defaultValue: "First letter right after you hire, then {{cadence}} — in the morning, your local time.",
          })}
        </p>
      </HelpBubble>

      {/* Email */}
      <div className="mt-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <Mail className="h-4 w-4 text-[#8fb6ff]" />
          <HelpBubble helpKey="astrologer.email">
            <span className="flex-1 text-sm text-foreground">{t("hub.emailDelivery")}</span>
          </HelpBubble>
          <Switch checked={email} onCheckedChange={setEmail} />
        </div>
        {email && (
          <div className="mt-2 space-y-1.5 pl-7">
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder={userEmail ?? t("hub.emailPlaceholder", "name@example.com")}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              {t("hub.emailRecipientsHint", "Leave empty to use your account email. Separate several addresses with commas.")}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <HelpBubble helpKey="astrologer.name">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8fb6ff]">{t("hub.name")}</p>
        </HelpBubble>
        <div className="flex items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 max-w-xs" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setName(RANDOM_NAMES[Math.floor(Date.now() / 1000) % RANDOM_NAMES.length])}
          >
            <Shuffle className="mr-1.5 h-4 w-4" />
            {t("hub.random")}
          </Button>
        </div>
      </div>

      {/* Subscribe CTA */}
      <HelpBubble helpKey="astrologer.hire" actionable label={t("hub.hire")} side="top" wrapperClassName="flex">
        <Button
          disabled={busy}
          onClick={hire}
          data-testid="daily-sub-cta"
          className="mt-6 h-12 w-full bg-gradient-to-r from-[#5b8def] to-[#8fb6ff] text-base font-semibold text-white shadow-[0_0_30px_-8px_rgba(91,141,239,0.7)] hover:opacity-95"
        >
          {busy ? (
            "…"
          ) : (
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t("hub.hire")} — ${price.toFixed(2)}/{period === "annual" ? t("hub.year") : t("hub.month")}
            </span>
          )}
        </Button>
      </HelpBubble>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <HelpBubble helpKey="astrologer.perkStars" side="top">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-[#8fb6ff]" />
            {t("hub.perk1", "+1 ✦ each letter")}
          </span>
        </HelpBubble>
        <HelpBubble helpKey="astrologer.perkLearns" side="top">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-[#8fb6ff]" />
            {t("hub.perk2", "learns about you")}
          </span>
        </HelpBubble>
        <span className="inline-flex items-center gap-1">
          <Check className="h-3.5 w-3.5 text-[#8fb6ff]" />
          {t("hub.perk3", "cancel anytime")}
        </span>
      </div>

      {quickLinks}
    </div>
  );
}
