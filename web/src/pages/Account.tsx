import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles } from "@/api/profiles";
import { getWallet } from "@/api/wallet";
import { getAstrologerStatus, type Subscription } from "@/api/astrologer";
import { claimProfiles } from "@/api/claim";
import { Mail, Calendar, Sparkles, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { enablePush, pushSupported, notificationPermission } from "@/lib/push";
import { HelpBubble } from "@/components/HelpBubble";

interface SubRow extends Subscription {
  profileName: string;
}

function NotificationsCard() {
  const { t } = useTranslation();
  const [perm, setPerm] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setErr(null);
    try {
      await enablePush();
      setPerm(notificationPermission());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ds-card space-y-3 p-5">
      <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Bell className="h-3.5 w-3.5" />{t("account.notifications", "Notifications")}</p>
      <p className="text-sm text-muted-foreground">{t("account.notificationsNote", "New letters appear in the ✦ Astrologer inbox, by email, and — if you enable it — as a push notification.")}</p>
      {!pushSupported() ? (
        <p className="text-xs text-muted-foreground">{t("account.pushUnsupported", "Push isn't supported here. On iPhone, add AstroWeb to your Home Screen first.")}</p>
      ) : perm === "granted" ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-[#8fb6ff]"><Bell className="h-4 w-4" />{t("account.pushOn", "Push notifications are on")}</p>
      ) : (
        <div className="flex">
          <HelpBubble helpKey="account.push" actionable label={t("account.pushEnable", "Enable push notifications")}>
            <Button size="sm" onClick={turnOn} disabled={busy} className="bg-primary/20 border border-primary text-primary hover:bg-primary/30">
              {busy ? "…" : t("account.pushEnable", "Enable push notifications")}
            </Button>
          </HelpBubble>
        </div>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

export default function Account() {
  const { t } = useTranslation();
  const deviceId = useDeviceId();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [firstId, setFirstId] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        getWallet(deviceId).then((s) => !cancelled && setStars(s)).catch(() => {});
        const profiles = await listProfiles(deviceId);
        if (cancelled) return;
        setFirstId(profiles[0]?.id ?? null);
        const rows: SubRow[] = [];
        for (const p of profiles) {
          try {
            const s = await getAstrologerStatus(p.id);
            if (s && s.status !== "canceled") rows.push({ ...s, profileName: p.name });
          } catch {
            /* skip */
          }
        }
        if (!cancelled) setSubs(rows);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [user, deviceId]);

  const cadenceLabel = (c: string) => t(`hub.cad${({ daily: "Daily", every_2_days: "Every2", every_5_days: "Every5", weekly: "Weekly", every_2_weeks: "Every2w" } as Record<string, string>)[c]}`);

  const manageButton = (s: SubRow) => (
    <Button asChild size="sm" variant="outline"><Link to={`/profile/${s.profileId}?tab=astrologer`}>{t("account.manage", "Manage")}</Link></Button>
  );

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      try { await claimProfiles(deviceId); } catch { /* ignore */ }
      window.location.reload();
    } catch { /* cancelled */ }
  }

  if (!ready) return <p className="py-12 text-center text-muted-foreground">{t("common.loading", "Loading…")}</p>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("account.title", "Your account")}</h1>
        <p className="text-sm text-muted-foreground">{t("account.signInIntro", "Sign in to manage your account, subscriptions and stars.")}</p>
        <Button onClick={handleSignIn} className="bg-primary text-primary-foreground hover:bg-[#8fb6ff]">{t("nav.signIn", "Sign in")}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("account.title", "Your account")}</h1>

      {/* Identity */}
      <div className="ds-card flex items-center gap-4 p-5">
        {user.photoURL ? <img src={user.photoURL} alt="" className="h-12 w-12 rounded-full border border-border" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">{(user.email ?? "?")[0]?.toUpperCase()}</div>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg text-foreground">{user.displayName ?? user.email}</p>
          <p className="inline-flex items-center gap-1.5 truncate text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5" />{user.email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => signOut(auth).then(() => window.location.reload())}>{t("nav.signOut", "Sign out")}</Button>
      </div>

      {/* Stars */}
      <div className="ds-card flex items-center justify-between gap-3 p-5">
        <div>
          <HelpBubble helpKey="account.balance">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("account.balance", "Star balance")}</p>
          </HelpBubble>
          <p className="font-serif text-2xl text-[#e8c969]">✦ {stars ?? "…"}</p>
        </div>
        {firstId && (
          <HelpBubble helpKey="account.buyStars" actionable label={t("account.buyStars", "Buy stars")}>
            <Button asChild className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]">
              <Link to={`/profile/${firstId}?tab=premium`}><Sparkles className="mr-1.5 h-4 w-4" />{t("account.buyStars", "Buy stars")}</Link>
            </Button>
          </HelpBubble>
        )}
      </div>

      {/* Subscriptions */}
      <div className="ds-card space-y-3 p-5">
        <HelpBubble helpKey="account.astrologers">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("account.astrologers", "Your astrologers")}</p>
        </HelpBubble>
        {subs.length === 0 && <p className="text-sm text-muted-foreground">{t("account.noSubs", "No active astrologers. Hire one from a chart's ✦ Astrologer tab.")}</p>}
        {subs.map((s, i) => (
          <div key={s.profileId} className="rounded-xl border border-border/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-serif text-foreground">{s.astrologerName} <span className="text-sm text-muted-foreground">· {s.profileName}</span></p>
              {/* The same words repeat in every row: only the first one carries the bubble. */}
              {i === 0 ? (
                <HelpBubble helpKey="account.manage" actionable label={t("account.manage", "Manage")}>
                  {manageButton(s)}
                </HelpBubble>
              ) : (
                manageButton(s)
              )}
            </div>
            <div className="mt-1.5 grid gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{cadenceLabel(s.cadence)} · {t("hub.nextLetter", "Next letter")}: {new Date(s.nextLetterAt).toLocaleDateString()}</span>
              {s.channels?.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{t("hub.emailTo", "Email to")}: {user.email}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Notifications */}
      <NotificationsCard />

      {/* Language */}
      <div className="ds-card flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted-foreground">{t("account.language", "Language")}</p>
        <LanguageSwitcher />
      </div>
    </div>
  );
}
